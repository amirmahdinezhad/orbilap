use serde_json::Value;
use std::env;
use std::fs::{self, OpenOptions};
use std::io::Write;
use std::path::{Path, PathBuf};

fn home_dir() -> PathBuf {
    dirs::home_dir().expect("home directory")
}

/// Orbilap-owned data only; provider CLI homes are resolved separately below.
pub fn app_data_dir() -> PathBuf {
    user_data_for(home_dir(), env::var("ORBILAP_OPENCODE_USERDATA").ok(), cfg!(debug_assertions))
}

fn user_data_for(home: PathBuf, override_dir: Option<String>, development: bool) -> PathBuf {
    if let Some(override_dir) = override_dir {
        if !override_dir.is_empty() {
            return PathBuf::from(override_dir);
        }
    }
    // Never fall back to OpenCode, dev storage, or an older installation after
    // this directory is removed. A reinstall must stay in onboarding.
    let identifier = if development { "com.7skylab.orbilap.dev" } else { "com.7skylab.orbilap" };
    #[cfg(target_os = "macos")]
    return home.join("Library/Application Support").join(identifier);
    #[cfg(target_os = "windows")]
    return home.join("AppData/Roaming").join(identifier);
    #[cfg(not(any(target_os = "macos", target_os = "windows")))]
    return home.join(".config").join(identifier);
}

/// Single per-machine store file (launch-at-login flag only now).
pub fn store_file() -> PathBuf {
    app_data_dir().join("agent-rtl.keys")
}

/// App-wide settings (refresh cadence, quota wording and menu-bar display).
pub fn settings_file() -> PathBuf {
    app_data_dir().join("agent-rtl.settings.json")
}

pub fn codex_home() -> PathBuf {
    if let Ok(home) = env::var("CODEX_HOME") {
        if !home.is_empty() {
            return PathBuf::from(home);
        }
    }
    home_dir().join(".codex")
}

pub fn codex_auth_file() -> PathBuf {
    codex_home().join("auth.json")
}

/// Claude Code home, honoring the CLI's own override like the CLI does.
pub fn claude_home() -> PathBuf {
    if let Ok(dir) = env::var("CLAUDE_CONFIG_DIR") {
        if !dir.trim().is_empty() {
            return PathBuf::from(dir);
        }
    }
    home_dir().join(".claude")
}

pub fn open_code_auth_file() -> PathBuf {
    if let Ok(data_home) = env::var("XDG_DATA_HOME") {
        if !data_home.is_empty() {
            return PathBuf::from(data_home).join("opencode/auth.json");
        }
    }
    #[cfg(target_os = "windows")]
    return home_dir().join(".opencode/auth.json");
    #[cfg(not(target_os = "windows"))]
    return home_dir().join(".local/share/opencode/auth.json");
}

pub fn atomic_write_json(file: &Path, data: &Value) {
    if let Some(dir) = file.parent() {
        fs::create_dir_all(dir).expect("create dir");
    }
    let parent = file.parent().unwrap_or_else(|| Path::new("."));
    let base = file
        .file_name()
        .map(|s| s.to_string_lossy().into_owned())
        .unwrap_or_else(|| "store.json".to_string());
    let tmp = parent.join(format!(".{base}.tmp-{}", uuid::Uuid::new_v4()));
    // Tab-indented like the Electron app (`JSON.stringify(data, null, '\t')`).
    let pretty = serde_json::to_string_pretty(data).expect("serialize");
    let mut body = String::with_capacity(pretty.len());
    for (i, line) in pretty.split('\n').enumerate() {
        if i > 0 {
            body.push('\n');
        }
        let spaces = line.len() - line.trim_start_matches(' ').len();
        for _ in 0..spaces / 2 {
            body.push('\t');
        }
        body.push_str(&line[spaces..]);
    }
    let mut options = OpenOptions::new();
    options.write(true).create_new(true);
    #[cfg(unix)]
    {
        use std::os::unix::fs::OpenOptionsExt;
        options.mode(0o600);
    }
    let mut staging = options.open(&tmp).expect("create private tmp");
    let result = staging.write_all(body.as_bytes()).and_then(|_| staging.sync_all());
    drop(staging);
    let result = result.and_then(|_| fs::rename(&tmp, file));
    if result.is_err() {
        let _ = fs::remove_file(&tmp);
    }
    result.expect("save private JSON");
}

pub fn read_json(file: &Path) -> Option<Value> {
    let raw = fs::read_to_string(file).ok()?;
    if raw.trim().is_empty() {
        return None;
    }
    serde_json::from_str(&raw).ok()
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn development_cannot_adopt_saved_release_accounts() {
        let home = env::temp_dir().join(format!("orbilap-paths-{}", uuid::Uuid::new_v4()));
        let release = user_data_for(home.clone(), None, false);
        let development = user_data_for(home.clone(), None, true);
        fs::create_dir_all(&release).unwrap();
        fs::write(release.join("agent-rtl.settings.json"), br#"{"workspaces":[{"id":"synthetic"}]}"#).unwrap();
        assert_eq!(release.file_name().unwrap(), "com.7skylab.orbilap");
        assert_eq!(development.file_name().unwrap(), "com.7skylab.orbilap.dev");
        assert!(read_json(&development.join("agent-rtl.settings.json")).is_none());
        assert_eq!(user_data_for(home.clone(), Some(String::new()), true), development);
        let isolated = home.join("explicit-test-storage");
        for mode in [false, true] {
            assert_eq!(user_data_for(home.clone(), Some(isolated.to_string_lossy().into_owned()), mode), isolated);
        }
        fs::remove_dir_all(home).unwrap();
    }

    #[test]
    fn removing_release_data_does_not_restore_accounts_from_other_stores() {
        use serde_json::json;
        let home = env::temp_dir().join(format!("orbilap-reinstall-{}", uuid::Uuid::new_v4()));
        let release = user_data_for(home.clone(), None, false);
        let development = user_data_for(home.clone(), None, true);
        let legacy = release.parent().unwrap().join("ai.opencode.desktop");
        let settings = json!({
            "workspaceVersion": 1, "activeWorkspaceId": "synthetic",
            "workspaces": [{"id": "synthetic", "name": "Synthetic", "accent": "#007aff", "accountIds": []}]
        });
        for dir in [&release, &development, &legacy] {
            atomic_write_json(&dir.join("agent-rtl.settings.json"), &settings);
            for provider in ["codex", "claude", "antigravity"] {
                atomic_write_json(&dir.join(format!("orbilap-{provider}-profiles/profiles.json")),
                    &json!({"profiles": [{"id": "synthetic"}]}));
            }
        }
        let cli = home.join(".codex/auth.json");
        atomic_write_json(&cli, &json!({"synthetic": true}));
        assert_eq!(crate::settings::read_settings(&release.join("agent-rtl.settings.json")).workspaces.len(), 1);

        fs::remove_dir_all(&release).unwrap();
        let reinstalled = user_data_for(home.clone(), None, false);
        assert_eq!(reinstalled, release);
        let mut fresh = crate::settings::read_settings(&reinstalled.join("agent-rtl.settings.json"));
        crate::workspaces::reconcile(&mut fresh, &crate::profiles::ProfilesState {
            profiles: vec![], active_profile_id: None, can_import: false,
            desktop_installed: false, cli_installed: false, switch_error: None,
        });
        assert!(fresh.workspaces.is_empty());
        assert!(fresh.active_workspace_id.is_none());
        for provider in ["codex", "claude", "antigravity"] {
            assert!(read_json(&reinstalled.join(format!("orbilap-{provider}-profiles/profiles.json"))).is_none());
        }
        for dir in [&development, &legacy] {
            assert_eq!(read_json(&dir.join("agent-rtl.settings.json")), Some(settings.clone()));
        }
        assert_eq!(read_json(&cli), Some(json!({"synthetic": true})));
        fs::remove_dir_all(home).unwrap();
    }
}
