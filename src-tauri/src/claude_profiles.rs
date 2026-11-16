//! Anthropic profiles use Claude Code's documented CLAUDE_CONFIG_DIR isolation.
//! Claude owns the directory and Keychain login. Orbilap stores only metadata.
use crate::{
    paths,
    profiles::{private_dir, write_private},
};
use serde::{Deserialize, Serialize};
use std::{
    path::{Path, PathBuf},
    sync::{LazyLock, Mutex},
};
static LOCK: LazyLock<Mutex<()>> = LazyLock::new(|| Mutex::new(()));

#[derive(Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ClaudeProfile {
    pub id: String,
    pub name: String,
    pub config_dir: PathBuf,
    pub created_at: String,
    #[serde(default)]
    pub email: Option<String>,
    #[serde(default)]
    pub connected: bool,
    #[serde(default)]
    pub subscription: Option<crate::subscriptions::Subscription>,
}
#[derive(Default, Serialize, Deserialize)]
struct Index {
    profiles: Vec<ClaudeProfile>,
}
#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ProfileView {
    #[serde(flatten)]
    pub profile: ClaudeProfile,
    pub active: bool,
    pub login_command: String,
    pub launch_command: String,
    pub quota: Option<crate::quota::QuotaSet>,
}
fn root() -> PathBuf {
    paths::app_data_dir().join("orbilap-claude-profiles")
}
fn read(root: &Path) -> Result<Index, String> {
    let path = root.join("profiles.json");
    match std::fs::read(path) {
        Ok(raw) => serde_json::from_slice(&raw)
            .map_err(|_| "Cannot read Anthropic profiles. Restore the profile index.".into()),
        Err(e) if e.kind() == std::io::ErrorKind::NotFound => Ok(Index::default()),
        Err(_) => Err("Cannot read Anthropic profiles. Check permissions.".into()),
    }
}
fn save(root: &Path, index: &Index) -> Result<(), String> {
    private_dir(root)?;
    write_private(
        &root.join("profiles.json"),
        &serde_json::to_value(index).map_err(|_| "Cannot encode profiles.")?,
    )
}
fn shell(path: &Path) -> String {
    format!("'{}'", path.to_string_lossy().replace('\'', "'\\''"))
}
fn views(mut index: Index) -> Vec<ProfileView> {
    index.profiles.retain(|p| !p.subscription.as_ref().is_some_and(|s| s.is_expired()));
    let current = if index.profiles.is_empty() { None } else {
        crate::account_setup::claude_reader().and_then(|binary| {
            crate::account_setup::claude_current_homes().into_iter().find_map(|(config, _)| {
                let (connected, method, email, _, subscription) = crate::cli::probe_claude_at(&binary, Some(&config));
                if connected == Some(true) && method.as_deref() == Some("claude.ai") && !subscription.is_some_and(|s| s.is_expired()) {
                    email.map(|email| (config, email))
                } else { None }
            })
        })
    };
    let mut views: Vec<_> = std::thread::scope(|scope| {
        let jobs: Vec<_> = index.profiles.into_iter().map(|mut p| scope.spawn(move || {
            let prefix = format!("CLAUDE_CONFIG_DIR={} claude", shell(&p.config_dir));
            let quota = crate::claude_usage::current_quota_in(&p.config_dir);
            p.connected = quota.error.is_none() && quota.windows.iter().flatten().any(|w| w.percent.is_finite() && (0.0..=100.0).contains(&w.percent));
            ProfileView { active: false, profile: p, login_command: format!("{prefix} auth login"), launch_command: prefix, quota: Some(quota) }
        })).collect();
        jobs.into_iter().filter_map(|job| job.join().ok()).collect()
    });
    if let Some((config, email)) = current {
        // Prefer the tracked live configuration over a copy of the same account.
        let matches = |view: &ProfileView| view.profile.email.as_deref()
            .map_or(view.profile.config_dir == config, |saved| saved.eq_ignore_ascii_case(&email));
        let active = views.iter().position(|view| view.profile.config_dir == config && matches(view))
            .or_else(|| views.iter().position(matches));
        if let Some(index) = active { views[index].active = true; }
    }
    views
}
/// Recheck each saved session independently; a cached success never masks a live failure.
pub fn list() -> Result<Vec<ProfileView>, String> {
    let index = { let _guard = LOCK.lock().map_err(|_| "Profile storage is busy.")?; read(&root())? };
    Ok(views(index))
}

pub(crate) fn saved_ids() -> Result<Vec<String>, String> {
    let _guard = LOCK.lock().map_err(|_| "Profile storage is busy.")?;
    Ok(read(&root())?.profiles.into_iter()
        .filter(|p| !p.subscription.as_ref().is_some_and(|s| s.is_expired()))
        .map(|p| p.id).collect())
}

pub(crate) fn device_email(id: &str) -> Result<String, String> {
    let _guard = LOCK.lock().map_err(|_| "Profile storage is busy.")?;
    read(&root())?.profiles.into_iter().find(|profile| profile.id == id).and_then(|profile| profile.email)
        .map(|email| email.to_lowercase()).ok_or_else(|| "Account identity is unavailable.".into())
}

pub(crate) fn purge_expired() -> Result<(Vec<String>, bool), String> {
    let _guard = LOCK.lock().map_err(|_| "Profile storage is busy.")?;
    let root = root();
    let mut index = read(&root)?;
    let expired: Vec<_> = index.profiles.iter()
        .filter(|profile| profile.subscription.as_ref().is_some_and(|s| s.is_expired()))
        .collect();
    let changed = !expired.is_empty();
    if changed {
        for profile in expired {
            if !index.profiles.iter().any(|other| other.id != profile.id && other.config_dir == profile.config_dir
                && !other.subscription.as_ref().is_some_and(|s| s.is_expired())) {
                remove_managed_config(&root, &profile.config_dir)?;
            }
        }
        index.profiles.retain(|profile| !profile.subscription.as_ref().is_some_and(|s| s.is_expired()));
        save(&root, &index)?;
    }
    Ok((index.profiles.into_iter().map(|profile| profile.id).collect(), changed))
}

/// Refresh billing evidence without holding the workspace lock during CLI calls.
pub(crate) fn refresh_subscription_expiry() -> Result<(), String> {
    let Some(binary) = crate::account_setup::claude_reader() else { return Ok(()); };
    let root = root();
    let profiles = {
        let _guard = LOCK.lock().map_err(|_| "Profile storage is busy.")?;
        read(&root)?.profiles
    };
    for batch in profiles.chunks(4) {
        let updates = std::thread::scope(|scope| {
            let jobs: Vec<_> = batch.iter().map(|profile| {
                let binary = &binary;
                scope.spawn(move || {
                    let (_, _, email, _, subscription) = crate::cli::probe_claude_at(binary, Some(&profile.config_dir));
                    let same_email = profile.email.as_ref().zip(email.as_ref())
                        .is_some_and(|(saved, fresh)| saved.eq_ignore_ascii_case(fresh));
                    let subscription = subscription.filter(|s| same_email && (s.is_expired() || s.expires_at.is_some()))?;
                    Some((profile, subscription))
                })
            }).collect();
            jobs.into_iter().filter_map(|job| job.join().ok().flatten()).collect::<Vec<_>>()
        });
        if updates.is_empty() { continue; }
        let _guard = LOCK.lock().map_err(|_| "Profile storage is busy.")?;
        let mut index = read(&root)?;
        let mut changed = false;
        for (observed, subscription) in updates {
            if let Some(target) = index.profiles.iter_mut().find(|p| p.id == observed.id
                && p.config_dir == observed.config_dir && p.email == observed.email
                && p.subscription == observed.subscription) {
                if target.subscription.as_ref() != Some(&subscription) {
                    target.subscription = Some(subscription);
                    changed = true;
                }
            }
        }
        if changed { save(&root, &index)?; }
    }
    Ok(())
}

fn remove_managed_config(root: &Path, home: &Path) -> Result<(), String> {
    let default = dirs::home_dir().unwrap_or_default().join(".claude");
    let current = paths::claude_home();
    let same_config = |path: &Path| {
        home == path || home.canonicalize().ok().zip(path.canonicalize().ok())
            .is_some_and(|(a, b)| a == b)
    };
    if !same_config(&default) && !same_config(&current)
        && app_owned_config(home, &[root.to_path_buf(), paths::app_data_dir().join("orbilap-login-homes")], &current) {
        #[cfg(target_os = "macos")]
        crate::claude_usage::delete_profile_keychain_login(home)?;
        crate::profiles::remove_account_home(home)?;
    }
    Ok(())
}
/// Resolve a saved profile by id before reading its own usage credentials.
/// An omitted id selects the default CLI configuration.
pub fn quota(id: Option<&str>) -> Result<crate::quota::QuotaSet, String> {
    let config = if let Some(id) = id {
        let _guard = LOCK.lock().map_err(|_| "Profile storage is busy.")?;
        read(&root())?.profiles.into_iter().find(|p| p.id == id)
            .filter(|p| !p.subscription.as_ref().is_some_and(|s| s.is_expired()))
            .ok_or("Profile no longer exists.")?.config_dir
    } else { paths::claude_home() };
    Ok(crate::claude_usage::live_quota_in(&config))
}

fn create_in(root: &Path, current: &Path, raw: &str, use_current: bool) -> Result<(), String> {
    let mut index = read(root)?;
    let id = uuid::Uuid::new_v4().to_string();
    let name = if raw.trim().is_empty() {
        format!("Curious Otter {}", &id[..4])
    } else {
        raw.trim().to_owned()
    };
    validate_name(&name)?;
    if index
        .profiles
        .iter()
        .any(|p| p.name.eq_ignore_ascii_case(&name))
    {
        return Err("A profile with this name already exists.".into());
    }
    let config = if use_current {
        current.to_path_buf()
    } else {
        root.join(&id)
    };
    if index.profiles.iter().any(|p| p.config_dir == config) {
        return Err("The current Claude configuration is already saved.".into());
    }
    if !use_current {
        private_dir(&config)?;
    }
    index.profiles.push(ClaudeProfile {
        id,
        name,
        config_dir: config,
        created_at: chrono::Utc::now().to_rfc3339(),
        email: None,
        connected: false,
        subscription: None,
    });
    save(root, &index)
}
fn validate_name(name: &str) -> Result<(), String> {
    if name.is_empty() || name.chars().count() > 64 || name.chars().any(char::is_control) {
        Err("Use a profile name with 1–64 characters.".into())
    } else {
        Ok(())
    }
}
/// Add an isolated config or track the current CLI config without copying secrets.
pub fn create(name: &str, use_current: bool) -> Result<Vec<ProfileView>, String> {
    let _guard = LOCK.lock().map_err(|_| "Profile storage is busy.")?;
    create_in(&root(), &paths::claude_home(), name, use_current)?;
    Ok(views(read(&root())?))
}
/// Probe only the requested CLI configuration; credentials remain with Claude.
pub fn rescan(id: &str) -> Result<Vec<ProfileView>, String> {
    let profile = {
        let _guard = LOCK.lock().map_err(|_| "Profile storage is busy.")?;
        read(&root())?
            .profiles
            .into_iter()
            .find(|p| p.id == id)
            .ok_or("Profile no longer exists.")?
    };
    let binary = crate::account_setup::claude_reader()
        .ok_or("Install Claude Code before checking this profile.")?;
    let (connected, _, email, _, subscription) =
        crate::cli::probe_claude_at(&binary, Some(&profile.config_dir));
    let connected = connected.ok_or("Claude did not return a connection status. Try again.")?;
    let _guard = LOCK.lock().map_err(|_| "Profile storage is busy.")?;
    let mut index = read(&root())?;
    let target = index
        .profiles
        .iter_mut()
        .find(|p| p.id == id)
        .ok_or("Profile no longer exists.")?;
    target.connected = connected;
    target.email = email;
    target.subscription = subscription;
    save(&root(), &index)?;
    Ok(views(index))
}
/// Rename or forget a tracked profile; its CLI-owned login/history are preserved.
pub fn edit(id: &str, name: Option<&str>) -> Result<Vec<ProfileView>, String> {
    edit_profile(id, name, false)
}

/// Explicit global forgetting also clears app-owned login storage, never a connected external config.
pub fn forget(id: &str) -> Result<Vec<ProfileView>, String> {
    edit_profile(id, None, true)
}

fn app_owned_config(home: &Path, managed_roots: &[PathBuf], current: &Path) -> bool {
    managed_roots.iter().any(|parent| home.parent() == Some(parent.as_path())
        && std::fs::symlink_metadata(parent).is_ok_and(|metadata| metadata.is_dir()))
        && home.file_name().and_then(|name| name.to_str()).is_some_and(|name| uuid::Uuid::parse_str(name).is_ok())
        && home != current
        && std::fs::symlink_metadata(home).is_ok_and(|metadata| metadata.is_dir())
}

fn edit_profile(id: &str, name: Option<&str>, cleanup: bool) -> Result<Vec<ProfileView>, String> {
    let _guard = LOCK.lock().map_err(|_| "Profile storage is busy.")?;
    let mut index = read(&root())?;
    if !index.profiles.iter().any(|p| p.id == id) {
        return Err("Profile no longer exists.".into());
    }
    let forgotten_home = if cleanup && name.is_none() { index.profiles.iter().find(|p| p.id == id).map(|p| p.config_dir.clone()) } else { None };
    if let Some(name) = name {
        let name = name.trim();
        validate_name(name)?;
        if index
            .profiles
            .iter()
            .any(|p| p.id != id && p.name.eq_ignore_ascii_case(name))
        {
            return Err("A profile with this name already exists.".into());
        }
        index.profiles.iter_mut().find(|p| p.id == id).unwrap().name = name.into();
    } else {
        index.profiles.retain(|p| p.id != id);
    }
    if let Some(home) = forgotten_home {
        // Forget only our isolated storage. Existing CLI configurations are references.
        if !index.profiles.iter().any(|profile| profile.config_dir == home) {
            remove_managed_config(&root(), &home)?;
        }
    }
    save(&root(), &index)?;
    Ok(views(index))
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn cleanup_scope_excludes_external_current_and_symlinked_configurations() {
        let temp=std::env::temp_dir().join(format!("orbilap-claude-cleanup-{}",uuid::Uuid::new_v4()));
        let root=temp.join("managed");let owned=root.join(uuid::Uuid::new_v4().to_string());let external=temp.join("external");
        std::fs::create_dir_all(&owned).unwrap();std::fs::create_dir_all(&external).unwrap();let roots=vec![root.clone()];
        assert!(app_owned_config(&owned,&roots,&external));
        assert!(!app_owned_config(&external,&roots,&external));assert!(!app_owned_config(&owned,&roots,&owned));
        assert!(!app_owned_config(&root,&roots,&external));
        #[cfg(unix)] {let link=root.join(uuid::Uuid::new_v4().to_string());std::os::unix::fs::symlink(&external,&link).unwrap();assert!(!app_owned_config(&link,&roots,&external));}
        std::fs::remove_dir_all(temp).unwrap();
    }
    #[test]
    fn isolated_profiles_have_private_directories_and_current_profile_is_a_reference() {
        let temp = std::env::temp_dir().join(format!("orbilap-claude-{}", uuid::Uuid::new_v4()));
        let current = temp.join("current");
        let root = temp.join("profiles");
        std::fs::create_dir_all(&current).unwrap();
        std::fs::write(current.join("settings.json"), "{}").unwrap();
        create_in(&root, &current, "", false).unwrap();
        create_in(&root, &current, "Personal", true).unwrap();
        let index = read(&root).unwrap();
        assert_eq!(index.profiles.len(), 2);
        assert_ne!(index.profiles[0].config_dir, current);
        assert_eq!(index.profiles[1].config_dir, current);
        assert!(create_in(&root, &current, "Duplicate", true).is_err());
        assert_eq!(
            std::fs::read_to_string(current.join("settings.json")).unwrap(),
            "{}"
        );
        #[cfg(unix)]
        {
            use std::os::unix::fs::PermissionsExt;
            assert_eq!(
                std::fs::metadata(&index.profiles[0].config_dir)
                    .unwrap()
                    .permissions()
                    .mode()
                    & 0o777,
                0o700
            );
            assert_eq!(
                std::fs::metadata(root.join("profiles.json"))
                    .unwrap()
                    .permissions()
                    .mode()
                    & 0o777,
                0o600
            );
        }
        std::fs::remove_dir_all(temp).unwrap();
    }
}

/// Adopt a CLI-owned configuration only after sign-in and paid-plan verification.
pub(crate) fn adopt_config(name: &str, config: &Path, email: Option<String>, subscription: crate::subscriptions::Subscription) -> Result<(String, bool), String> {
    if subscription.is_expired() { return Err("This Claude subscription has expired.".into()); }
    let _guard = LOCK.lock().map_err(|_| "Profile storage is busy.")?;
    let mut index = read(&root())?;
    if let Some(profile) = index.profiles.iter().find(|p| p.config_dir == config) { return Ok((profile.id.clone(), false)); }
    let name = name.trim(); validate_name(name)?;
    let id = uuid::Uuid::new_v4().to_string();
    index.profiles.push(ClaudeProfile { id: id.clone(), name: name.into(), config_dir: config.into(), created_at: chrono::Utc::now().to_rfc3339(), email, connected: true, subscription: Some(subscription) });
    save(&root(), &index)?;
    Ok((id, true))
}

/// Read saved metadata only; discovery must not probe every other account.
pub(crate) fn contains_setup_email(email: &str) -> Result<bool, String> {
    let _guard = LOCK.lock().map_err(|_| "Profile storage is busy.")?;
    Ok(read(&root())?.profiles.iter().any(|profile|
        profile.email.as_deref().is_some_and(|saved| saved.eq_ignore_ascii_case(email))))
}
