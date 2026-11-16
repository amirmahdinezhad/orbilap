//! Workspace metadata and membership. Credentials remain in the profile repository.
use serde::{Deserialize, Serialize};
use crate::{paths, profiles, settings::{self, AppSettings, CodexDisplayMode}};

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", default)]
pub struct WorkspaceUsage {
    pub menu_bar_enabled: bool,
    pub display_mode: CodexDisplayMode,
    pub menu_bar_provider: String,
    /// None keeps the legacy source; an explicit empty list hides all providers.
    pub menu_bar_providers: Option<Vec<String>>,
    pub menu_bar_account_id: Option<String>,
    pub show_provider_logos: Option<bool>,
    pub show_app_logo: bool,
    pub menu_bar_style: settings::MenuBarStyle,
    pub default_menu_bar_limits: bool,
    pub account_windows: std::collections::BTreeMap<String, Vec<String>>,
    pub warning_colors: bool,
    pub warning_thresholds: Option<Vec<u8>>,
    pub show_account_name: Option<bool>,
    pub auto_switch_remaining: u8,
    pub antigravity_auto_switch: bool,
    pub antigravity_switch_remaining: u8,
    pub antigravity_switch_accounts: std::collections::BTreeSet<String>,
    pub active_accounts: std::collections::BTreeMap<String, String>,
    pub show_remaining: bool,
    pub auto_switch_enabled: bool,
    pub show_codex_resets: bool,
    pub show_probable_resets: bool,
}
impl Default for WorkspaceUsage {
    fn default() -> Self {
        Self { menu_bar_enabled: true, display_mode: CodexDisplayMode::Active,
            menu_bar_provider: "codex".into(), menu_bar_providers: None, menu_bar_account_id: None, menu_bar_style: Default::default(), show_provider_logos: None, default_menu_bar_limits: false, account_windows: Default::default(), warning_colors: false, warning_thresholds: None, show_account_name: None, auto_switch_remaining: 2, active_accounts: Default::default(),
            show_remaining: true, show_app_logo: true, auto_switch_enabled: false,
            antigravity_auto_switch: false, antigravity_switch_remaining: 2,
            antigravity_switch_accounts: Default::default(),
            show_codex_resets: true, show_probable_resets: true }
    }
}

impl WorkspaceUsage {
    fn new_workspace() -> Self {
        Self {
            menu_bar_style: settings::MenuBarStyle::ResetTimeline,
            default_menu_bar_limits: true,
            ..Self::default()
        }
    }
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Workspace {
    pub id: String,
    pub name: String,
    pub accent: String,
    pub account_ids: Vec<String>,
    /// None preserves visibility for workspaces made before provider selection.
    #[serde(default)]
    pub provider_ids: Option<Vec<String>>,
    #[serde(default)]
    pub claude_account_ids: Option<Vec<String>>,
    #[serde(default)]
    pub antigravity_account_ids: Vec<String>,
    #[serde(default)]
    pub account_preferences: Option<std::collections::BTreeMap<String, settings::CodexAccountPreferences>>,
    #[serde(default)]
    pub usage: WorkspaceUsage,
}

impl Workspace {
    fn has_provider_accounts(&self, provider: &str) -> bool {
        match provider {
            "codex" => !self.account_ids.is_empty(),
            "claude" => self.claude_account_ids.as_ref().map_or(self.provider_ids.as_ref().is_none_or(|ids| ids.iter().any(|id| id == "claude")), |ids| !ids.is_empty()),
            "antigravity" => !self.antigravity_account_ids.is_empty(),
            _ => false,
        }
    }
    /// Stable provider order, independent of selection or request completion order.
    pub fn menu_bar_providers(&self) -> Vec<&str> {
        match &self.usage.menu_bar_providers {
            None => vec![self.menu_bar_provider()],
            Some(selected) => ["codex", "claude", "antigravity"].into_iter()
                .filter(|provider| selected.iter().any(|p| p == provider) && self.has_provider_accounts(provider)).collect(),
        }
    }
    pub fn shows_menu_bar_provider(&self, provider: &str) -> bool {
        self.usage.menu_bar_enabled && self.menu_bar_providers().contains(&provider)
    }
    /// Resolve legacy settings to one deterministic, workspace-owned display source.
    pub fn menu_bar_provider(&self) -> &str {
        if self.has_provider_accounts(&self.usage.menu_bar_provider) { return &self.usage.menu_bar_provider; }
        ["codex", "claude", "antigravity"].into_iter().find(|p| self.has_provider_accounts(p)).unwrap_or("codex")
    }
    pub fn menu_bar_account_id(&self) -> Option<&str> {
        let ids = match self.menu_bar_provider() {
            "codex" => &self.account_ids,
            "claude" => self.claude_account_ids.as_ref()?,
            "antigravity" => &self.antigravity_account_ids,
            _ => return None,
        };
        self.usage.menu_bar_account_id.as_deref().filter(|id| ids.iter().any(|member| member == id))
            .or_else(|| self.usage.active_accounts.get(self.menu_bar_provider()).map(String::as_str).filter(|id| ids.iter().any(|member| member == id)))
            .or_else(|| ids.first().map(String::as_str))
    }
}

fn label(raw: &str) -> Result<String, String> {
    let name = raw.trim();
    if name.is_empty() || name.chars().count() > 64 || name.chars().any(char::is_control) {
        return Err("Use a workspace name with 1–64 characters.".into());
    }
    Ok(name.into())
}

fn color(raw: &str) -> Result<String, String> {
    let value = raw.trim().to_ascii_lowercase();
    if value.len() != 7 || !value.starts_with('#') || !value[1..].bytes().all(|c| c.is_ascii_hexdigit()) {
        return Err("Use a six-digit hex accent, such as #007aff.".into());
    }
    Ok(value)
}

fn validate(app: &AppSettings, name: &str, except: Option<&str>) -> Result<String, String> {
    let name = label(name)?;
    if app.workspaces.iter().any(|w| Some(w.id.as_str()) != except && w.name.to_lowercase() == name.to_lowercase()) {
        return Err("A workspace with this name already exists.".into());
    }
    Ok(name)
}

/// Migrate once, then reconcile additions/removals from legacy profile commands.
pub fn reconcile(app: &mut AppSettings, accounts: &profiles::ProfilesState) {
    let ids: Vec<_> = accounts.profiles.iter().map(|p| p.id.clone()).collect();
    if app.workspace_version == 0 {
        app.workspace_version = 1;
        if !ids.is_empty() {
            let workspace = Workspace {
                id: uuid::Uuid::new_v4().to_string(), name: "Personal".into(), accent: "#007aff".into(),
                account_ids: ids.clone(), provider_ids: None, claude_account_ids: None, antigravity_account_ids: vec![], account_preferences: Some(app.codex_accounts.clone()), usage: WorkspaceUsage {
                    menu_bar_enabled: app.menu_bar_enabled && app.menu_bar_provider == settings::MenuBarProvider::Codex,
                    display_mode: app.codex_display_mode,
                    auto_switch_enabled: app.codex_accounts.values().filter(|p| p.auto_switch).count() >= 2,
                    show_probable_resets: app.codex_reset.show_probable_resets,
                    ..Default::default()
                },
            };
            app.active_workspace_id = Some(workspace.id.clone());
            app.workspaces.push(workspace);
        }
        if app.menu_bar_provider == settings::MenuBarProvider::Codex {
            app.menu_bar_enabled = false;
            app.menu_bar_provider = settings::MenuBarProvider::Claude;
        }
    }
    let mut assigned = std::collections::BTreeSet::new();
    for workspace in &mut app.workspaces {
        let mut local = std::collections::BTreeSet::new();
        workspace.account_ids.retain(|id| ids.contains(id) && local.insert(id.clone()));
        assigned.extend(workspace.account_ids.iter().cloned());
    }
    if !app.workspaces.iter().any(|w| Some(&w.id) == app.active_workspace_id.as_ref()) {
        app.active_workspace_id = app.workspaces.first().map(|w| w.id.clone());
    }
    if let Some(workspace) = app.workspaces.iter_mut().find(|w| Some(&w.id) == app.active_workspace_id.as_ref()) {
        if workspace.provider_ids.is_none() { workspace.account_ids.extend(ids.into_iter().filter(|id| !assigned.contains(id))); }
    }
}

/// Migrate saved profiles only; an unsaved CLI login waits for explicit step-two selection.
pub fn initialize() -> Result<bool, String> {
    static INITIALIZE: std::sync::LazyLock<std::sync::Mutex<()>> = std::sync::LazyLock::new(|| std::sync::Mutex::new(()));
    let _guard = INITIALIZE.lock().unwrap_or_else(|e| e.into_inner());
    let removed = purge_saved_accounts(false)?;
    let accounts = profiles::list()?;
    settings::update_settings_if_changed(&paths::settings_file(), |app| { reconcile(app, &accounts); Ok(()) })?;
    Ok(removed)
}

/// Reconcile account indexes and all persisted references under the settings lock.
/// Workspace imports take locks in the same order.
pub(crate) fn purge_expired_accounts() -> Result<bool, String> {
    if let Err(error) = crate::claude_profiles::refresh_subscription_expiry() {
        eprintln!("[orbilap] Cannot refresh Claude subscription expiry: {error}");
    }
    let (no_opencode_go, removed) = match crate::cli::purge_expired_opencode_go() {
        Ok(result) => result,
        Err(error) => { eprintln!("[orbilap] OpenCode account cleanup failed: {error}"); (false, false) }
    };
    let changed = purge_saved_accounts(no_opencode_go)?;
    Ok(removed || changed)
}

fn purge_saved_accounts(no_opencode_go: bool) -> Result<bool, String> {
    let (_, changed) = settings::update_settings_if_changed(&paths::settings_file(), |app| {
        let before = app.clone();
        let mut changed = false;
        let mut complete = true;
        let mut known_ids = Vec::new();
        for (provider, result) in [
            ("codex", profiles::purge_expired()),
            ("claude", crate::claude_profiles::purge_expired()),
            ("antigravity", crate::antigravity::purge_expired()),
        ] {
            match result {
                Ok((ids, removed)) => {
                    changed |= removed;
                    prune_account_references(app, provider, &ids);
                    known_ids.extend(ids);
                }
                Err(error) => {
                    complete = false;
                    eprintln!("[orbilap] {provider} account cleanup failed: {error}");
                }
            }
        }
        if complete {
            prune_shared_account_references(app, &known_ids);
        }
        if no_opencode_go {
            app.provider_accents.remove("opencode-go");
            if app.menu_bar_provider == settings::MenuBarProvider::OpencodeGo {
                app.menu_bar_enabled = false;
                app.menu_bar_provider = settings::MenuBarProvider::default();
            }
        }
        app.project_workspace_preferences();
        Ok(changed || *app != before)
    })?;
    Ok(changed)
}

fn prune_account_references(app: &mut AppSettings, provider: &str, ids: &[String]) {
    for workspace in &mut app.workspaces {
        let members = match provider {
            "codex" => Some(&mut workspace.account_ids),
            "claude" => workspace.claude_account_ids.as_mut(),
            "antigravity" => Some(&mut workspace.antigravity_account_ids),
            _ => unreachable!(),
        };
        if let Some(members) = members {
            members.retain(|id| ids.contains(id));
        }
        if provider == "codex" {
            if let Some(prefs) = &mut workspace.account_preferences {
                prefs.retain(|id, _| ids.contains(id));
            }
        }
        if workspace.usage.active_accounts.get(provider).is_some_and(|id| !ids.contains(id)) {
            workspace.usage.active_accounts.remove(provider);
        }
    }
    if provider == "codex" {
        app.codex_accounts.retain(|id, _| ids.contains(id));
    }
}

/// Only IDs with a persisted reference need to be checked for orphaned shared settings.
fn prune_shared_account_references(app: &mut AppSettings, known_ids: &[String]) {
    app.multi_profile.selected_ids.retain(|id| known_ids.contains(id));
    for workspace in &mut app.workspaces {
        workspace.usage.account_windows.retain(|id, _| known_ids.contains(id));
        if workspace.usage.menu_bar_account_id.as_ref().is_some_and(|id| !known_ids.contains(id)) {
            workspace.usage.menu_bar_account_id = None;
        }
    }
}

/// Import and assign under the settings lock. Validation never activates the account.
pub fn import_account(workspace_id: Option<String>, name: String, accent: Option<String>, account_name: String,
    credentials: Option<String>, path: Option<String>) -> Result<AppSettings, String> {
    import_selected_account(workspace_id, name, accent, account_name, credentials, path, None)
}

pub fn import_selected_account(workspace_id: Option<String>, name: String, accent: Option<String>, account_name: String,
    credentials: Option<String>, path: Option<String>, provider_ids: Option<Vec<String>>) -> Result<AppSettings, String> {
    let mut imported_id = None;
    let result = settings::update_settings(&paths::settings_file(), |app| {
        let new_workspace = if let Some(id) = &workspace_id {
            if !app.workspaces.iter().any(|w| &w.id == id) { return Err("This workspace no longer exists.".into()); }
            None
        } else {
            Some((validate(app, &name, None)?, color(accent.as_deref().unwrap_or("#007aff"))?))
        };
        let before = profiles::list()?;
        let imported = match (credentials, path) {
            (Some(json), None) => profiles::import_json(&account_name, &json, None)?,
            (None, Some(path)) => profiles::import_file(&account_name, &crate::resolve_import_path(&path)?, None)?,
            _ => return Err("Paste auth.json or enter its full file path.".into()),
        };
        let account = imported.profiles.iter().find(|p| !before.profiles.iter().any(|old| old.id == p.id))
            .ok_or("The imported account could not be saved.")?;
        imported_id = Some(account.id.clone());
        if let Some((name, accent)) = new_workspace {
            let id = uuid::Uuid::new_v4().to_string();
            app.workspaces.push(Workspace { id: id.clone(), name, accent, account_ids: vec![account.id.clone()], provider_ids: Some(provider_ids.unwrap_or_default()), claude_account_ids: None, antigravity_account_ids: vec![], account_preferences: None, usage: WorkspaceUsage::new_workspace() });
            app.active_workspace_id = Some(id);
        } else if let Some(workspace) = app.workspaces.iter_mut().find(|w| Some(&w.id) == workspace_id.as_ref()) {
            workspace.account_ids.push(account.id.clone());
        }
        app.workspace_version = 1;
        Ok(())
    });
    match result {
        Ok((saved, ())) => Ok(saved),
        Err(error) => {
            if let Some(id) = imported_id { let _ = profiles::remove(&id); }
            Err(error)
        }
    }
}

/// CLI-owned accounts (Claude, Codex and OpenCode) need no copied Codex profile.
pub fn create_for_cli(name: &str, accent: &str, provider_ids: Vec<String>) -> Result<AppSettings, String> {
    let (saved, ()) = settings::update_settings(&paths::settings_file(), |app| {
        let name = validate(app, name, None)?;
        let accent = color(accent)?;
        let id = uuid::Uuid::new_v4().to_string();
        app.workspaces.push(Workspace { id: id.clone(), name, accent, account_ids: vec![], provider_ids: Some(provider_ids), claude_account_ids: None, antigravity_account_ids: vec![], account_preferences: None, usage: WorkspaceUsage::new_workspace() });
        app.active_workspace_id = Some(id);
        app.workspace_version = 1;
        Ok(())
    })?;
    Ok(saved)
}

/// Explicitly adding a provider later extends only the selected workspace's visibility.
pub fn include_provider(id: &str, provider: &str) -> Result<AppSettings, String> {
    if !matches!(provider, "codex" | "claude" | "opencode") { return Err("Unknown CLI provider.".into()); }
    let (saved, ()) = settings::update_settings(&paths::settings_file(), |app| {
        let workspace = app.workspaces.iter_mut().find(|w| w.id == id).ok_or("This workspace no longer exists.")?;
        if let Some(ids) = &mut workspace.provider_ids {
            if !ids.iter().any(|id| id == provider) { ids.push(provider.into()); }
        }
        Ok(())
    })?;
    Ok(saved)
}

pub fn edit(id: &str, name: &str, accent: &str, usage: WorkspaceUsage) -> Result<AppSettings, String> {
    let (saved, ()) = settings::update_settings(&paths::settings_file(), |app| {
        if usage.antigravity_switch_remaining > 100 { return Err("Invalid usage preferences.".into()); }
        if !matches!(usage.menu_bar_provider.as_str(), "codex" | "claude" | "antigravity") || usage.menu_bar_providers.as_ref().is_some_and(|providers| providers.len() > 3 || providers.iter().any(|p| !matches!(p.as_str(), "codex" | "claude" | "antigravity"))) || usage.auto_switch_remaining > 100 { return Err("Invalid usage preferences.".into()); }
        let name = validate(app, name, Some(id))?;
        let accent = color(accent)?;
        let workspace = app.workspaces.iter_mut().find(|w| w.id == id).ok_or("This workspace no longer exists.")?;
        workspace.name = name; workspace.accent = accent; workspace.usage = usage;
        let members = workspace.account_ids.iter().chain(workspace.claude_account_ids.iter().flatten())
            .chain(&workspace.antigravity_account_ids);
        let members: std::collections::BTreeSet<_> = members.cloned().collect();
        if workspace.claude_account_ids.is_some() {
            workspace.usage.account_windows.retain(|id, _| members.contains(id));
            if workspace.usage.menu_bar_account_id.as_ref().is_some_and(|id| !members.contains(id)) {
                workspace.usage.menu_bar_account_id = None;
            }
        }
        reconcile_active_accounts(workspace, &Default::default());
        Ok(())
    })?;
    Ok(saved)
}

/// Selecting a workspace changes view/display policy, never active credentials.
pub fn select(id: &str) -> Result<AppSettings, String> {
    let (saved, ()) = settings::update_settings(&paths::settings_file(), |app| {
        if !app.workspaces.iter().any(|w| w.id == id) { return Err("This workspace no longer exists.".into()); }
        app.active_workspace_id = Some(id.into()); Ok(())
    })?;
    Ok(saved)
}

/// Delete metadata only. The account repositories and live CLI sessions stay intact.
pub fn delete(id: &str) -> Result<AppSettings, String> {
    let (saved, ()) = settings::update_settings(&paths::settings_file(), |app| delete_from_settings(app, id))?;
    Ok(saved)
}

fn delete_from_settings(app: &mut AppSettings, id: &str) -> Result<(), String> {
    let index = app.workspaces.iter().position(|w| w.id == id).ok_or("This workspace no longer exists.")?;
    app.workspaces.remove(index);
    app.workspace_version = 1;
    if app.active_workspace_id.as_deref() == Some(id) {
        app.active_workspace_id = app.workspaces.first().map(|w| w.id.clone());
    }
    // Legacy workspaces used to absorb every unassigned Codex profile. Freeze
    // their current visibility so deletion cannot move the removed memberships.
    for workspace in &mut app.workspaces {
        if workspace.provider_ids.is_none() {
            workspace.provider_ids = Some(vec!["codex".into(), "claude".into(), "antigravity".into(), "opencode".into(), "opencode-go".into()]);
        }
    }
    app.project_workspace_preferences();
    Ok(())
}

pub fn move_account(id: &str, target: &str) -> Result<AppSettings, String> {
    let (saved, ()) = settings::update_settings(&paths::settings_file(), |app| {
        reassign(app, id, target)
    })?;
    Ok(saved)
}

fn reassign(app: &mut AppSettings, id: &str, target: &str) -> Result<(), String> {
        if !app.workspaces.iter().any(|w| w.id == target) { return Err("This workspace no longer exists.".into()); }
        if !app.workspaces.iter().any(|w| w.account_ids.iter().any(|account| account == id)) { return Err("This account no longer exists.".into()); }
        for workspace in &mut app.workspaces { workspace.account_ids.retain(|account| account != id); }
        app.workspaces.iter_mut().find(|w| w.id == target).unwrap().account_ids.push(id.into());
        Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn deleting_workspace_preserves_accounts_and_survives_reconciliation() {
        let data = profiles::ProfilesState { profiles: vec![account("saved")], ..accounts() };
        let mut app = AppSettings::default();
        reconcile(&mut app, &data);
        let first = app.workspaces[0].clone();
        let mut other = first.clone();
        other.id = "other".into(); other.name = "Other".into(); other.account_ids.clear();
        app.workspaces.push(other);
        delete_from_settings(&mut app, &first.id).unwrap();
        assert_eq!(app.active_workspace_id.as_deref(), Some("other"));
        reconcile(&mut app, &data);
        assert!(app.workspaces[0].account_ids.is_empty());
        let before = app.clone();
        assert!(delete_from_settings(&mut app, "missing").is_err());
        assert_eq!(app, before);
        delete_from_settings(&mut app, "other").unwrap();
        reconcile(&mut app, &data);
        assert!(app.workspaces.is_empty());
        assert!(app.active_workspace_id.is_none());
        assert_eq!(app.workspace_version, 1);
    }

    #[test]
    fn deleting_inactive_workspace_keeps_current_selection_and_membership() {
        let mut app = AppSettings::default();
        reconcile(&mut app, &profiles::ProfilesState { profiles: vec![account("saved")], ..accounts() });
        let current = app.workspaces[0].clone();
        let mut other = current.clone(); other.id = "other".into();
        app.workspaces.push(other);
        delete_from_settings(&mut app, "other").unwrap();
        assert_eq!(app.active_workspace_id.as_deref(), Some(current.id.as_str()));
        assert_eq!(app.workspaces[0].account_ids, current.account_ids);
    }

    #[test]
    fn multi_provider_switches_carry_only_the_same_providers_limits() {
        let workspace = serde_json::from_value(serde_json::json!({"id":"studio","name":"Studio","accent":"#007aff",
            "accountIds":["cx-old","cx-new"],"claudeAccountIds":["cl-old","cl-new"],"antigravityAccountIds":["ag"],
            "usage":{"menuBarProvider":"antigravity","menuBarAccountId":"ag","menuBarProviders":["codex","claude","antigravity"],
                "activeAccounts":{"codex":"cx-old","claude":"cl-old","antigravity":"ag"},
                "accountWindows":{"cx-old":["5-hour"],"cl-old":["weekly"],"ag":["Gemini 4 Carbon · Weekly"]}}
        })).unwrap();
        let mut app = AppSettings { workspaces: vec![workspace], active_workspace_id: Some("studio".into()), ..Default::default() };
        record_account_switch(&mut app,"codex","cx-new");
        record_account_switch(&mut app,"claude","cl-new");
        assert_eq!(app.workspaces[0].usage.account_windows["cx-new"],["5-hour"]);
        assert_eq!(app.workspaces[0].usage.account_windows["cl-new"],["weekly"]);
        assert_eq!(app.workspaces[0].usage.menu_bar_account_id.as_deref(),Some("ag"));
    }

    #[test]
    fn multi_provider_selection_round_trips_and_preserves_legacy_sources() {
        let mut workspace: Workspace = serde_json::from_value(serde_json::json!({
            "id":"studio", "name":"Studio", "accent":"#007aff", "accountIds":["cx"],
            "claudeAccountIds":["cl"], "antigravityAccountIds":["ag"], "usage":{"menuBarProvider":"claude"}
        })).unwrap();
        assert_eq!(workspace.menu_bar_providers(), ["claude"]);
        workspace.usage.menu_bar_providers = Some(vec!["antigravity".into(),"codex".into(),"claude".into(),"codex".into(),"unknown".into()]);
        assert_eq!(workspace.menu_bar_providers(), ["codex","claude","antigravity"]);
        workspace.claude_account_ids = Some(vec![]);
        assert_eq!(workspace.menu_bar_providers(), ["codex","antigravity"]);
        workspace.usage.menu_bar_providers = Some(vec![]);
        let saved: Workspace = serde_json::from_value(serde_json::to_value(&workspace).unwrap()).unwrap();
        assert!(saved.menu_bar_providers().is_empty());
        assert!(!saved.shows_menu_bar_provider("codex"));
    }

    #[test]
    fn expiry_cleanup_erases_account_references_in_every_workspace() {
        let live = "8106456f-62ef-41a4-a9be-b7c173715e91";
        let mut app = AppSettings::default();
        app.active_workspace_id = Some("studio".into());
        app.multi_profile.selected_ids = vec!["ended-claude".into(), live.into()];
        app.codex_accounts.insert("ended-codex".into(), Default::default());
        for id in ["studio", "personal"] {
            app.workspaces.push(serde_json::from_value(serde_json::json!({
                "id": id, "name": id, "accent": "#007aff",
                "accountIds": ["ended-codex", live],
                "claudeAccountIds": ["ended-claude"],
                "antigravityAccountIds": ["ended-agy"],
                "geminiAccountIds": ["ended-gemini"],
                "providerIds": ["codex", "gemini"],
                "accountPreferences": {"ended-codex": {}, (live): {}},
                "usage": {
                    "menuBarAccountId": "ended-codex",
                    "accountWindows": {"ended-codex": ["weekly"], "ended-claude": ["weekly"], (live): ["5-hour"]},
                    "activeAccounts": {"codex": "ended-codex", "claude": "ended-claude", "antigravity": "ended-agy", "gemini-app": "ended-gemini"}
                }
            })).unwrap());
        }
        let known = vec![live.into()];
        app.normalize();
        prune_account_references(&mut app, "codex", &known);
        for provider in ["claude", "antigravity"] {
            prune_account_references(&mut app, provider, &[]);
        }
        prune_shared_account_references(&mut app, &known);
        app.project_workspace_preferences();
        let json = serde_json::to_string(&app).unwrap();
        assert!(!json.contains("ended-"));
        assert_eq!(app.workspaces.len(), 2);
        assert_eq!(app.multi_profile.selected_ids, known);
        for workspace in &app.workspaces {
            assert_eq!(workspace.account_ids, known);
            assert_eq!(workspace.provider_ids, Some(vec!["codex".into()]));
            assert_eq!(workspace.menu_bar_account_id(), Some(live));
            assert_eq!(workspace.usage.account_windows[live], ["5-hour"]);
        }
    }

    fn accounts() -> profiles::ProfilesState { profiles::ProfilesState { profiles: vec![], active_profile_id: None, can_import: false, desktop_installed: false, cli_installed: false, switch_error: None } }
    fn account(id: &str) -> profiles::ProfileView {
        profiles::ProfileView { id: id.into(), name: id.into(), display_name: None, created_at: None, email: None, plan: None,
            subscription: None, connected: true, connection_error: None, active: false, needs_activation: false, login_command: String::new() }
    }
    #[test]
    fn successful_switch_follows_only_the_same_provider_in_the_current_workspace() {
        let mut workspace: Workspace = serde_json::from_value(serde_json::json!({
            "id":"studio", "name":"Studio", "accent":"#007aff", "accountIds":["old","new"], "claudeAccountIds":["claude"],
            "usage":{"menuBarProvider":"codex", "menuBarAccountId":"old", "accountWindows":{"old":["5-hour","weekly"]}}
        })).unwrap();
        let mut app = AppSettings { active_workspace_id: Some("studio".into()), ..Default::default() };
        app.codex_accounts.insert("new".into(), settings::CodexAccountPreferences { known_windows: vec!["weekly".into()], ..Default::default() });
        let mut other = workspace.clone(); other.id = "other".into();
        app.workspaces = vec![workspace.clone(), other];
        record_account_switch(&mut app, "codex", "new");
        assert_eq!(app.workspaces[0].usage.menu_bar_account_id.as_deref(), Some("new"));
        assert_eq!(app.workspaces[0].usage.account_windows["new"], ["weekly"]);
        assert_eq!(app.workspaces[0].usage.active_accounts["codex"], "new");
        assert_eq!(app.workspaces[1].usage.menu_bar_account_id.as_deref(), Some("old"));
        workspace.usage.menu_bar_provider = "claude".into(); workspace.usage.menu_bar_account_id = Some("claude".into());
        app.workspaces[0] = workspace;
        record_account_switch(&mut app, "codex", "new");
        assert_eq!(app.workspaces[0].usage.menu_bar_account_id.as_deref(), Some("claude"));
        record_account_switch(&mut app, "codex", "outsider");
        assert_eq!(app.workspaces[0].usage.active_accounts["codex"], "new");
        app.workspaces[0].usage.menu_bar_provider = "codex".into();
        app.workspaces[0].usage.account_windows.insert("new".into(), vec![]);
        record_account_switch(&mut app, "codex", "new");
        assert!(app.workspaces[0].usage.account_windows["new"].is_empty(), "explicitly disabled destination windows stay disabled");
    }

    #[test]
    fn new_menu_bar_defaults_preserve_legacy_and_explicit_styles() {
        let fresh = WorkspaceUsage::new_workspace();
        assert_eq!(fresh.menu_bar_style, settings::MenuBarStyle::ResetTimeline);
        assert!(fresh.default_menu_bar_limits);
        let old: WorkspaceUsage = serde_json::from_str("{}").unwrap();
        assert!(fresh.show_app_logo && old.show_app_logo, "new and legacy workspaces retain the app mark");
        let hidden: WorkspaceUsage = serde_json::from_value(serde_json::json!({"showAppLogo": false})).unwrap();
        assert!(!hidden.show_app_logo);
        let saved = serde_json::to_value(hidden).unwrap();
        assert_eq!(saved["showAppLogo"], false);
        assert!(!serde_json::from_value::<WorkspaceUsage>(saved).unwrap().show_app_logo);
        assert_eq!(old.menu_bar_style, settings::MenuBarStyle::Percentages);
        assert!(!old.default_menu_bar_limits);
        for (name, style) in [
            ("percentages", settings::MenuBarStyle::Percentages),
            ("progress", settings::MenuBarStyle::Progress),
            ("resetTimeline", settings::MenuBarStyle::ResetTimeline),
        ] {
            let saved: WorkspaceUsage = serde_json::from_value(
                serde_json::json!({ "menuBarStyle": name }),
            ).unwrap();
            assert_eq!(saved.menu_bar_style, style);
            assert_eq!(serde_json::to_value(saved).unwrap()["menuBarStyle"], name);
        }
    }

    #[test]
    fn menu_bar_uses_only_one_member_of_a_provider_with_accounts() {
        let mut workspace: Workspace = serde_json::from_value(serde_json::json!({"id":"studio", "name":"Studio", "accent":"#007aff", "accountIds":["one","two"], "claudeAccountIds":[], "antigravityAccountIds":[]})).unwrap();
        assert_eq!(workspace.menu_bar_account_id(), Some("one"));
        workspace.usage.menu_bar_account_id = Some("two".into());
        assert_eq!(workspace.menu_bar_account_id(), Some("two"));
        workspace.usage.menu_bar_account_id = Some("foreign".into());
        assert_eq!(workspace.menu_bar_account_id(), Some("one"));
        workspace.usage.menu_bar_provider = "claude".into();
        assert_eq!(workspace.menu_bar_provider(), "codex");
        workspace.claude_account_ids = Some(vec!["claude-one".into(), "claude-two".into()]);
        workspace.usage.menu_bar_account_id = Some("claude-two".into());
        assert_eq!(workspace.menu_bar_provider(), "claude");
        assert_eq!(workspace.menu_bar_account_id(), Some("claude-two"));
        workspace.claude_account_ids.as_mut().unwrap().retain(|id| id != "claude-two");
        assert_eq!(workspace.menu_bar_account_id(), Some("claude-one"));
        let restored: Workspace = serde_json::from_value(serde_json::to_value(&workspace).unwrap()).unwrap();
        assert_eq!(restored.usage.menu_bar_account_id, workspace.usage.menu_bar_account_id);
    }

    #[test]
    fn loaded_defaults_are_independent_and_backups_never_replace_them() {
        let mut workspace: Workspace = serde_json::from_value(serde_json::json!({"id":"studio", "name":"Studio", "accent":"#007aff", "accountIds":["codex-backup", "codex-loaded"], "claudeAccountIds":["claude-loaded"], "antigravityAccountIds":["google-loaded"]})).unwrap();
        let loaded = [("codex".into(), "codex-loaded".into()), ("claude".into(), "claude-loaded".into()), ("antigravity".into(), "google-loaded".into())].into_iter().collect();
        reconcile_active_accounts(&mut workspace, &loaded);
        assert_eq!(workspace.usage.active_accounts["codex"], "codex-loaded");
        assert_eq!(workspace.usage.active_accounts["claude"], "claude-loaded");
        assert_eq!(workspace.usage.active_accounts["antigravity"], "google-loaded");
        reconcile_active_accounts(&mut workspace, &[("codex".into(), "codex-backup".into())].into_iter().collect());
        assert_eq!(workspace.usage.active_accounts["codex"], "codex-loaded");
        workspace.account_ids.retain(|id| id != "codex-loaded");
        reconcile_active_accounts(&mut workspace, &Default::default());
        assert_eq!(workspace.usage.active_accounts["codex"], "codex-backup");
        assert_eq!(workspace.usage.active_accounts["claude"], "claude-loaded");
        let reread: Workspace = serde_json::from_value(serde_json::to_value(&workspace).unwrap()).unwrap();
        assert_eq!(reread.usage.active_accounts, workspace.usage.active_accounts);
    }

    #[test]
    fn provider_selection_survives_reconciliation_and_legacy_membership_stays_unrestricted() {
        let mut workspace: Workspace = serde_json::from_value(serde_json::json!({
            "id":"studio", "name":"Studio", "accent":"#007aff", "accountIds":[]
        })).unwrap();
        assert!(workspace.provider_ids.is_none());
        workspace.provider_ids = Some(vec!["claude".into()]);
        let mut app = AppSettings { workspace_version: 1, active_workspace_id: Some("studio".into()), ..Default::default() };
        app.workspaces.push(workspace);
        reconcile(&mut app, &accounts());
        assert_eq!(app.workspaces[0].provider_ids, Some(vec!["claude".into()]));
        assert_eq!(serde_json::to_value(&app.workspaces[0]).unwrap()["providerIds"], serde_json::json!(["claude"]));
    }

    #[test]
    fn migration_is_idempotent_and_fresh_install_stays_in_onboarding() {
        let mut app = AppSettings::default();
        reconcile(&mut app, &accounts());
        assert_eq!(app.workspace_version, 1);
        assert!(app.workspaces.is_empty());
        reconcile(&mut app, &accounts());
        assert!(app.workspaces.is_empty());
    }
    #[test]
    fn workspace_validation_rejects_invalid_names_accents_and_duplicates() {
        assert!(label("  ").is_err()); assert!(label("a\nb").is_err());
        assert_eq!(label("  Studio  ").unwrap(), "Studio");
        assert!(color("red").is_err()); assert_eq!(color("#7C6CF0").unwrap(), "#7c6cf0");
        let mut app = AppSettings::default();
        app.workspaces.push(Workspace { id: "one".into(), name: "Studio".into(), accent: "#007aff".into(), account_ids: vec![], provider_ids: None, claude_account_ids: None, antigravity_account_ids: vec![], account_preferences: None, usage: WorkspaceUsage::default() });
        assert!(validate(&app, "studio", None).is_err());
        assert!(validate(&app, "studio", Some("one")).is_ok());
    }
    #[test]
    fn existing_accounts_migrate_once_with_usage_preferences_and_survive_settings_cleanup() {
        let mut app = AppSettings::default();
        app.menu_bar_enabled = true;
        let id = uuid::Uuid::new_v4().to_string();
        app.codex_accounts.insert(id.clone(), settings::CodexAccountPreferences { color: "#2f9e6e".into(), ..Default::default() });
        let data = profiles::ProfilesState { profiles: vec![account(&id)], ..accounts() };
        reconcile(&mut app, &data);
        let workspace = app.workspaces[0].clone();
        assert_eq!(workspace.account_ids, [id.clone()]);
        assert!(workspace.usage.menu_bar_enabled);
        assert!(!app.menu_bar_enabled);
        assert_eq!(app.codex_accounts[&id].color, "#2f9e6e");
        reconcile(&mut app, &data);
        assert_eq!(app.workspaces, [workspace.clone()]);
        let dir = std::env::temp_dir().join(format!("orbilap-workspaces-{}", uuid::Uuid::new_v4()));
        let file = dir.join("settings.json");
        let mut raw = serde_json::to_value(&app).unwrap(); raw["legacyUnknown"] = true.into();
        crate::profiles::write_private(&file, &raw).unwrap();
        let saved = settings::read_settings(&file);
        assert_eq!(saved.workspaces, [workspace]);
        assert!(paths::read_json(&file).unwrap().get("legacyUnknown").is_none());
        std::fs::remove_dir_all(dir).unwrap();
    }
    #[test]
    fn shared_membership_survives_reconcile_and_workspace_preferences_are_independent() {
        let id=uuid::Uuid::new_v4().to_string();
        let mut app=AppSettings::default(); app.workspace_version=1;
        app.workspaces=["one","two"].iter().map(|w|Workspace{id:w.to_string(),name:w.to_string(),accent:"#007aff".into(),account_ids:vec![id.clone()],provider_ids:Some(vec!["codex".into()]),claude_account_ids:Some(vec![]),antigravity_account_ids:vec![],account_preferences:Some(Default::default()),usage:Default::default()}).collect();
        app.workspaces[0].account_preferences.as_mut().unwrap().insert(id.clone(),settings::CodexAccountPreferences{auto_switch:true,color:"#2f9e6e".into(),..Default::default()});
        reconcile(&mut app,&profiles::ProfilesState{profiles:vec![account(&id)],..accounts()});
        assert!(app.workspaces.iter().all(|w|w.account_ids==[id.clone()]));
        app.active_workspace_id=Some("one".into());app.project_workspace_preferences();assert!(app.codex_accounts[&id].auto_switch);
        app.active_workspace_id=Some("two".into());app.project_workspace_preferences();assert!(!app.codex_accounts.contains_key(&id));
    }

    #[test]
    fn moving_membership_is_exclusive_preserves_account_preferences_and_validates_before_changes() {
        let mut app = AppSettings::default();
        app.workspace_version = 1;
        app.workspaces = ["one", "two"].iter().map(|id| Workspace { id: id.to_string(), name: id.to_string(), accent: "#007aff".into(), account_ids: if *id == "one" { vec!["account".into()] } else { vec![] }, provider_ids: None, claude_account_ids: None, antigravity_account_ids: vec![], account_preferences: None, usage: WorkspaceUsage::default() }).collect();
        app.active_workspace_id = Some("one".into());
        app.codex_accounts.insert("account".into(), settings::CodexAccountPreferences { color: "#7c6cf0".into(), ..Default::default() });
        let before = app.workspaces.clone();
        assert!(reassign(&mut app, "account", "missing").is_err());
        assert_eq!(app.workspaces, before);
        reassign(&mut app, "account", "two").unwrap();
        assert!(app.workspaces[0].account_ids.is_empty());
        assert_eq!(app.workspaces[1].account_ids, ["account"]);
        assert_eq!(app.active_workspace_id.as_deref(), Some("one"));
        assert_eq!(app.codex_accounts["account"].color, "#7c6cf0");
    }
}

/// Preflight workspace identity before committing account repositories.
pub(crate) fn validate_destination(id: Option<&str>, name: &str, accent: &str) -> Result<(), String> {
    let app = settings::read_settings(&paths::settings_file());
    if let Some(id) = id { if !app.workspaces.iter().any(|w| w.id == id) { return Err("This workspace no longer exists.".into()); } }
    else { validate(&app, name, None)?; color(accent)?; }
    Ok(())
}

pub(crate) fn commit_accounts_with_active(id: Option<String>, name: &str, accent: &str, codex: Vec<String>, claude: Vec<String>, agy: Vec<String>, active: std::collections::BTreeMap<String, String>) -> Result<AppSettings, String> {
    let (saved, ()) = settings::update_settings(&paths::settings_file(), |app| {
        let saved_codex = if codex.is_empty() { vec![] } else { profiles::list()?.profiles };
        let saved_claude = crate::claude_profiles::saved_ids()?;
        let saved_agy = if agy.is_empty() { vec![] } else { crate::antigravity::list()? };
        if codex.iter().any(|id| !saved_codex.iter().any(|p| &p.id == id))
            || claude.iter().any(|id| !saved_claude.contains(id))
            || agy.iter().any(|id| !saved_agy.iter().any(|p| &p.id == id)) {
            return Err("A selected account is no longer available. Load accounts again.".into());
        }
        let target = if let Some(id) = id { id } else {
            let name = validate(app, name, None)?; let accent = color(accent)?;
            let id = uuid::Uuid::new_v4().to_string();
            app.workspaces.push(Workspace { id: id.clone(), name, accent, account_ids: vec![], provider_ids: Some(vec![]), claude_account_ids: Some(vec![]), antigravity_account_ids: vec![], account_preferences: Some(Default::default()), usage: WorkspaceUsage::new_workspace() }); id
        };
        let workspace = app.workspaces.iter_mut().find(|w| w.id == target).ok_or("This workspace no longer exists.")?;
        for id in codex { if !workspace.account_ids.contains(&id) { workspace.account_ids.push(id); } }
        if workspace.claude_account_ids.is_none() { workspace.claude_account_ids = Some(saved_claude); }
        for id in claude { let ids = workspace.claude_account_ids.as_mut().unwrap(); if !ids.contains(&id) { ids.push(id); } }
        for id in agy { if !workspace.antigravity_account_ids.contains(&id) { workspace.antigravity_account_ids.push(id); } }
        reconcile_active_accounts(workspace, &active);
        if let Some(providers) = &mut workspace.provider_ids {
            for (provider, has_accounts) in [("codex", !workspace.account_ids.is_empty()), ("claude", workspace.claude_account_ids.as_ref().is_some_and(|v| !v.is_empty())), ("antigravity", !workspace.antigravity_account_ids.is_empty())] { if has_accounts && !providers.iter().any(|id| id == provider) { providers.push(provider.into()); } }
        }
        app.active_workspace_id = Some(target); app.workspace_version = 1;
        app.project_workspace_preferences();
        Ok(())
    })?; Ok(saved)
}

/// Keep one default per provider; adding a backup never replaces a valid default.
/// A successful switch follows the account only on the current provider's menu bar.
pub fn record_account_switch(app: &mut AppSettings, provider: &str, id: &str) {
    for workspace in &mut app.workspaces {
        let member = match provider {
            "codex" => workspace.account_ids.iter().any(|member| member == id),
            "claude" => workspace.claude_account_ids.as_ref().is_none_or(|ids| ids.iter().any(|member| member == id)),
            "antigravity" => workspace.antigravity_account_ids.iter().any(|member| member == id),
            _ => false,
        };
        if !member { continue; }
        if app.active_workspace_id.as_deref() == Some(&workspace.id) && workspace.menu_bar_providers().contains(&provider) {
            // Preserve legacy carry-over. New workspaces resolve each account's
            // default limits from its own reported quota.
            if !workspace.usage.default_menu_bar_limits && !workspace.usage.account_windows.contains_key(id) {
                let prefs = workspace.account_preferences.as_ref().and_then(|p| p.get(id)).or_else(|| app.codex_accounts.get(id));
                if prefs.is_none_or(|p| p.menu_bar_windows.is_empty()) {
                    let prior_id = if workspace.usage.menu_bar_providers.is_some() {
                        workspace.usage.active_accounts.get(provider).map(String::as_str)
                    } else { workspace.menu_bar_account_id() };
                    let prior = prior_id.and_then(|old| workspace.usage.account_windows.get(old)).cloned().unwrap_or_default();
                    let windows = prior.into_iter().filter(|kind| prefs.is_none_or(|p| p.known_windows.is_empty() || p.known_windows.contains(kind))).collect();
                    workspace.usage.account_windows.insert(id.into(), windows);
                }
            }
            if workspace.menu_bar_provider() == provider { workspace.usage.menu_bar_account_id = Some(id.into()); }
        }
        workspace.usage.active_accounts.insert(provider.into(), id.into());
    }
}

fn reconcile_active_accounts(workspace: &mut Workspace, loaded: &std::collections::BTreeMap<String, String>) {
    let empty = vec![];
    for (provider, ids) in [("codex", &workspace.account_ids), ("claude", workspace.claude_account_ids.as_ref().unwrap_or(&empty)), ("antigravity", &workspace.antigravity_account_ids)] {
        if workspace.usage.active_accounts.get(provider).is_some_and(|id| ids.contains(id)) { continue; }
        workspace.usage.active_accounts.remove(provider);
        if let Some(id) = loaded.get(provider).filter(|id| ids.contains(id)).or_else(|| ids.first()) { workspace.usage.active_accounts.insert(provider.into(), id.clone()); }
    }
}

/// Membership removal never revokes the provider login. Global forgetting is explicit.
pub fn remove_membership(workspace_id: &str, provider: &str, id: &str, everywhere: bool) -> Result<AppSettings, String> {
    if !matches!(provider, "codex" | "claude" | "antigravity") { return Err("Unknown account provider.".into()); }
    let legacy_claude_ids = if provider == "claude" { crate::claude_profiles::list()?.into_iter().map(|entry| entry.profile.id).collect() } else { vec![] };
    let mut previous = None;
    let (saved, ()) = settings::update_settings(&paths::settings_file(), |app| {
        if !app.workspaces.iter().any(|w| w.id == workspace_id) { return Err("This workspace no longer exists.".into()); }
        previous = Some((app.workspaces.clone(), app.codex_accounts.clone()));
        for w in &mut app.workspaces {
            if !everywhere && w.id != workspace_id { continue; }
            match provider {
                "codex" => { w.account_ids.retain(|entry| entry != id); if let Some(prefs) = &mut w.account_preferences { prefs.remove(id); } },
                "claude" => { w.claude_account_ids.get_or_insert_with(|| legacy_claude_ids.clone()).retain(|entry| entry != id); },
                "antigravity" => w.antigravity_account_ids.retain(|entry| entry != id),
                _ => return Err("Unknown account provider.".into()),
            }
        }
        for w in &mut app.workspaces { reconcile_active_accounts(w, &Default::default()); }
        if everywhere && provider == "codex" { app.codex_accounts.remove(id); }
        app.project_workspace_preferences(); Ok(())
    })?;
    if everywhere {
        let forgotten = match provider { "codex" => profiles::remove(id).map(|_| ()), "claude" => crate::claude_profiles::forget(id).map(|_| ()), "antigravity" => crate::antigravity::remove(id), _ => unreachable!() };
        if let Err(error) = forgotten {
            // A failed repository write must not silently detach the account. Avoid
            // overwriting a concurrent membership edit while restoring the prior state.
            let (workspaces, preferences) = previous.unwrap();
            settings::update_settings(&paths::settings_file(), |app| {
                if app.workspaces != saved.workspaces || app.codex_accounts != saved.codex_accounts { return Err("Account storage failed and membership changed concurrently. Reload the workspace.".into()); }
                app.workspaces = workspaces; app.codex_accounts = preferences; app.project_workspace_preferences(); Ok(())
            })?;
            return Err(error);
        }
    }
    Ok(saved)
}
