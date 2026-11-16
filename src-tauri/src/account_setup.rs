//! Native onboarding drafts, outside both permanent profile indexes and workspace membership.
//! The webview holds opaque IDs/metadata only. Login and validation never activate accounts.
use crate::{
    account_login::{Login, Progress},
    antigravity::VerificationError,
    claude_profiles, cli, paths, profiles, settings,
    subscriptions::Subscription,
    workspaces,
};
use serde::Serialize;
use std::{
    collections::HashMap,
    path::{Path, PathBuf},
    sync::{LazyLock, Mutex},
};

static SESSIONS: LazyLock<Mutex<HashMap<String, Draft>>> =
    LazyLock::new(|| Mutex::new(HashMap::new()));
#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Account {
    pub id: String,
    pub provider: String,
    pub name: String,
    pub display_name: Option<String>,
    pub active: bool,
    pub already_added: bool,
    pub email: Option<String>,
    pub subscription: Subscription,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub source: Option<AccountSource>,
}
struct Entry {
    account: Account,
    home: PathBuf,
    existing: Option<String>,
    owned: bool,
    identity: String,
}
enum Runner {
    Cli(Login),
    Google(crate::antigravity_acp::Login),
}
impl Runner {
    fn poll(&mut self) -> Progress {
        match self {
            Self::Cli(login) => login.poll(),
            Self::Google(login) => login.poll(),
        }
    }
    fn stop(&mut self) {
        match self {
            Self::Cli(login) => login.stop(),
            Self::Google(login) => login.stop(),
        }
    }
    fn submit_code(&mut self, code: &str) -> Result<(), String> {
        match self {
            Self::Cli(login) => login.submit_code(code),
            _ => Err("Complete Google sign-in in your browser.".into()),
        }
    }
}
struct Attempt {
    id: String,
    provider: String,
    name: String,
    home: PathBuf,
    login: Runner,
}
#[derive(Default)]
struct Draft {
    entries: Vec<Entry>,
    attempt: Option<Attempt>,
    antigravity_needs_fresh_login: bool,
}
#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct LoginResult {
    pub attempt_id: String,
    #[serde(flatten)]
    pub progress: Progress,
    pub account: Option<Account>,
}

fn with_draft<T>(
    id: &str,
    action: impl FnOnce(&mut Draft) -> Result<T, String>,
) -> Result<T, String> {
    let mut sessions = SESSIONS
        .lock()
        .map_err(|_| "Account setup is busy. Try again.")?;
    action(
        sessions
            .get_mut(id)
            .ok_or("This setup has ended. Reopen Add account.")?,
    )
}

pub(crate) fn device_identity(session: &str, id: &str, provider: &str) -> Result<String, String> {
    with_draft(session, |draft| {
        let entry = draft.entries.iter().find(|entry| entry.account.id == id && entry.account.provider == provider)
            .ok_or("Select a verified account first.")?;
        device_key(entry)
    })
}

fn device_key(entry: &Entry) -> Result<String, String> {
    if entry.account.provider == "codex" { return Ok(entry.identity.clone()); }
    entry.account.email.as_ref().map(|email| email.to_lowercase())
        .ok_or_else(|| "Account identity is unavailable.".into())
}
fn staging_home() -> Result<PathBuf, String> {
    let home = paths::app_data_dir()
        .join("orbilap-login-homes")
        .join(uuid::Uuid::new_v4().to_string());
    profiles::private_dir(&home)?;
    Ok(home)
}
fn account_name(raw: &str) -> Result<String, String> {
    let name = raw.trim();
    if name.is_empty() || name.chars().count() > 64 || name.chars().any(char::is_control) {
        return Err("Use an account name with 1–64 characters.".into());
    }
    Ok(name.into())
}
/// These providers receive display labels from server-verified account metadata.
fn enrollment_name(provider: &str, raw: &str) -> Result<String, String> {
    if matches!(provider, "codex" | "antigravity") && raw.trim().is_empty() { Ok(String::new()) }
    else { account_name(raw) }
}
fn inspect(
    provider: &str,
    home: &Path,
    existing: Option<&str>,
) -> Result<(String, Option<String>, Subscription), String> {
    if provider == "antigravity" {
        return crate::antigravity::inspect_for_enrollment(home, None).map_err(String::from);
    }
    let identity = inspect_identity(provider, home, existing)?;
    inspect_usage(provider, home, existing)?;
    Ok(identity)
}

fn inspect_usage(provider: &str, home: &Path, existing: Option<&str>) -> Result<(), String> {
    let quota = match provider {
        "codex" => if let Some(id) = existing { profiles::quota_for(id) } else {
            paths::read_json(&home.join("auth.json")).and_then(|auth| crate::quota::codex_quota_from_auth(&auth))
        },
        "antigravity" => Some(crate::antigravity::quota_in(home)?),
        "claude" => Some(crate::claude_usage::current_quota_in(home)),
        _ => return Err("Choose a supported provider.".into()),
    };
    if provider == "codex" && existing.is_none() && quota.as_ref().is_some_and(profiles::needs_quota_renewal) {
        return Err("Session rejected. Sign in to ChatGPT again.".into());
    }
    require_loaded_usage(quota.as_ref())
}

fn inspect_identity(
    provider: &str,
    home: &Path,
    existing: Option<&str>,
) -> Result<(String, Option<String>, Subscription), String> {
    if provider == "codex" {
        let identity = if let Some(id) = existing { profiles::inspect_saved(id)? } else { profiles::inspect_staged(home)? };
        return Ok(identity);
    }
    if provider == "antigravity" {
        let identity = crate::antigravity::inspect(home)?;
        return Ok(identity);
    }
    if provider != "claude" {
        return Err("Choose a supported provider.".into());
    }
    let binary =
        claude_reader().ok_or("Open the Code tab in Claude Desktop or install Claude Code to connect this account.")?;
    let (connected, method, email, _, subscription) = cli::probe_claude_at(&binary, Some(home));
    if connected != Some(true) || method.as_deref() != Some("claude.ai") {
        return Err("Sign in to Claude Code with a Claude subscription first.".into());
    }
    let sub = subscription
        .filter(|s| s.is_paid())
        .ok_or("A confirmed paid Claude plan is required. Check your subscription and retry.")?;
    let identity = email
        .clone()
        .ok_or("Claude could not verify the account email. Sign in again.")?;
    Ok((identity, email, sub))
}
/// Exhaustion is valid data; missing or failed usage must never create an account entry.
fn require_loaded_usage(quota: Option<&crate::quota::QuotaSet>) -> Result<(), String> {
    if quota.is_some_and(|q| q.error.is_none() && q.windows.iter().flatten().any(|w| w.percent.is_finite() && (0.0..=100.0).contains(&w.percent))) { Ok(()) }
    else { Err("Account usage could not be loaded. Check the login and try again.".into()) }
}

/// Identity/refresh completes before either read; optional profile metadata
/// shares the usage wait without weakening the usage gate or exposing tokens.
fn verify_with_metadata<T: Send>(
    usage: impl FnOnce() -> Result<(), String>,
    metadata: impl FnOnce() -> T + Send,
) -> Result<T, String> {
    std::thread::scope(|scope| {
        let name = scope.spawn(metadata);
        let checked = usage();
        let name = name.join().map_err(|_| "Cannot check this account. Try again.".to_string())?;
        checked?;
        Ok(name)
    })
}

fn add_entry(
    draft: &mut Draft,
    provider: &str,
    name: String,
    home: PathBuf,
    existing: Option<String>,
    owned: bool,
) -> Result<Account, String> {
    add_entry_with_deadline(draft, provider, name, home, existing, owned, None).map_err(String::from)
}

fn google_account_is_added(saved: &[crate::antigravity::Saved], email: Option<&str>, app: &settings::AppSettings) -> bool {
    saved.iter().any(|account| account.email.as_deref().zip(email).is_some_and(|(saved, email)| saved.eq_ignore_ascii_case(email))
        && app.workspaces.iter().any(|workspace| workspace.antigravity_account_ids.contains(&account.id)))
}

fn add_entry_with_deadline(
    draft: &mut Draft,
    provider: &str,
    name: String,
    home: PathBuf,
    existing: Option<String>,
    owned: bool,
    deadline: Option<std::time::Instant>,
) -> Result<Account, VerificationError> {
    let result = (|| {
        let (identity, email, subscription) = if provider == "antigravity" {
            crate::antigravity::inspect_for_enrollment(&home, deadline)?
        } else { inspect_identity(provider, &home, existing.as_deref())? };
        let already_added = match provider {
            // A saved credential can outlive its last workspace membership.
            // Only accounts still present in Orbilap should block enrollment.
            "codex" => profiles::contains_setup_identity(&identity)?,
            "claude" => existing.is_some() || claude_profiles::contains_setup_email(&identity)?,
            "antigravity" => google_account_is_added(&crate::antigravity::enrollment_profiles(deadline)?, email.as_deref(),
                &settings::read_settings(&paths::settings_file())) ,
            _ => false,
        };
        let duplicate = draft.entries.iter().position(|entry|
            entry.account.provider == provider && (entry.identity == identity
                || (provider == "antigravity" && entry.existing.is_some()
                    && entry.account.email.as_deref().zip(email.as_deref())
                        .is_some_and(|(saved, verified)| saved.eq_ignore_ascii_case(verified)))));
        if let Some(index) = duplicate {
            if provider != "codex" || !owned {
                if provider != "antigravity" { inspect_usage(provider, &home, existing.as_deref())?; }
                return Ok(draft.entries[index].account.clone());
            }
        }
        let auth = (provider == "codex").then(|| paths::read_json(&home.join("auth.json"))).flatten();
        let display_name = if provider == "antigravity" {
            paths::read_json(&home.join("auth.json")).and_then(|auth| crate::antigravity::account_label(&auth))
        } else if provider == "codex" {
            verify_with_metadata(
                || inspect_usage(provider, &home, existing.as_deref()),
                || auth.as_ref().and_then(|auth| {
                    // New enrollment must not inherit a removed account's old label or token name.
                    let live = (!already_added).then(|| crate::codex::enrollment_profile_name(auth)).flatten();
                    live.or_else(|| crate::codex::profile_display_name(auth))
                }),
            )?
        } else {
            if provider != "antigravity" { inspect_usage(provider, &home, existing.as_deref())?; }
            None
        };
        let previous_id = duplicate.map(|index| {
            // Replace only after verification; failures retain the original draft.
            let old = draft.entries.remove(index);
            if old.owned && old.home != home { cleanup_home(provider, &old.home); }
            old.account.id.clone()
        });
        let name = if provider == "antigravity" {
            display_name.clone().or_else(|| email.clone()).unwrap_or_else(|| "Google account".into())
        } else if provider == "codex" && !already_added {
            fresh_codex_name(display_name.as_deref(), auth.as_ref())
        } else if provider == "codex" && name.trim().is_empty() {
            fresh_codex_name(display_name.as_deref(), auth.as_ref())
        } else { name };
        let mut account = Account {
            id: previous_id.unwrap_or_else(|| uuid::Uuid::new_v4().to_string()),
            provider: provider.into(),
            name,
            display_name,
            active: false,
            already_added,
            email,
            subscription,
            source: existing.as_ref().map(|_| AccountSource::Saved),
        };
        if provider == "codex" && existing.is_none() && profiles::is_current_setup_identity(&identity) {
            mark_active(draft, &mut account);
        }
        draft.entries.push(Entry {
            account: account.clone(),
            home: home.clone(),
            existing,
            owned,
            identity,
        });
        Ok(account)
    })();
    if owned && !draft.entries.iter().any(|entry| entry.home == home) {
        cleanup_home(provider, &home);
    }
    result
}
/// A new enrollment uses current provider metadata, then its saved-login fallback.
fn fresh_codex_name(display_name: Option<&str>, auth: Option<&serde_json::Value>) -> String {
    display_name.and_then(|name| crate::codex::usable_profile_name(Some(name)))
        .map(|name| name.chars().take(64).collect())
        .or_else(|| auth.map(crate::codex::imported_account_label))
        .unwrap_or_else(|| "ChatGPT account".into())
}

fn cleanup_home(provider: &str, home: &Path) {
    if provider == "claude" {
        // Remove only the service derived from an app-owned, isolated configuration.
        // Never log out or delete the user's ambient Claude Keychain entry.
        crate::account_setup_cleanup::claude(home);
    }
    let _ = std::fs::remove_dir_all(home);
}
impl Drop for Draft {
    fn drop(&mut self) {
        if let Some(mut attempt) = self.attempt.take() {
            attempt.login.stop();
            cleanup_home(&attempt.provider, &attempt.home);
        }
        for entry in &self.entries {
            if entry.owned {
                cleanup_home(&entry.account.provider, &entry.home);
            }
        }
    }
}
pub fn begin() -> Result<String, String> {
    let mut sessions = SESSIONS.lock().map_err(|_| "Account setup is busy.")?;
    if sessions.len() >= 8 {
        return Err("Close another account setup before opening a new one.".into());
    }
    let id = uuid::Uuid::new_v4().to_string();
    sessions.insert(id.clone(), Draft::default());
    Ok(id)
}
pub fn discard(id: &str) -> Result<(), String> {
    SESSIONS
        .lock()
        .map_err(|_| "Account setup is busy.")?
        .remove(id);
    Ok(())
}
pub fn shutdown() {
    if let Ok(mut sessions) = SESSIONS.lock() {
        sessions.clear();
    }
}

/// Current logins are exclusive within their provider, independent of other providers.
fn mark_active(draft: &mut Draft, account: &mut Account) {
    for entry in &mut draft.entries {
        if entry.account.provider == account.provider { entry.account.active = entry.account.id == account.id; }
    }
    account.active = true;
}

#[derive(Clone, Copy, Debug, PartialEq, Eq, Serialize)]
#[serde(rename_all = "lowercase")]
pub enum AccountSource {
    Desktop,
    Cli,
    Saved,
}

pub(crate) fn desktop_installed(bundle_id: &str, app_name: &str) -> bool {
    desktop_app_path(bundle_id, app_name).is_some()
}

/// Resolve the registered or running bundle, including renamed and relocated apps.
pub(crate) fn desktop_app_path(bundle_id: &str, app_name: &str) -> Option<PathBuf> {
    #[cfg(target_os = "macos")]
    {
        use objc2_app_kit::{NSRunningApplication, NSWorkspace};
        use objc2_foundation::NSString;
        let bundle = objc2::rc::autoreleasepool(|_| {
            let id = NSString::from_str(bundle_id);
            let registered = NSWorkspace::sharedWorkspace().URLForApplicationWithBundleIdentifier(&id);
            let running = NSRunningApplication::runningApplicationsWithBundleIdentifier(&id);
            registered.or_else(|| running.iter().find_map(|app| app.bundleURL()))
                .and_then(|url| url.path())
                .map(|path| PathBuf::from(path.to_string()))
                .filter(|path| path.is_dir())
        });
        if bundle.is_some() { return bundle; }
    }
    [Some(PathBuf::from("/Applications").join(app_name)),
        dirs::home_dir().map(|home| home.join("Applications").join(app_name))]
        .into_iter().flatten()
        .find(|path| path.join("Contents/Info.plist").is_file())
}

/// Current Antigravity releases can retain the Gemini bundle name on macOS.
pub(crate) fn google_desktop_installed() -> bool {
    desktop_installed("com.google.GeminiMacOS", "Gemini.app")
        || desktop_installed("com.google.antigravity", "Antigravity.app")
}

const CLAUDE_BUNDLE_ID: &str = "com.anthropic.claudefordesktop";

fn same_home(left: &Path, right: &Path) -> bool {
    left == right || left.canonicalize().ok().zip(right.canonicalize().ok())
        .is_some_and(|(left, right)| left == right)
}

fn selected_homes(desktop: Option<PathBuf>, cli: Option<PathBuf>) -> Vec<PathBuf> {
    // Preserve the path supplied to Claude. Its Keychain service depends on that path.
    let same = desktop.is_some() && desktop == cli;
    if same { return cli.into_iter().collect(); }
    [desktop, cli].into_iter().flatten().collect()
}

/// The default Codex cache is shared. A separate CLI override can take
/// precedence, with the desktop cache as a fallback if verification fails.
fn codex_candidates(desktop: Option<PathBuf>, cli: Option<PathBuf>) -> Vec<(PathBuf, AccountSource)> {
    if desktop.as_ref().zip(cli.as_ref()).is_some_and(|(a, b)| same_home(a, b)) {
        return desktop.into_iter().map(|path| (path, AccountSource::Desktop)).collect();
    }
    [(cli, AccountSource::Cli), (desktop, AccountSource::Desktop)]
        .into_iter()
        .filter_map(|(path, source)| path.map(|path| (path, source)))
        .collect()
}

fn merge_discovered(found: &mut Vec<Account>, mut account: Account, source: AccountSource) {
    account.source = Some(source);
    if let Some(old) = found.iter_mut().find(|old| old.id == account.id) {
        old.active |= account.active;
        if matches!(old.source, None | Some(AccountSource::Saved)) {
            old.source = account.source;
        }
    } else {
        found.push(account);
    }
}

/// Check the CLI override first, then the Desktop Code configuration.
pub(crate) fn claude_current_homes() -> Vec<(PathBuf, AccountSource)> {
    let desktop = dirs::home_dir().filter(|_| desktop_installed(CLAUDE_BUNDLE_ID, "Claude.app"))
        .map(|home| home.join(".claude"));
    let cli = cli::which_binary("claude").map(|_| paths::claude_home());
    selected_homes(desktop.clone(), cli).into_iter().rev().map(|config| {
        let source = if desktop.as_ref() == Some(&config) { AccountSource::Desktop } else { AccountSource::Cli };
        (config, source)
    }).collect()
}

/// Reuse Claude Desktop's local Code runtime when no standalone CLI exists.
pub(crate) fn claude_reader() -> Option<PathBuf> {
    cli::which_binary("claude").or_else(|| {
        if !desktop_installed(CLAUDE_BUNDLE_ID, "Claude.app") { return None; }
        let runtime = dirs::home_dir()?.join("Library/Application Support/Claude/claude-code-vm");
        std::fs::read_dir(runtime).ok()?.filter_map(Result::ok).filter_map(|entry| {
            let version = entry.file_name().to_str()?.split('.')
                .map(str::parse::<u32>).collect::<Result<Vec<_>, _>>().ok()?;
            let binary = entry.path().join("claude");
            #[cfg(unix)]
            use std::os::unix::fs::PermissionsExt;
            let metadata = binary.metadata().ok()?;
            #[cfg(unix)]
            if metadata.permissions().mode() & 0o111 == 0 { return None; }
            metadata.is_file().then_some((version, binary))
        }).max_by(|a, b| a.0.cmp(&b.0)).map(|(_, path)| path)
    })
}

/// With a provider filter, check only its local sessions. Workspace setup
/// includes saved profiles so they can be shared across workspaces.
pub fn discover(id: &str, provider: Option<&str>) -> Result<Vec<Account>, String> {
    if provider.is_some_and(|id| !matches!(id, "codex" | "claude" | "antigravity")) {
        return Err("Choose a supported provider.".into());
    }
    with_draft(id, |draft| discover_providers(draft, provider, discover_provider))
}

/// Each provider owns disjoint draft entries. Restore all entries, including
/// partial progress on failure, before returning in stable provider order.
fn discover_providers(
    draft: &mut Draft,
    provider: Option<&str>,
    discover: impl Fn(&mut Draft, &str, bool) -> Result<Vec<Account>, String> + Sync,
) -> Result<Vec<Account>, String> {
    let mut jobs: Vec<_> = ["codex", "claude", "antigravity"].into_iter()
        .filter(|id| provider.is_none_or(|selected| selected == *id))
        .map(|id| (id, Draft::default(), None))
        .collect();
    let mut retained = vec![];
    for entry in draft.entries.drain(..) {
        if let Some((_, worker, _)) = jobs.iter_mut().find(|(id, _, _)| *id == entry.account.provider) {
            worker.entries.push(entry);
        } else { retained.push(entry); }
    }
    draft.entries = retained;
    std::thread::scope(|scope| {
        for (id, worker, result) in &mut jobs {
            let discover = &discover;
            scope.spawn(move || {
                *result = Some(std::panic::catch_unwind(std::panic::AssertUnwindSafe(||
                    discover(worker, id, provider.is_none())
                )).unwrap_or_else(|_| Err("Cannot check this provider. Try again.".into())));
            });
        }
    });
    let mut found = vec![];
    let mut failure = None;
    for (_, mut worker, result) in jobs {
        draft.entries.append(&mut worker.entries);
        match result.unwrap() {
            Ok(accounts) => found.extend(accounts),
            Err(error) => { failure.get_or_insert(error); }
        }
    }
    match failure { Some(error) => Err(error), None => Ok(found) }
}

fn stage_saved_account(draft: &mut Draft, existing: String, home: PathBuf, identity: String, mut account: Account) -> Account {
    let previous = draft.entries.iter().position(|entry| entry.account.provider == account.provider
        && (entry.existing.as_deref() == Some(existing.as_str())
            || (account.provider == "codex" && entry.identity == identity)
            || (account.provider == "antigravity" && entry.account.email.as_deref()
                .is_some_and(|email| email.eq_ignore_ascii_case(&identity)))));
    if let Some(index) = previous {
        let previous = draft.entries.remove(index);
        account.id = previous.account.id;
        if previous.owned && previous.home != home { cleanup_home(&account.provider, &previous.home); }
    }
    draft.entries.push(Entry { account: account.clone(), home, existing: Some(existing), owned: false, identity });
    account
}

fn discover_provider(draft: &mut Draft, provider: &str, include_saved: bool) -> Result<Vec<Account>, String> {
    let includes = |id: &str| provider == id;
    let home = dirs::home_dir();
    let google_deadline = std::time::Instant::now() + std::time::Duration::from_secs(3);
    let app = include_saved.then(|| settings::read_settings(&paths::settings_file()));
    let mut found = vec![];
    for entry in &mut draft.entries {
        if includes(&entry.account.provider) { entry.account.active = false; }
    }
    for profile in if include_saved && includes("codex") { profiles::list()?.profiles } else { vec![] } {
        let Some(subscription) = profile.subscription.filter(|sub| sub.is_paid()) else { continue; };
        if !profile.connected { continue; }
        let Ok(path) = profiles::saved_auth_path(&profile.id) else { continue; };
        let Some(home) = path.parent() else { continue; };
        let Ok(identity) = profiles::setup_login_identity(home) else { continue; };
        let account = Account {
            id: uuid::Uuid::new_v4().to_string(), provider: "codex".into(), name: profile.name,
            display_name: profile.display_name, active: profile.active,
            already_added: app.as_ref().is_some_and(|app| app.workspaces.iter()
                .any(|workspace| workspace.account_ids.contains(&profile.id))),
            email: profile.email, subscription, source: Some(AccountSource::Saved),
        };
        found.push(stage_saved_account(draft, profile.id, home.into(), identity, account));
    }
    if includes("codex") {
        let current = profiles::live_codex_home();
        let desktop = home.as_ref()
            .filter(|_| desktop_installed("com.openai.codex", "Codex.app"))
            .map(|path| path.join(".codex"));
        let cli = cli::which_binary("codex").map(|_| paths::codex_home());
        for (config, source) in codex_candidates(desktop, cli) {
            let auth = config.join("auth.json");
            if !auth.is_file() { continue; }
            let staging = staging_home()?;
            if copy_auth(&auth, &staging).is_err() {
                cleanup_home("codex", &staging);
                continue;
            }
            if let Some(saved) = profiles::setup_login_identity(&staging).ok().and_then(|identity| {
                draft.entries.iter().find(|entry| entry.existing.is_some() && entry.identity == identity
                    && found.iter().any(|account| account.id == entry.account.id))
            }) {
                let mut account = saved.account.clone();
                cleanup_home("codex", &staging);
                if same_home(&config, &current) { mark_active(draft, &mut account); }
                merge_discovered(&mut found, account, source);
                break;
            }
            if let Ok(mut account) = add_entry(draft, "codex", "ChatGPT account".into(), staging, None, true) {
                if same_home(&config, &current) {
                    mark_active(draft, &mut account);
                    for old in &mut found { if old.provider == "codex" { old.active = old.id == account.id; } }
                }
                merge_discovered(&mut found, account, source);
                break;
            }
        }
    }
    for profile in if include_saved && includes("claude") { claude_profiles::list()? } else { vec![] } {
        if let Ok(mut account) = add_entry(
            draft,
            "claude",
            profile.profile.name,
            profile.profile.config_dir,
            Some(profile.profile.id),
            false,
        ) {
            if profile.active { mark_active(draft, &mut account); }
            found.push(account);
        }
    }
    if includes("claude") {
        for (config, source) in claude_current_homes() {
            if let Ok(mut account) = add_entry(draft, "claude", "Claude account".into(), config, None, false) {
                if !found.iter().any(|old| old.provider == "claude" && old.active) {
                    mark_active(draft, &mut account);
                }
                merge_discovered(&mut found, account, source);
            }
        }
    }
    for profile in if include_saved && includes("antigravity") { crate::antigravity::discovery_profiles()? } else { vec![] } {
        let Ok(home) = crate::antigravity::discovery_home(&profile) else { continue; };
        let display_name = profile.google_display_name();
        let Some(subscription) = profile.subscription.filter(|sub| sub.is_paid()) else { continue; };
        let Some(email) = profile.email else { continue; };
        let account = Account {
            id: uuid::Uuid::new_v4().to_string(), provider: "antigravity".into(), name: profile.name,
            display_name, active: false,
            already_added: app.as_ref().is_some_and(|app| app.workspaces.iter()
                .any(|workspace| workspace.antigravity_account_ids.contains(&profile.id))),
            email: Some(email.clone()),
            subscription, source: Some(AccountSource::Saved),
        };
        found.push(stage_saved_account(draft, profile.id, home, email, account));
    }
    if includes("antigravity") {
        // Desktop and agy use the same current Google login.
        let source = if google_desktop_installed() {
            Some(AccountSource::Desktop)
        } else {
            cli::which_binary("agy").map(|_| AccountSource::Cli)
        };
        if let Some(source) = source {
            if let Ok(account) = discover_current_google_with_deadline(draft, "Antigravity account".into(), Some(google_deadline)) {
                merge_discovered(&mut found, account, source);
            }
        }
    }
    Ok(found)
}

fn copy_auth(source: &Path, home: &Path) -> Result<(), String> {
    let value = profiles::read_imported_auth(source)?;
    profiles::write_private(&home.join("auth.json"), &value)
}
pub fn import(
    id: &str,
    provider: &str,
    name: &str,
    credentials: Option<String>,
    path: Option<String>,
) -> Result<Account, String> {
    if provider != "codex" {
        return Err("Login-file import is only supported for Codex. Use the provider's sign-in options.".into());
    }
    let name = enrollment_name(provider, name)?;
    with_draft(id, |draft| {
        let home = staging_home()?;
        let result = (|| {
            match (credentials, path) {
                (Some(raw), None) if raw.len() <= profiles::MAX_IMPORT_BYTES => {
                    let value: serde_json::Value = serde_json::from_str(&raw)
                        .map_err(|_| "This login file is not valid JSON.")?;
                    profiles::write_private(&home.join("auth.json"), &value)?;
                }
                (None, Some(path)) => copy_auth(&crate::resolve_import_path(&path)?, &home)?,
                _ => return Err("Choose one login file.".into()),
            }
            add_entry(draft, provider, name, home.clone(), None, true)
        })();
        if result.is_err() {
            cleanup_home(provider, &home);
        }
        result
    })
}
pub fn connect_config(id: &str, name: &str, path: &str) -> Result<Account, String> {
    let name = account_name(name)?;
    let config = crate::resolve_import_path(path)?
        .canonicalize()
        .map_err(|_| "Choose an existing Claude configuration directory.")?;
    if !config.is_dir() {
        return Err("Choose a Claude configuration directory, not a credentials file.".into());
    }
    with_draft(id, |draft| {
        add_entry(draft, "claude", name, config, None, false)
    })
}
pub fn start(id: &str, provider: &str, method: &str, name: &str) -> Result<LoginResult, String> {
    let name = enrollment_name(provider, name)?;
    if !matches!(
        (provider, method),
        ("codex", "browser" | "device") | ("claude", "browser") | ("antigravity", "browser")
    ) {
        return Err("Choose an available sign-in method.".into());
    }
    with_draft(id, |draft| {
        if draft.attempt.is_some() {
            return Err("Finish or cancel the current sign-in first.".into());
        }
        let home = staging_home()?;
        let result = if provider == "antigravity" {
            crate::antigravity_acp::Login::start(&home, !draft.antigravity_needs_fresh_login).map(Runner::Google)
        } else {
            (if provider == "codex" { cli::codex_runtime() } else { cli::which_binary(provider) })
                .ok_or(format!(
                    "Install {} before signing in.",
                    if provider == "codex" {
                        "Codex app or Codex CLI"
                    } else {
                        "Claude Code CLI"
                    }
                ))
                .and_then(|binary| Login::start(&binary, provider, method, &home))
                .map(Runner::Cli)
        };
        match result {
            Ok(mut login) => {
                let mut progress = login.poll();
                progress.status = "pending".into();
                let attempt_id = uuid::Uuid::new_v4().to_string();
                draft.attempt = Some(Attempt {
                    id: attempt_id.clone(),
                    provider: provider.into(),
                    name,
                    home,
                    login,
                });
                Ok(LoginResult {
                    attempt_id,
                    progress,
                    account: None,
                })
            }
            Err(error) => {
                cleanup_home(provider, &home);
                Err(error)
            }
        }
    })
}
pub fn poll(id: &str, attempt_id: &str) -> Result<LoginResult, String> {
    with_draft(id, |draft| {
        let attempt = draft
            .attempt
            .as_mut()
            .filter(|a| a.id == attempt_id)
            .ok_or("This sign-in was cancelled.")?;
        let progress = attempt.login.poll();
        if progress.status == "pending" {
            return Ok(LoginResult {
                attempt_id: attempt_id.into(),
                progress,
                account: None,
            });
        }
        let attempt = draft.attempt.take().unwrap();
        let resumed_saved = matches!(&attempt.login, Runner::Google(login) if login.resumed_saved());
        drop(attempt.login);
        let account = if progress.status == "completed" {
            let result = add_entry_with_deadline(
                draft,
                &attempt.provider,
                attempt.name.clone(),
                attempt.home,
                None,
                true,
                None,
            );
            if resumed_saved && matches!(&result, Err(VerificationError::InvalidGrant)) {
                draft.antigravity_needs_fresh_login = true;
                // Verification cleaned up the rejected draft. Start OAuth with an empty home
                // and keep the attempt ID so the panel continues polling and opens the link.
                let home = staging_home()?;
                let login = match crate::antigravity_acp::Login::start(&home, false) {
                    Ok(login) => login,
                    Err(error) => {
                        cleanup_home(&attempt.provider, &home);
                        return Err(error);
                    }
                };
                draft.attempt = Some(Attempt {
                    id: attempt.id,
                    provider: attempt.provider,
                    name: attempt.name,
                    home,
                    login: Runner::Google(login),
                });
                return Ok(LoginResult {
                    attempt_id: attempt_id.into(),
                    progress: Progress { status: "pending".into(), ..Default::default() },
                    account: None,
                });
            }
            Some(result?)
        } else {
            cleanup_home(&attempt.provider, &attempt.home);
            None
        };
        Ok(LoginResult {
            attempt_id: attempt_id.into(),
            progress,
            account,
        })
    })
}

pub fn cancel(id: &str) -> Result<(), String> {
    with_draft(id, |draft| {
        if let Some(mut attempt) = draft.attempt.take() {
            attempt.login.stop();
            cleanup_home(&attempt.provider, &attempt.home);
        }
        Ok(())
    })
}
pub fn submit_code(id: &str, code: &str) -> Result<(), String> {
    with_draft(id, |draft| {
        draft
            .attempt
            .as_mut()
            .ok_or("This sign-in was cancelled.")?
            .login
            .submit_code(code)
    })
}

/// Validate every selection before any permanent writes, then roll back new indexes on failure.
pub fn commit(
    id: &str,
    workspace_id: Option<String>,
    name: &str,
    accent: &str,
    selected: &[String],
) -> Result<settings::AppSettings, String> {
    with_draft(id, |draft| {
        if draft.attempt.is_some() {
            return Err("Finish or cancel sign-in before saving.".into());
        }
        if selected.is_empty()
            || selected
                .iter()
                .any(|id| !draft.entries.iter().any(|e| &e.account.id == id))
        {
            return Err("Choose at least one verified account.".into());
        }
        if workspace_id.is_some() && draft.entries.iter().any(|entry|
            selected.contains(&entry.account.id) && entry.account.already_added)
        {
            return Err("This account is already added to Orbilap.".into());
        }
        workspaces::validate_destination(workspace_id.as_deref(), name, accent)?;
        for entry in draft
            .entries
            .iter()
            .filter(|e| selected.contains(&e.account.id))
        {
            let (identity, email, _) = inspect(
                &entry.account.provider,
                &entry.home,
                entry.existing.as_deref(),
            )?;
            let matches = if entry.account.provider == "antigravity" && entry.existing.is_some() {
                email.is_some_and(|verified| verified.eq_ignore_ascii_case(&entry.identity))
            } else { identity == entry.identity };
            if !matches {
                return Err("An account changed. Load it again before saving.".into());
            }
        }
        let mut codex = vec![];
        let mut claude = vec![];
        let mut agy = vec![];
        let mut created: Vec<(String, String)> = vec![];
        let mut device_links = vec![];
        let mut active_accounts = std::collections::BTreeMap::new();
        let result = (|| {
            for entry in draft
                .entries
                .iter()
                .filter(|e| selected.contains(&e.account.id))
            {
                let provider = entry.account.provider.as_str();
                let (id, new) = if let Some(id) = &entry.existing {
                    if provider == "codex" { profiles::adopt_setup_name(id, &entry.account.name)?; }
                    (id.clone(), false)
                } else if provider == "codex" {
                    profiles::import_or_reuse(&entry.account.name, &entry.home.join("auth.json"))?
                } else if provider == "claude" {
                    claude_profiles::adopt_config(
                        &entry.account.name,
                        &entry.home,
                        entry.account.email.clone(),
                        entry.account.subscription.clone(),
                    )?
                } else {
                    crate::antigravity::save(&entry.account.name, &entry.home)?
                };
                if entry.account.active { active_accounts.insert(provider.to_owned(), id.clone()); }
                if crate::device_sync::ENABLED {
                    if let Ok(identity) = device_key(entry) {
                        device_links.push((provider.to_owned(), identity, id.clone()));
                    }
                }
                if new {
                    created.push((provider.into(), id.clone()));
                }
                match provider {
                    "codex" => codex.push(id),
                    "claude" => claude.push(id),
                    _ => agy.push(id),
                }
            }
            workspaces::commit_accounts_with_active(workspace_id, name, accent, codex, claude, agy, active_accounts)
        })();
        if result.is_err() {
            for (provider, id) in created {
                match provider.as_str() {
                    "codex" => {
                        let _ = profiles::remove(&id);
                    }
                    "claude" => {
                        let _ = claude_profiles::edit(&id, None);
                    }
                    _ => {
                        let _ = crate::antigravity::remove(&id);
                    }
                }
            }
        }
        if result.is_ok() {
            for (provider, identity, profile) in device_links {
                crate::device_sync::bind_saved(&provider, &identity, &profile);
            }
            for entry in &mut draft.entries {
                if selected.contains(&entry.account.id) && entry.account.provider == "claude" {
                    entry.owned = false;
                }
            }
        }
        result
    })
}

struct GoogleIdentity {
    fingerprint: [u8; 32],
    email: String,
    checked_at: std::time::Instant,
}

fn cached_google_identity(
    cache: &mut Option<GoogleIdentity>, credentials: &[u8], now: std::time::Instant,
    verify: impl FnOnce() -> Option<String>,
) -> Option<String> {
    use sha2::{Digest, Sha256};
    let fingerprint: [u8; 32] = Sha256::digest(credentials).into();
    if let Some(previous) = cache.as_ref().filter(|previous| previous.fingerprint == fingerprint
        && now.saturating_duration_since(previous.checked_at) < std::time::Duration::from_secs(60)) {
        return Some(previous.email.clone());
    }
    // Never keep a successful identity after verification fails or the login changes.
    *cache = None;
    let email = verify()?;
    *cache = Some(GoogleIdentity { fingerprint, email: email.clone(), checked_at: now });
    Some(email)
}

/// Confirm the ambient identity in a disposable OAuth copy. Reuse a recent
/// verification only while the exact shared credentials remain unchanged.
pub(crate) fn current_google_email() -> Option<String> {
    static IDENTITY: Mutex<Option<GoogleIdentity>> = Mutex::new(None);
    if !google_desktop_installed() && cli::which_binary("agy").is_none() {
        return None;
    }
    let home = staging_home().ok()?;
    let email = (|| {
        crate::antigravity::copy_current(&home).ok()?;
        let credentials = std::fs::read(home.join("auth.json")).ok()?;
        let mut cache = IDENTITY.lock().ok()?;
        cached_google_identity(&mut cache, &credentials, std::time::Instant::now(),
            || crate::antigravity::verified_email(&home).ok())
    })();
    cleanup_home("antigravity", &home);
    email
}

fn discover_current_google(draft: &mut Draft, name: String) -> Result<Account, String> {
    discover_current_google_with_deadline(draft, name, None)
}

fn discover_current_google_with_deadline(draft: &mut Draft, name: String, deadline: Option<std::time::Instant>) -> Result<Account, String> {
    let home = staging_home()?;
    if let Err(error) = crate::antigravity::copy_current_with_deadline(&home, deadline) {
        cleanup_home("antigravity", &home);
        return Err(error);
    }
    let mut account = add_entry_with_deadline(draft, "antigravity", name, home, None, true, deadline)?;
    mark_active(draft, &mut account);
    Ok(account)
}

pub fn current_google(id: &str, name: &str) -> Result<Account, String> {
    let name = account_name(name)?;
    with_draft(id, |draft| discover_current_google(draft, name))
}

#[cfg(test)]
mod tests {
    #[test]
    fn google_identity_cache_requires_identical_credentials_and_recent_success() {
        use super::cached_google_identity;
        use std::time::{Duration, Instant};
        let now = Instant::now();
        let mut cache = None;
        assert_eq!(cached_google_identity(&mut cache, b"synthetic-one", now, || Some("one@example.com".into())).as_deref(), Some("one@example.com"));
        assert_eq!(cached_google_identity(&mut cache, b"synthetic-one", now + Duration::from_secs(59), || panic!("Unchanged login was verified again")).as_deref(), Some("one@example.com"));
        assert_eq!(cached_google_identity(&mut cache, b"synthetic-two", now + Duration::from_secs(59), || Some("two@example.com".into())).as_deref(), Some("two@example.com"));
        assert!(cached_google_identity(&mut cache, b"synthetic-two", now + Duration::from_secs(119), || None).is_none());
        assert!(cache.is_none(), "A failed verification retained the old active identity");
        assert_eq!(cached_google_identity(&mut cache, b"synthetic-two", now + Duration::from_secs(120), || Some("two@example.com".into())).as_deref(), Some("two@example.com"));
        assert!(cached_google_identity(&mut cache, b"synthetic-three", now + Duration::from_secs(121), || None).is_none());
        assert!(cache.is_none(), "A changed login retained another account's identity");
    }

    use super::*;
    fn fixture() -> PathBuf {
        let root =
            std::env::temp_dir().join(format!("orbilap-draft-test-{}", uuid::Uuid::new_v4()));
        profiles::private_dir(&root).unwrap();
        root
    }
    #[test]
    #[ignore = "Opt-in: validates the current saved orphan Google login in a disposable enrollment, without committing"]
    fn live_orphaned_google_enrollment() {
        assert_eq!(std::env::var("ORBILAP_RUN_ORPHAN_LIVE").as_deref(), Ok("1"));
        struct Cleanup(String);
        impl Drop for Cleanup { fn drop(&mut self) { let _ = discard(&self.0); } }
        let session = Cleanup(begin().unwrap());
        let initial = start(&session.0, "antigravity", "browser", "").unwrap();
        let started = std::time::Instant::now();
        loop {
            let result = poll(&session.0, &initial.attempt_id).unwrap();
            assert!(result.progress.auth_url.is_none(), "saved login should not request a browser");
            if result.progress.status != "pending" {
                assert_eq!(result.progress.status, "completed", "{}", result.progress.error.unwrap_or_default());
                let account = result.account.expect("verified account must be staged");
                assert!(!account.already_added, "orphan login must be selectable for final Add accounts");
                assert!(!account.name.is_empty()); assert!(account.email.is_some());
                println!("Orphan enrollment verified: selectable=true, plan={:?}, elapsed_ms={}", account.subscription.plan, started.elapsed().as_millis());
                break;
            }
            assert!(started.elapsed() < std::time::Duration::from_secs(120));
            std::thread::sleep(std::time::Duration::from_millis(50));
        }
    }
    #[test]
    #[ignore = "Opt-in: starts official Google account selection when a saved account is enrolled, then cancels"]
    fn live_add_another_google_account_link() {
        assert_eq!(std::env::var("ORBILAP_RUN_NEW_GOOGLE_LIVE").as_deref(), Ok("1"));
        struct Cleanup(String);
        impl Drop for Cleanup { fn drop(&mut self) { let _ = discard(&self.0); } }
        let session = Cleanup(begin().unwrap());
        let login = start(&session.0, "antigravity", "browser", "").unwrap();
        let started = std::time::Instant::now();
        loop {
            let result = poll(&session.0, &login.attempt_id).unwrap();
            if let Some(url) = result.progress.auth_url {
                let url = reqwest::Url::parse(&url).unwrap();
                assert_eq!(url.host_str(), Some("accounts.google.com"));
                assert_eq!(url.query_pairs().find(|(k, _)| k == "prompt").unwrap().1, "select_account consent");
                println!("Add another Google account verified: account_choice=true, elapsed_ms={}", started.elapsed().as_millis());
                break;
            }
            assert_eq!(result.progress.status, "pending", "{}", result.progress.error.unwrap_or_default());
            assert!(started.elapsed() < std::time::Duration::from_secs(90));
            std::thread::sleep(std::time::Duration::from_millis(50));
        }
    }
    #[test]
    fn orphaned_antigravity_login_can_be_added_again() {
        let saved = crate::antigravity::Saved { id:"orphan".into(), name:"Google".into(), home:"unused".into(), email:Some("one@example.com".into()), subscription:None };
        let app = settings::AppSettings::default();
        assert!(!google_account_is_added(&[saved.clone()], Some("one@example.com"), &app), "a saved token without a workspace card must not be treated as already added");
        let mut app = app;
        app.workspaces.push(serde_json::from_value(serde_json::json!({"id":"studio","name":"Studio","accent":"#007aff","accountIds":[],"antigravityAccountIds":["orphan"]})).unwrap());
        assert!(google_account_is_added(&[saved.clone()], Some("ONE@example.com"), &app), "an actual workspace member remains a duplicate");
        assert!(!google_account_is_added(&[saved], Some("other@example.com"), &app));
    }
    #[test]
    #[ignore = "requires an existing paid local account; stages and discards live discovery"]
    fn live_discovery_finishes_within_five_seconds() {
        let id = begin().unwrap();
        let started = std::time::Instant::now();
        let result = discover(&id, None);
        let elapsed = started.elapsed();
        eprintln!("Live discovery: {:?}; verified account count={}", elapsed, result.as_ref().map(|v| v.len()).unwrap_or(0));
        discard(&id).unwrap();
        assert!(!result.unwrap().is_empty(), "requires an existing paid local account");
        assert!(elapsed < std::time::Duration::from_secs(5), "discovery exceeded five seconds: {elapsed:?}");
    }

    fn discovery_entry(provider: &str, home: PathBuf, owned: bool) -> Entry {
        Entry {
            account: Account { id: provider.into(), provider: provider.into(), name: provider.into(), display_name: None,
                active: true, already_added: false, email: None, source: Some(AccountSource::Saved),
                subscription: Subscription { id: provider.into(), service: provider.into(), plan: Some("plus".into()),
                    expires_at: None, status: None, monthly_price_usd: None, billing: None } },
            home, existing: Some(provider.into()), owned, identity: provider.into(),
        }
    }

    #[test]
    fn discovery_preserves_owned_entries_and_ids_on_error_or_worker_panic() {
        for panic in [false, true] {
            let root = fixture();
            let mut draft = Draft::default();
            draft.entries = ["codex", "claude", "antigravity"].into_iter()
                .map(|provider| { let home = root.join(provider); profiles::private_dir(&home).unwrap();
                    discovery_entry(provider, home, true) }).collect();
            let result = discover_providers(&mut draft, None, |worker, provider, _| {
                assert_eq!(worker.entries.len(), 1);
                assert_eq!(worker.entries[0].account.id, provider);
                if provider == "claude" {
                    if panic { panic!("synthetic worker failure"); }
                    return Err("synthetic verification failure".into());
                }
                Ok(worker.entries.iter().map(|entry| entry.account.clone()).collect())
            });
            assert!(result.is_err());
            assert_eq!(draft.entries.iter().map(|e| e.account.id.as_str()).collect::<Vec<_>>(),
                vec!["codex", "claude", "antigravity"]);
            assert!(draft.entries.iter().all(|entry| entry.home.is_dir() && entry.account.active));
            drop(draft);
            assert!(["codex", "claude", "antigravity"].iter().all(|provider| !root.join(provider).exists()));
            std::fs::remove_dir_all(root).unwrap();
        }
    }

    #[test]
    fn discovery_keeps_other_provider_entries_and_stable_result_order() {
        let mut draft = Draft::default();
        draft.entries = ["codex", "claude", "antigravity"].into_iter()
            .map(|provider| discovery_entry(provider, PathBuf::new(), false)).collect();
        let found = discover_providers(&mut draft, Some("claude"), |worker, _, _| {
            Ok(worker.entries.iter().map(|entry| entry.account.clone()).collect())
        }).unwrap();
        assert_eq!(found[0].id, "claude");
        assert_eq!(draft.entries.len(), 3);
        let found = discover_providers(&mut draft, None, |worker, _, _| {
            Ok(worker.entries.iter().map(|entry| entry.account.clone()).collect())
        }).unwrap();
        assert_eq!(found.iter().map(|a| a.id.as_str()).collect::<Vec<_>>(), vec!["codex", "claude", "antigravity"]);
    }

    #[test]
    fn usage_and_optional_name_overlap_and_usage_errors_still_block_enrollment() {
        use std::sync::mpsc;
        use std::time::Duration;
        let (usage_started, wait_usage) = mpsc::channel();
        let (name_started, wait_name) = mpsc::channel();
        let name = verify_with_metadata(|| {
            usage_started.send(()).unwrap();
            wait_name.recv_timeout(Duration::from_millis(500)).map_err(|_| "name did not overlap usage")?;
            Ok(())
        }, move || {
            name_started.send(()).unwrap();
            wait_usage.recv_timeout(Duration::from_millis(500)).unwrap();
            Some("Verified name")
        }).unwrap();
        assert_eq!(name, Some("Verified name"));
        assert_eq!(verify_with_metadata(|| Err("usage unavailable".into()), || Some("name")).unwrap_err(), "usage unavailable");
        assert_eq!(verify_with_metadata(|| Ok(()), || None::<String>).unwrap(), None);
    }

    #[test]
    fn discovery_wait_measurement_uses_slowest_provider_instead_of_sum() {
        use std::time::{Duration, Instant};
        let mut draft = Draft::default();
        let started = Instant::now();
        for _ in 0..3 { std::thread::sleep(Duration::from_millis(80)); }
        let sequential = started.elapsed();
        let started = Instant::now();
        discover_providers(&mut draft, None, |_, _, _| {
            std::thread::sleep(Duration::from_millis(80));
            Ok(vec![])
        }).unwrap();
        eprintln!("Controlled provider waits: sequential={}ms, concurrent={}ms", sequential.as_millis(), started.elapsed().as_millis());
    }

    #[test]
    fn discovery_overlaps_providers_instead_of_adding_their_waits() {
        use std::sync::atomic::{AtomicUsize, Ordering};
        use std::time::{Duration, Instant};
        let started = AtomicUsize::new(0);
        let mut draft = Draft::default();
        let result = discover_providers(&mut draft, None, |_, _, include_saved| {
            assert!(include_saved);
            started.fetch_add(1, Ordering::SeqCst);
            let deadline = Instant::now() + Duration::from_millis(500);
            while started.load(Ordering::SeqCst) < 3 {
                if Instant::now() >= deadline { return Err("providers are waiting sequentially".into()); }
                std::thread::sleep(Duration::from_millis(1));
            }
            Ok(vec![])
        });
        assert!(result.is_ok(), "{}", result.err().unwrap_or_default());
    }

    #[test]
    fn provider_filtered_discovery_does_not_scan_saved_or_other_providers() {
        let mut draft = Draft::default();
        let calls = std::sync::atomic::AtomicUsize::new(0);
        discover_providers(&mut draft, Some("claude"), |_, provider, saved| {
            assert_eq!(provider, "claude");
            assert!(!saved);
            calls.fetch_add(1, std::sync::atomic::Ordering::SeqCst);
            Ok(vec![])
        }).unwrap();
        assert_eq!(calls.load(std::sync::atomic::Ordering::SeqCst), 1);
    }

    #[test]
    fn codex_discovers_a_shared_cache_once_and_uses_an_override_first() {
        let desktop = PathBuf::from("default");
        let cli = PathBuf::from("override");
        assert!(codex_candidates(None, None).is_empty());
        assert_eq!(codex_candidates(None, Some(cli.clone())), vec![(cli.clone(), AccountSource::Cli)]);
        assert_eq!(codex_candidates(Some(desktop.clone()), None), vec![(desktop.clone(), AccountSource::Desktop)]);
        assert_eq!(codex_candidates(Some(desktop.clone()), Some(desktop.clone())), vec![(desktop.clone(), AccountSource::Desktop)]);
        assert_eq!(codex_candidates(Some(desktop.clone()), Some(cli.clone())), vec![(cli, AccountSource::Cli), (desktop, AccountSource::Desktop)]);
    }

    #[test]
    fn discovery_scans_separate_homes_and_collapses_shared_home() {
        let desktop = PathBuf::from("desktop");
        let cli = PathBuf::from("cli");
        assert_eq!(selected_homes(Some(desktop.clone()), Some(cli.clone())), vec![desktop.clone(), cli]);
        assert_eq!(selected_homes(Some(desktop.clone()), Some(desktop.clone())), vec![desktop]);
    }

    #[test]
    fn new_codex_enrollment_prefers_live_name_and_has_safe_fallbacks() {
        let auth = serde_json::json!({});
        assert_eq!(fresh_codex_name(Some("New Codex name"), Some(&auth)), "New Codex name");
        assert_eq!(fresh_codex_name(Some("  "), Some(&auth)), "ChatGPT account");
        assert_eq!(fresh_codex_name(None, None), "ChatGPT account");
    }

    #[test]
    fn codex_sign_in_defers_blank_names_to_verified_identity() {
        assert_eq!(enrollment_name("codex", "").unwrap(), "");
        assert_eq!(enrollment_name("codex", "  ").unwrap(), "");
        assert_eq!(enrollment_name("codex", " Work ").unwrap(), "Work");
        assert!(enrollment_name("claude", "").is_err());
        assert_eq!(enrollment_name("antigravity", "").unwrap(), "");
        assert!(enrollment_name("codex", &"x".repeat(65)).is_err());
    }

    #[test]
    fn failed_or_empty_usage_is_excluded_but_limited_accounts_are_valid() {
        use crate::quota::{QuotaSet, QuotaWindow};
        assert!(require_loaded_usage(None).is_err());
        let mut quota = QuotaSet { provider: "codex".into(), windows: Some(vec![]), error: None, reset_credits: None, as_of: None };
        assert!(require_loaded_usage(Some(&quota)).is_err());
        quota.windows = Some(vec![QuotaWindow { window: "weekly".into(), percent: 100.0, resets_at: None, status: None }]);
        assert!(require_loaded_usage(Some(&quota)).is_ok());
        quota.error = Some("offline".into());
        assert!(require_loaded_usage(Some(&quota)).is_err());
    }

    #[test]
    fn current_logins_are_exclusive_only_inside_their_own_provider() {
        let account = |provider: &str, id: &str| Account { id: id.into(), provider: provider.into(), name: id.into(), display_name: None, active: false, already_added: false, email: None, source: None, subscription: Subscription { id: provider.into(), service: provider.into(), plan: Some("plus".into()), status: None, expires_at: None, monthly_price_usd: None, billing: None } };
        let codex = account("codex", "codex-current");
        let claude = account("claude", "claude-current");
        let backup = account("codex", "codex-backup");
        let mut draft = Draft::default();
        draft.entries = [codex.clone(), claude.clone(), backup.clone()].into_iter().map(|account| Entry { identity: account.id.clone(), account, home: PathBuf::new(), existing: None, owned: false }).collect();
        mark_active(&mut draft, &mut codex.clone());
        mark_active(&mut draft, &mut claude.clone());
        assert!(draft.entries[0].account.active && draft.entries[1].account.active);
        mark_active(&mut draft, &mut backup.clone());
        assert!(!draft.entries[0].account.active);
        assert!(draft.entries[1].account.active && draft.entries[2].account.active);
    }

    #[test]
    fn import_rejects_invalid_oversized_and_symlink_sources_before_writing() {
        let root = fixture();
        let home = root.join("draft");
        profiles::private_dir(&home).unwrap();
        let source = root.join("source.json");
        std::fs::write(&source, "not JSON").unwrap();
        assert!(copy_auth(&source, &home).is_err());
        std::fs::write(&source, vec![b' '; 256 * 1024 + 1]).unwrap();
        assert!(copy_auth(&source, &home).is_err());
        #[cfg(unix)]
        {
            let link = root.join("link.json");
            std::os::unix::fs::symlink(&source, &link).unwrap();
            assert!(copy_auth(&link, &home).is_err());
        }
        assert!(!home.join("auth.json").exists());
        std::fs::remove_dir_all(root).unwrap();
    }
    #[test]
    fn discarding_draft_removes_only_owned_homes_without_touching_referenced_logins() {
        let root = fixture();
        let owned = root.join("owned");
        let external = root.join("external");
        for home in [&owned, &external] {
            profiles::private_dir(home).unwrap();
            profiles::write_private(
                &home.join("auth.json"),
                &serde_json::json!({"synthetic":"secret"}),
            )
            .unwrap();
        }
        let make = |home: PathBuf, owned: bool| Entry {
            account: Account {
                id: uuid::Uuid::new_v4().to_string(),
                provider: "codex".into(),
                name: "Test".into(),
                display_name: None,
                active: false,
                already_added: false,
                email: None,
                source: None,
                subscription: Subscription {
                    id: "chatgpt".into(),
                    service: "ChatGPT".into(),
                    plan: Some("plus".into()),
                    status: None,
                    expires_at: None,
                    monthly_price_usd: None, billing: None,
                },
            },
            home,
            owned,
            existing: None,
            identity: "test".into(),
        };
        let mut draft = Draft::default();
        draft.entries = vec![make(owned.clone(), true), make(external.clone(), false)];
        drop(draft);
        assert!(!owned.exists());
        assert!(external.join("auth.json").exists());
        std::fs::remove_dir_all(root).unwrap();
    }
    #[test]
    fn adding_an_already_saved_account_is_rejected_before_any_permanent_write() {
        let session = begin().unwrap();
        let account_id = "already-saved".to_string();
        with_draft(&session, |draft| {
            draft.entries.push(Entry {
                account: Account {
                    id: account_id.clone(), provider: "codex".into(), name: "Saved".into(),
                    display_name: None, active: false, already_added: true, email: None,
                    source: Some(AccountSource::Saved),
                    subscription: Subscription { id: "chatgpt".into(), service: "ChatGPT".into(), plan: Some("plus".into()), status: None, expires_at: None, monthly_price_usd: None, billing: None },
                },
                home: PathBuf::new(), existing: Some("saved-profile".into()), owned: false, identity: "saved-identity".into(),
            });
            Ok(())
        }).unwrap();
        let error = commit(&session, Some("workspace".into()), "Workspace", "#7c6cf0", &[account_id]).unwrap_err();
        assert_eq!(error, "This account is already added to Orbilap.");
        discard(&session).unwrap();
    }

    #[test]
    fn google_file_import_is_rejected_before_session_access_or_file_read() {
        for provider in ["antigravity"] {
            for (credentials, path) in [(Some("{}".into()), None), (None, Some("/not/read/session.json".into()))] {
                let error = import("missing", provider, "", credentials, path).err().unwrap();
                assert!(error.starts_with("Login-file import is only supported for Codex."));
            }
        }
    }

    #[test]
    fn unknown_session_or_provider_never_starts_authentication() {
        assert!(start("missing", "codex", "browser", "Test").is_err());
        assert!(start("missing", "claude", "file", "Test").is_err());
        let session = begin().unwrap();
        for provider in ["gemini", "gemini-app"] {
            let error = start(&session, provider, "browser", "Test").err().unwrap();
            assert_eq!(error, "Choose an available sign-in method.");
        }
        discard(&session).unwrap();
        assert!(account_name(
            "
"
        )
        .is_err());
        assert!(account_name(&"x".repeat(65)).is_err());
    }
}

/// Save only an owned, verified Codex draft; credentials never cross back to JS.
pub fn reconnect(id: &str, account_id: &str, profile_id: &str) -> Result<profiles::ProfilesState, String> {
    with_draft(id, |draft| {
        if draft.attempt.is_some() { return Err("Finish or cancel sign-in first.".into()); }
        let entry = draft.entries.iter().find(|entry| entry.account.id == account_id
            && entry.account.provider == "codex" && entry.owned)
            .ok_or("Verify a fresh ChatGPT login first.")?;
        profiles::reconnect_file(profile_id, &entry.home.join("auth.json"))
    })
}
