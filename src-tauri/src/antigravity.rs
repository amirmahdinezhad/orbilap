//! Account-scoped Antigravity credentials and verified Google quota reads.
//! Enrollment stays isolated; only explicit activation updates the shared AGY Keychain login.
use crate::{
    paths,
    profiles::{private_dir, write_private},
    subscriptions::Subscription,
};
use serde::{Deserialize, Serialize};
use serde_json::{json, Value};
use std::{
    collections::HashMap,
    io::Read,
    path::{Path, PathBuf},
    sync::{
        Arc, LazyLock, Mutex, RwLock, Weak,
    },
    time::{Duration, Instant},
};

// Mutations exclude usage readers; independent accounts can fetch usage together.
// Token rotation remains serialized for each account, including menu-bar reads.
static REPOSITORY: LazyLock<RwLock<()>> = LazyLock::new(|| RwLock::new(()));
static ACCOUNT_READS: LazyLock<Mutex<HashMap<String, Weak<Mutex<()>>>>> =
    LazyLock::new(|| Mutex::new(HashMap::new()));
fn with_repository<T>(action: impl FnOnce() -> Result<T, String>) -> Result<T, String> {
    let _guard = REPOSITORY
        .write()
        .map_err(|_| "Antigravity accounts are busy. Try again.")?;
    action()
}

fn usage_lock<T>(deadline: Instant, mut attempt: impl FnMut() -> Result<T, std::sync::TryLockError<T>>) -> Result<T, String> {
    loop {
        let remaining = deadline.saturating_duration_since(Instant::now());
        if remaining.is_zero() { return Err(GOOGLE_TIMEOUT.into()); }
        match attempt() {
            Ok(guard) => return Ok(guard),
            Err(std::sync::TryLockError::Poisoned(_)) => return Err("Cannot load Antigravity accounts. Restart Orbilap and retry.".into()),
            Err(std::sync::TryLockError::WouldBlock) => std::thread::sleep(remaining.min(Duration::from_millis(10))),
        }
    }
}

fn with_account_usage<T>(id: &str, deadline: Instant, action: impl FnOnce() -> Result<T, String>) -> Result<T, String> {
    let _repository = usage_lock(deadline, || REPOSITORY.try_read())?;
    let account = {
        let mut reads = ACCOUNT_READS.lock().map_err(|_| "Antigravity accounts are busy. Try again.")?;
        reads.retain(|_, lock| lock.strong_count() > 0);
        if let Some(lock) = reads.get(id).and_then(Weak::upgrade) { lock }
        else {
            let lock = Arc::new(Mutex::new(()));
            reads.insert(id.to_owned(), Arc::downgrade(&lock));
            lock
        }
    };
    let _account = usage_lock(deadline, || account.try_lock())?;
    action()
}

const TOKEN: &str = "https://oauth2.googleapis.com/token";
const GOOGLE_TIMEOUT: &str = "Google request took too long. Check your VPN connection and retry.";
const CONSUMER: &str = "1071006060591-tmhssin2h21lcre235vtolojh4g403ep.apps.googleusercontent.com";
#[derive(Clone)]
struct Client {
    id: String,
    secret: String,
}
fn http() -> Result<reqwest::blocking::Client, String> {
    // A new operation must observe current system proxy settings after VPN changes.
    reqwest::blocking::Client::builder()
        .timeout(Duration::from_secs(20))
        .redirect(reqwest::redirect::Policy::none())
        .user_agent(format!(
            "antigravity/hub/2.24.0 (aidev_client; os_type=darwin; arch={}; cl=963137146)",
            if cfg!(target_arch = "aarch64") {
                "arm64"
            } else {
                "amd64"
            }
        ))
        .build()
        .map_err(|_| "Cannot initialize Google connection.".to_string())
}
#[derive(Debug)]
pub(crate) enum VerificationError {
    InvalidGrant,
    Other(String),
}

impl From<String> for VerificationError {
    fn from(message: String) -> Self { Self::Other(message) }
}

impl From<&str> for VerificationError {
    fn from(message: &str) -> Self { Self::Other(message.into()) }
}

impl From<VerificationError> for String {
    fn from(error: VerificationError) -> Self {
        match error {
            VerificationError::InvalidGrant => "Google could not verify this account (HTTP 400). Sign in again or check account access.".into(),
            VerificationError::Other(message) => message,
        }
    }
}

fn json_response(request: reqwest::blocking::RequestBuilder) -> Result<Value, VerificationError> {
    let response = request
        .send()
        .map_err(|error| if error.is_timeout() { GOOGLE_TIMEOUT } else { "Cannot reach Google. Check your connection and retry." })?;
    let status = response.status();
    if !status.is_success() {
        if status == reqwest::StatusCode::BAD_REQUEST && response.url().as_str() == TOKEN {
            let mut body = Vec::new();
            if response.take(16 * 1024).read_to_end(&mut body).is_ok()
                && serde_json::from_slice::<Value>(&body).ok().is_some_and(|body| body["error"] == "invalid_grant")
            {
                return Err(VerificationError::InvalidGrant);
            }
        }
        return Err(format!("Google could not verify this account (HTTP {}). Sign in again or check account access.", status.as_u16()).into());
    }
    let bytes = response
        .take(1024 * 1024)
        .bytes()
        .collect::<Result<Vec<_>, _>>()
        .map_err(|_| "Cannot read Google's response.")?;
    serde_json::from_slice(&bytes).map_err(|_| "Google returned an unsupported response.".into())
}
/// One absolute budget covers all automatic-discovery requests, including
/// reading a response body. Manual sign-in keeps the normal request timeout.
struct Probe {
    client: reqwest::blocking::Client,
    deadline: Option<Instant>,
}
impl Probe {
    fn for_usage() -> Result<Self, String> {
        Self::new(Some(Instant::now() + Duration::from_secs(12)))
    }
    fn new(deadline: Option<Instant>) -> Result<Self, String> {
        Ok(Self { client: http()?, deadline })
    }
    fn request(&self, request: reqwest::blocking::RequestBuilder) -> Result<reqwest::blocking::RequestBuilder, String> {
        let request = if let Some(deadline) = self.deadline {
            let remaining = deadline.saturating_duration_since(Instant::now());
            if remaining.is_zero() { return Err(GOOGLE_TIMEOUT.into()); }
            request.timeout(remaining)
        } else { request };
        Ok(request)
    }
    fn json(&self, request: reqwest::blocking::RequestBuilder) -> Result<Value, VerificationError> {
        json_response(self.request(request)?)
    }
}

fn string(value: &Value, keys: &[&str]) -> Option<String> {
    keys.iter().find_map(|k| {
        value[*k]
            .as_str()
            .filter(|s| !s.trim().is_empty())
            .map(str::to_owned)
    })
}
fn credentials(home: &Path) -> Result<Value, String> {
    let raw = std::fs::read(home.join("auth.json"))
        .map_err(|_| "Choose a Google credentials JSON file.")?;
    if raw.len() > 256 * 1024 {
        return Err("Use a credentials file smaller than 256 KB.".into());
    }
    let input: Value =
        serde_json::from_slice(&raw).map_err(|_| "This is not valid Google credentials JSON.")?;
    let tokens = input.get("token").unwrap_or(&input);
    let mut value = json!({
        "access_token":string(tokens,&["access_token","accessToken"]),
        "refresh_token":string(tokens,&["refresh_token","refreshToken"]),
        "email":string(&input,&["email"]),
        "google_name":string(&input,&["google_name"]),
        "project_id":string(&input,&["project_id","projectId"]),
        "client_id":string(&input,&["client_id","clientId"]),
        "client_secret":string(&input,&["client_secret","clientSecret"]),
        "expiry_date": input.get("expiry_date").or(input.get("expiresAt")).cloned().or_else(|| tokens["expiry"].as_str().and_then(|v| crate::timestamps::parse_rfc3339(v).ok()).map(|v| json!(crate::timestamps::unix_millis(v)))).unwrap_or(Value::Null),
        "id_token": input.get("id_token").or(tokens.get("id_token")).cloned().unwrap_or(Value::Null),
    });
    if value["refresh_token"].as_str().is_none() {
        return Err("This file has no Google refresh token. Use Sign in with Google.".into());
    }
    if value["client_id"].as_str().is_none() || value["client_secret"].as_str().is_none() {
        let client = resolve_client()?;
        value["client_id"] = client.id.into();
        value["client_secret"] = client.secret.into();
    }
    Ok(value)
}
/// Server-confirm email and paidTier; model availability and quota percentages are not proof of a paid plan.
pub fn inspect(home: &Path) -> Result<(String, Option<String>, Subscription), String> {
    with_repository(|| inspect_unlocked(home))
}
fn verified_user(home: &Path, probe: &Probe) -> Result<(Value, String, String), VerificationError> {
    verified_user_credentials(refreshed_credentials(home, probe)?, probe)
}

fn refreshed_credentials(home: &Path, probe: &Probe) -> Result<Value, VerificationError> {
    let mut value = credentials(home)?;
    let expired = value["expiry_date"].as_i64().map_or(true, |ms| {
        ms <= crate::timestamps::unix_millis(time::OffsetDateTime::now_utc()) + 60_000
    });
    if expired || value["access_token"].as_str().is_none() {
        let token = probe.json(probe.client.post(TOKEN).form(&[
            ("grant_type", "refresh_token"),
            ("refresh_token", value["refresh_token"].as_str().unwrap()),
            ("client_id", value["client_id"].as_str().unwrap()),
            ("client_secret", value["client_secret"].as_str().unwrap()),
        ]))?;
        value["access_token"] = token["access_token"].clone();
        if token["id_token"].is_string() { value["id_token"] = token["id_token"].clone(); }
        value["expiry_date"] = (crate::timestamps::unix_millis(time::OffsetDateTime::now_utc())
            + token["expires_in"].as_i64().unwrap_or(3600) * 1000)
            .into();
        if let Some(refresh) = token["refresh_token"].as_str() {
            value["refresh_token"] = refresh.into();
        }
        write_private(&home.join("auth.json"), &value)?;
    }
    Ok(value)
}

fn verified_user_credentials(mut value: Value, probe: &Probe) -> Result<(Value, String, String), VerificationError> {
    let token = value["access_token"]
        .as_str()
        .ok_or("Google did not return a valid access token.")?;
    let user = probe.json(
        probe.client
            .get("https://www.googleapis.com/oauth2/v2/userinfo")
            .bearer_auth(token),
    )?;
    let email = string(&user, &["email"]).ok_or("Google could not verify the account email.")?;
    if value["email"].as_str().is_some_and(|old| old != email) {
        return Err("Google returned a different account. Sign in again.".into());
    }
    let identity =
        string(&user, &["id"]).ok_or("Google could not verify this account's identity.")?;
    // Replace local metadata only with this request's authenticated Google response.
    value["google_name"] = google_profile_name(&user).map(Value::String).unwrap_or(Value::Null);
    Ok((value, identity, email))
}

fn google_profile_name(user: &Value) -> Option<String> {
    string(user, &["name"]).or_else(|| {
        match (string(user, &["given_name"]), string(user, &["family_name"])) {
            (Some(given), Some(family)) => Some(format!("{} {}", given.trim(), family.trim())),
            (given, family) => given.or(family),
        }
    })
}

fn normalized_label(auth: &Value, keys: &[&str]) -> Option<String> {
    string(auth, keys)
        .map(|s| s.chars().filter(|c| !c.is_control()).take(64).collect::<String>().trim().to_owned())
        .filter(|s| !s.is_empty())
}

/// Display names come from Google; unknown names use the verified email.
pub(crate) fn account_label(auth: &Value) -> Option<String> {
    normalized_label(auth, &["google_name", "email"])
}

pub(crate) fn verified_email(home: &Path) -> Result<String, String> {
    let (_, _, email) = verified_user(home, &Probe::new(None)?)?;
    Ok(email)
}

fn inspect_unlocked(home: &Path) -> Result<(String, Option<String>, Subscription), String> {
    inspect_with_probe(home, &Probe::new(None)?).map_err(String::from)
}

fn inspect_with_probe(home: &Path, probe: &Probe) -> Result<(String, Option<String>, Subscription), VerificationError> {
    inspect_credentials(home, refreshed_credentials(home, probe)?, probe)
}

fn inspect_credentials(home: &Path, value: Value, probe: &Probe) -> Result<(String, Option<String>, Subscription), VerificationError> {
    let token = value["access_token"].as_str().ok_or("Google did not return a valid access token.")?.to_owned();
    let (user, data) = std::thread::scope(|scope| {
        let user = scope.spawn(|| verified_user_credentials(value, probe));
        let data = probe.json(probe.client.post("https://cloudcode-pa.googleapis.com/v1internal:loadCodeAssist").bearer_auth(token)
            .json(&json!({"metadata":{"ideType":"ANTIGRAVITY","platform":"PLATFORM_UNSPECIFIED","pluginType":"GEMINI"}})));
        (user.join().map_err(|_| VerificationError::from("Cannot verify the Google account.")), data)
    });
    let (mut value, identity, email) = user??;
    let data = data?;
    let subscription = paid_subscription(&data)?;
    value["email"] = email.clone().into();
    value["project_id"] = data["cloudaicompanionProject"]
        .as_str()
        .map(str::to_owned)
        .or_else(|| string(&data["cloudaicompanionProject"], &["id", "projectId"]))
        .map(Value::String)
        .unwrap_or(value["project_id"].clone());
    write_private(&home.join("auth.json"), &value)?;
    Ok((identity, Some(email), subscription))
}
fn paid_subscription(data: &Value) -> Result<Subscription, String> {
    let tier = &data["paidTier"];
    let plan = string(tier,&["name","id"]).or_else(|| (data["currentTier"]["id"] == "standard-tier").then(|| "Paid".into()))
        .ok_or("A paid Antigravity plan could not be confirmed. Check your subscription and try again.")?;
    if plan.to_ascii_lowercase().contains("free") || plan.to_ascii_lowercase().contains("trial") {
        return Err("A paid Antigravity plan is required.".into());
    }
    Ok(Subscription {
        id: "antigravity".into(),
        service: "Antigravity".into(),
        plan: Some(plan),
        status: Some("active".into()),
        expires_at: None,
        monthly_price_usd: None, billing: None,
    })
}
#[derive(Clone, Serialize, Deserialize)]
pub struct Saved {
    pub id: String,
    pub name: String,
    pub home: PathBuf,
    pub email: Option<String>,
    pub subscription: Option<Subscription>,
}
impl Saved {
    pub(crate) fn google_display_name(&self) -> Option<String> {
        let home = crate::profiles::managed_account_home(&index(), &self.id, &self.home).ok()?;
        let metadata = std::fs::symlink_metadata(home.join("auth.json")).ok()?;
        if !metadata.is_file() || metadata.len() > 256 * 1024 {
            return None;
        }
        normalized_label(&credentials(&home).ok()?, &["google_name"])
    }
}

fn index() -> PathBuf {
    paths::app_data_dir().join("orbilap-antigravity-profiles/profiles.json")
}
/// Recover a detached saved login; adding another account must start a fresh Google choice.
pub(crate) fn resume_login(home: &Path) -> Result<bool, String> {
    with_repository(|| resume_login_from(&index(), home, &crate::settings::read_settings(&paths::settings_file())))
}
fn resume_login_from(index_path: &Path, home: &Path, app: &crate::settings::AppSettings) -> Result<bool, String> {
        let saved: Vec<Saved> = match std::fs::read(index_path) {
            Ok(raw) => serde_json::from_slice(&raw).map_err(|_| "Cannot read saved Google sign-in. Use another account or retry.")?,
            Err(e) if e.kind() == std::io::ErrorKind::NotFound => return Ok(false),
            Err(_) => return Err("Cannot read saved Google sign-in.".into()),
        };
        if saved.iter().any(|account| app.workspaces.iter().any(|workspace| workspace.antigravity_account_ids.contains(&account.id))) {
            return Ok(false);
        }
        let selected = paths::read_json(&index_path.with_file_name("last-login.json"))
            .and_then(|v| v["id"].as_str().map(str::to_owned));
        let mut current = saved.iter().rev().filter(|account| !expired(account));
        let Some(account) = selected.and_then(|id| current.clone().find(|a| a.id == id))
            .or_else(|| current.next()) else { return Ok(false); };
        let value = credentials(&account.home)?;
        // Legacy grants may only supply email. A fresh browser consent can supply the name.
        if normalized_label(&value, &["google_name"]).is_none() {
            return Ok(false);
        }
        let target = home.join("antigravity-acp"); private_dir(&target)?;
        write_private(&target.join("acp_token.json"), &value)?;
        Ok(true)
}
pub fn list() -> Result<Vec<Saved>, String> {
    let _guard = REPOSITORY.read().map_err(|_| "Antigravity accounts are busy. Try again.")?;
    list_unlocked()
}

fn expired(profile: &Saved) -> bool {
    profile.subscription.as_ref().is_some_and(|s| s.is_expired())
}

pub(crate) fn purge_expired() -> Result<(Vec<String>, bool), String> {
    with_repository(|| {
        let file = index();
        let mut saved = read_index()?;
        let last_login = file.with_file_name("last-login.json");
        let selected = paths::read_json(&last_login).and_then(|v| v["id"].as_str().map(str::to_owned));
        let mut changed = false;
        for profile in saved.iter().filter(|profile| expired(profile)) {
            let home = crate::profiles::managed_account_home(&file, &profile.id, &profile.home)?;
            if selected.as_deref() == Some(&profile.id) {
                std::fs::remove_file(&last_login).map_err(|_| "Cannot clear the last saved Antigravity login.")?;
            }
            crate::profiles::remove_account_home(&home)?;
            changed = true;
        }
        if changed {
            saved.retain(|profile| !expired(profile));
            write_private(&file, &serde_json::to_value(&saved).map_err(|_| "Cannot encode Antigravity accounts.")?)?;
        }
        Ok((saved.into_iter().map(|profile| profile.id).collect(), changed))
    })
}
/// Index updates use atomic replacement, so discovery can read a complete
/// snapshot even while another request holds the credential renewal lock.
pub(crate) fn discovery_profiles() -> Result<Vec<Saved>, String> {
    list_unlocked()
}

pub(crate) fn discovery_home(profile: &Saved) -> Result<PathBuf, String> {
    crate::profiles::managed_account_home(&index(), &profile.id, &profile.home)
}

fn list_unlocked() -> Result<Vec<Saved>, String> {
    Ok(read_index()?.into_iter().filter(|profile| !expired(profile)).collect())
}

fn read_index() -> Result<Vec<Saved>, String> {
    match std::fs::read(index()) {
        Ok(raw) => serde_json::from_slice(&raw)
            .map_err(|_| "Cannot read saved Antigravity accounts.".into()),
        Err(e) if e.kind() == std::io::ErrorKind::NotFound => Ok(vec![]),
        Err(_) => Err("Cannot read Antigravity accounts.".into()),
    }
}
pub fn save(name: &str, source: &Path) -> Result<(String, bool), String> {
    with_repository(|| {
        let (_, email, subscription) = inspect_unlocked(source)?;
        let credentials = credentials(source)?;
        save_verified(&index(), name, email, subscription, &credentials)
    })
}
/// Persist a verified enrollment, reusing credentials without carrying a removed label.
fn save_verified(index_path: &Path, name: &str, email: Option<String>, subscription: Subscription, credentials: &Value) -> Result<(String, bool), String> {
    if subscription.is_expired() { return Err("This Antigravity subscription has expired.".into()); }
    let mut saved: Vec<Saved> = match std::fs::read(index_path) {
        Ok(raw) => serde_json::from_slice(&raw).map_err(|_| "Cannot read saved Antigravity accounts.")?,
        Err(e) if e.kind() == std::io::ErrorKind::NotFound => vec![],
        Err(_) => return Err("Cannot read Antigravity accounts.".into()),
    };
    for entry in &mut saved {
        if paths::read_json(&entry.home.join("auth.json")).and_then(|v| string(&v, &["email"]))
            == string(&credentials, &["email"])
        {
            write_private(&entry.home.join("auth.json"), &credentials)?;
            entry.name = name.into();
            entry.email = email;
            entry.subscription = Some(subscription);
            let id = entry.id.clone();
            write_private(index_path, &serde_json::to_value(&saved).unwrap())?;
            let _ = write_private(&index_path.with_file_name("last-login.json"), &json!({"id":id}));
            return Ok((id, false));
        }
    }
    let id = uuid::Uuid::new_v4().to_string();
    let home = index_path.parent().unwrap().join(&id);
    private_dir(&home)?;
    write_private(&home.join("auth.json"), &credentials)?;
    saved.push(Saved {
        id: id.clone(),
        name: name.into(),
        home: home.clone(),
        email,
        subscription: Some(subscription),
    });
    if let Err(error) = write_private(index_path, &serde_json::to_value(saved).unwrap()) {
        let _ = std::fs::remove_dir_all(home);
        return Err(error);
    }
    let _ = write_private(&index_path.with_file_name("last-login.json"), &json!({"id":id}));
    Ok((id, true))
}
/// Rename saved metadata without reading or changing OAuth credentials.
pub fn rename(id: &str, name: &str) -> Result<(), String> {
    with_repository(|| rename_in(&index(), id, name))
}

fn rename_in(index_path: &Path, id: &str, raw_name: &str) -> Result<(), String> {
    let name = raw_name.trim();
    if name.is_empty() || name.chars().count() > 64 || name.chars().any(char::is_control) {
        return Err("Use an account name between 1 and 64 characters without control characters.".into());
    }
    let raw = std::fs::read(index_path).map_err(|_| "Cannot read saved Antigravity accounts.")?;
    let mut saved: Vec<Saved> = serde_json::from_slice(&raw)
        .map_err(|_| "Cannot read saved Antigravity accounts.")?;
    let target = saved.iter_mut().find(|p| p.id == id).ok_or("This account no longer exists.")?;
    target.name = name.into();
    write_private(index_path, &serde_json::to_value(saved).map_err(|_| "Cannot encode Antigravity accounts.")?)
}

pub fn remove(id: &str) -> Result<(), String> {
    with_repository(|| {
        let mut saved = read_index()?;
        let home = saved.iter().find(|p| p.id == id).map(|p| p.home.clone());
        saved.retain(|p| p.id != id);
        write_private(&index(), &serde_json::to_value(saved).unwrap())?;
        if let Some(home) = home {
            let _ = std::fs::remove_dir_all(home);
        }
        Ok(())
    })
}
fn saved_home(id: &str) -> Result<PathBuf, String> {
    list_unlocked()?.into_iter().find(|p| p.id == id).map(|p| p.home)
        .ok_or_else(|| "This account no longer exists.".into())
}

#[derive(Serialize)]
pub struct AccountQuota {
    #[serde(flatten)]
    pub(crate) quota: crate::quota::QuotaSet,
    models: Vec<String>,
}

pub fn account_quota(id: &str, include_models: bool) -> Result<AccountQuota, String> {
    let probe = Probe::for_usage()?;
    with_account_usage(id, probe.deadline.unwrap(), || {
        let home = saved_home(id)?;
        saved_usage_in(&home, &probe, include_models)
    })
}

fn saved_usage_in(home: &Path, probe: &Probe, include_models: bool) -> Result<AccountQuota, String> {
    let initial = refreshed_credentials(home, probe).map_err(String::from)?;
    verified_usage(&initial, || {
        inspect_credentials(home, initial.clone(), probe).map_err(String::from)?;
        credentials(home)
    }, |snapshot| read_usage_credentials(snapshot, probe, include_models))
}

fn verified_usage<T>(
    initial: &Value, verify: impl FnOnce() -> Result<Value, String> + Send,
    read: impl Fn(&Value) -> Result<T, String> + Sync,
) -> Result<T, String> {
    // Older profiles need their verified project before querying usage.
    if initial["project_id"].as_str().is_none_or(|project| project.is_empty()) {
        return read(&verify()?);
    }
    let (verified, usage) = std::thread::scope(|scope| {
        let verification = scope.spawn(verify);
        let usage = read(initial);
        (verification.join().map_err(|_| "Cannot verify the Google account.".to_string()), usage)
    });
    // Never expose speculative usage unless both identity and paid plan passed.
    let verified = verified??;
    if verified["project_id"] != initial["project_id"] {
        return read(&verified);
    }
    usage
}

/// Menu-bar choices and readings use the same measured limits as the account card.
pub(crate) fn card_quota(id: &str) -> Result<crate::quota::QuotaSet, String> {
    account_quota(id, true).map(|usage| usage.quota)
}

/// Validate usage in a staged home before account enrollment.
pub(crate) fn quota_in(home: &Path) -> Result<crate::quota::QuotaSet, String> {
    with_repository(|| quota_in_unlocked(home))
}

fn quota_in_unlocked(home: &Path) -> Result<crate::quota::QuotaSet, String> {
    let probe = Probe::new(None)?;
    inspect_with_probe(home, &probe)?;
    quota_after_inspect(home, &probe)
}

fn quota_after_inspect(home: &Path, probe: &Probe) -> Result<crate::quota::QuotaSet, String> {
    read_usage(home, probe, false).map(|usage| usage.quota)
}

fn read_usage(home: &Path, probe: &Probe, include_models: bool) -> Result<AccountQuota, String> {
    read_usage_credentials(&credentials(home)?, probe, include_models)
}

fn read_usage_credentials(credentials: &Value, probe: &Probe, include_models: bool) -> Result<AccountQuota, String> {
    let token = credentials["access_token"].as_str().ok_or("Google did not return an access token.")?;
    let project = &credentials["project_id"];
    let endpoints = ["https://daily-cloudcode-pa.googleapis.com", "https://cloudcode-pa.googleapis.com"];
    let fetch = |operation: &str| {
        std::thread::scope(|scope| {
            let jobs: Vec<_> = endpoints.iter().map(|endpoint| scope.spawn(move || {
                probe.json(probe.client.post(format!("{endpoint}/v1internal:{operation}"))
                    .bearer_auth(token).json(&json!({"project":project})))
            })).collect();
            jobs.into_iter().filter_map(|job| job.join().ok()?.ok()).collect::<Vec<_>>()
        })
    };
    let collect = |data: &[Value], parse: fn(&Value) -> Result<crate::quota::QuotaSet, String>| {
        let mut windows = vec![];
        for value in data {
            if let Ok(snapshot) = parse(value) {
                merge_windows(&mut windows, snapshot.windows.unwrap_or_default());
            }
        }
        windows
    };
    let (summary, mut available) = if include_models {
        std::thread::scope(|scope| {
            let models = scope.spawn(|| fetch("fetchAvailableModels"));
            (fetch("retrieveUserQuotaSummary"), models.join().unwrap_or_default())
        })
    } else { (fetch("retrieveUserQuotaSummary"), vec![]) };
    let mut windows = collect(&summary, if include_models { card_quota_from_summary } else { quota_from_summary });
    if windows.is_empty() {
        if !include_models { available = fetch("fetchAvailableModels"); }
        windows = collect(&available, if include_models { card_quota_from_models } else { quota_from_models });
    }
    let models = if include_models { google_models(&available) } else { vec![] };
    if probe.deadline.is_some_and(|deadline| Instant::now() >= deadline) {
        return Err(GOOGLE_TIMEOUT.into());
    }
    let quota = match measured_quota(windows) {
        Ok(quota) => quota,
        Err(error) if !models.is_empty() => crate::quota::QuotaSet {
            provider: "antigravity".into(), windows: None, error: Some(error), reset_credits: None, as_of: None,
        },
        Err(error) => return Err(error),
    };
    Ok(AccountQuota { quota, models })
}

fn google_model_name(id: &str, model: &Value) -> Option<String> {
    if model["disabled"] == true || model["isAvailable"] == false {
        return None;
    }
    let name = string(model, &["displayName", "label"]);
    let google = match model["modelProvider"].as_str() {
        Some(provider) => provider == "MODEL_PROVIDER_GOOGLE",
        None => id.starts_with("gemini-") || name.as_deref().is_some_and(|name|
            name.to_ascii_lowercase().starts_with("gemini ")),
    };
    if !google { return None; }
    // The catalog also contains internal completion IDs and opaque chat IDs.
    name.filter(|name| name.trim().strip_prefix("Gemini ").is_some_and(|model|
        model.starts_with(|character: char| character.is_ascii_digit())))
}

fn google_models(data: &[Value]) -> Vec<String> {
    let mut names = Vec::new();
    for (id, model) in data.iter().flat_map(|value| value["models"].as_object().into_iter().flatten()) {
        if let Some(name) = google_model_name(id, model) {
            if !names.contains(&name) { names.push(name); }
        }
    }
    names
}

fn merge_windows(windows: &mut Vec<crate::quota::QuotaWindow>, incoming: Vec<crate::quota::QuotaWindow>) {
    for window in incoming {
        if let Some(previous) = windows.iter_mut().find(|w| w.window == window.window) {
            if window.percent > previous.percent { *previous = window; }
        } else { windows.push(window); }
    }
}
fn measured_quota(mut windows: Vec<crate::quota::QuotaWindow>) -> Result<crate::quota::QuotaSet, String> {
    if windows.is_empty() { return Err("Google did not return measured quota for this account. Check your connection and account access.".into()); }
    // Preserve family order, but never let API bucket order put Weekly ahead of 5h.
    let group = |label: &str| label.rsplit_once(" · ").map(|(family, _)| family.to_owned())
        .unwrap_or_else(|| if matches!(label.to_ascii_lowercase().as_str(), "5h" | "5-hour" | "weekly") { String::new() } else { label.into() });
    let mut families = Vec::new();
    for window in &windows {
        let family = group(&window.window);
        if !families.contains(&family) { families.push(family); }
    }
    windows.sort_by_key(|window| {
        let family = group(&window.window);
        let cadence = window.window.rsplit_once(" · ").map(|(_, period)| period).unwrap_or(&window.window);
        let rank = match cadence.to_ascii_lowercase().as_str() { "5h" | "5-hour" => 0, "weekly" => 1, _ => 2 };
        (families.iter().position(|name| name == &family).unwrap_or(usize::MAX), rank)
    });
    Ok(crate::quota::QuotaSet { provider: "antigravity".into(), windows: Some(windows), error: None,
        reset_credits: None, as_of: Some(crate::timestamps::now_rfc3339()) })
}

fn quota_from_summary(data: &Value) -> Result<crate::quota::QuotaSet, String> {
    summary_quota(data, false)
}

fn card_quota_from_summary(data: &Value) -> Result<crate::quota::QuotaSet, String> {
    summary_quota(data, true)
}

fn summary_quota(data: &Value, use_group_names: bool) -> Result<crate::quota::QuotaSet, String> {
    let mut windows = vec![];
    let groups: Vec<&Value> = data["groups"].as_array().into_iter().flatten().collect();
    let groups = if groups.iter().any(|g| g["buckets"].as_array().is_some_and(|b| !b.is_empty())) { groups } else { vec![data] };
    for group in groups {
        for bucket in group["buckets"].as_array().into_iter().flatten() {
            if bucket["disabled"] == true { continue; }
            if let Some(fraction) = bucket.get("remainingFraction").unwrap_or(&bucket["remaining"]["remainingFraction"])
                .as_f64().filter(|f| f.is_finite() && (0.0..=1.0).contains(f)) {
                let id = bucket["bucketId"].as_str().unwrap_or("");
                if use_group_names && id.starts_with("3p-") { continue; }
                let group_name = if use_group_names {
                    string(group, &["displayName", "label"])
                } else { None };
                let gemini_group = group_name.filter(|name| name.to_ascii_lowercase().starts_with("gemini"));
                let name = if let Some(name) = gemini_group { name }
                    else if id.starts_with("gemini-carbon-") || id.starts_with("gemini-4-carbon-") { "Gemini 4 Carbon".into() }
                    else if id.starts_with("gemini-argon-") || id.starts_with("gemini-4-argon-") { "Gemini 4 Argon".into() }
                    else if id.starts_with("gemini-") { "Gemini".into() }
                    else if id.starts_with("3p-") { "Claude & GPT (shared)".into() }
                    else { string(bucket, &["displayName", "bucketId"]).unwrap_or("Usage".into()) };
                if use_group_names && !name.to_ascii_lowercase().starts_with("gemini") {
                    continue;
                }
                let cadence = match bucket["window"].as_str() { Some("5h") => Some("5-hour"), Some("weekly") => Some("Weekly"), _ => None };
                let mut reset = string(bucket, &["resetTime", "resetsAt"])
                    .filter(|r| crate::timestamps::parse_rfc3339(r).is_ok());
                // Untouched buckets can report a moving full-window reset, not a fixed deadline.
                let duration = match bucket["window"].as_str() { Some("5h") => Some(300), Some("weekly") => Some(10080), _ => None };
                if fraction == 1.0 && bucket.get("description").is_none() {
                    if let (Some(minutes), Some(at)) = (duration, reset.as_ref().and_then(|r| crate::timestamps::parse_rfc3339(r).ok())) {
                        if (at.unix_timestamp() - time::OffsetDateTime::now_utc().unix_timestamp() - minutes * 60).abs() <= 60 { reset = None; }
                    }
                }
                merge_windows(&mut windows, vec![crate::quota::QuotaWindow {
                    window: cadence.map_or_else(|| name.clone(), |cadence| format!("{name} · {cadence}")),
                    percent: (1.0 - fraction) * 100.0, resets_at: reset, status: None,
                }]);
            }
        }
    }
    measured_quota(windows)
}
fn quota_from_models(data: &Value) -> Result<crate::quota::QuotaSet, String> {
    model_quota(data, false)
}

fn card_quota_from_models(data: &Value) -> Result<crate::quota::QuotaSet, String> {
    model_quota(data, true)
}

fn model_quota(data: &Value, use_model_names: bool) -> Result<crate::quota::QuotaSet, String> {
    let mut windows = vec![];
    for (id, model) in data["models"].as_object().into_iter().flatten() {
        let family = match model["modelProvider"].as_str() {
            Some("MODEL_PROVIDER_GOOGLE") => "Gemini", Some("MODEL_PROVIDER_ANTHROPIC") => "Claude", Some("MODEL_PROVIDER_OPENAI") => "GPT",
            _ if id.starts_with("gemini-") => "Gemini", _ if id.starts_with("claude-") => "Claude", _ if id.starts_with("gpt-") => "GPT", _ if use_model_names => "Gemini", _ => continue,
        };
        let model_name = if use_model_names {
            let Some(name) = google_model_name(id, model) else { continue };
            Some(name)
        } else { None };
        let family = model_name.as_deref().unwrap_or(family);
        for (key, label) in [("quotaInfo", "Reported quota"), ("weeklyQuotaInfo", "Weekly")] {
            let quota = &model[key];
            if let Some(fraction) = quota["remainingFraction"].as_f64().filter(|f| f.is_finite() && (0.0..=1.0).contains(f)) {
                merge_windows(&mut windows, vec![crate::quota::QuotaWindow { window: format!("{family} · {label}"),
                    percent: (1.0 - fraction) * 100.0, resets_at: string(quota, &["resetTime"]).filter(|r| crate::timestamps::parse_rfc3339(r).is_ok()), status: None }]);
            }
        }
    }
    measured_quota(windows)
}

/// Budgeted discovery never waits behind another account's token refresh.
pub(crate) fn enrollment_profiles(deadline: Option<Instant>) -> Result<Vec<Saved>, String> {
    if deadline.is_some() {
        let _guard = REPOSITORY.try_read().map_err(|_| "Antigravity is being checked. Retry or connect it manually.")?;
        list_unlocked()
    } else { list() }
}

/// A slow optional provider must not hold up automatic workspace discovery.
/// Do not wait behind background token renewal when this probe has a budget.
pub(crate) fn inspect_for_enrollment(home: &Path, deadline: Option<Instant>) -> Result<(String, Option<String>, Subscription), VerificationError> {
    let _guard = if deadline.is_some() {
        REPOSITORY.try_write().map_err(|_| "Antigravity is being checked. Retry or connect it manually.")?
    } else {
        REPOSITORY.write().map_err(|_| "Antigravity accounts are busy. Try again.")?
    };
    let probe = Probe::new(deadline)?;
    let identity = inspect_with_probe(home, &probe)?;
    quota_after_inspect(home, &probe)?;
    Ok(identity)
}

fn resolve_client() -> Result<Client, String> {
    if let (Ok(id), Ok(secret)) = (
        std::env::var("ANTIGRAVITY_OAUTH_CLIENT_ID"),
        std::env::var("ANTIGRAVITY_OAUTH_CLIENT_SECRET"),
    ) {
        if !id.is_empty() && !secret.is_empty() {
            return Ok(Client { id, secret });
        }
    }
    let mut candidates = vec![];
    if let Some(binary) = crate::cli::which_binary("agy") {
        candidates.push(binary);
    }
    for root in [
        PathBuf::from("/Applications"),
        dirs::home_dir().unwrap_or_default().join("Applications"),
    ] {
        for suffix in [
            // Antigravity 2.x desktop runtime (the shared AGY login still
            // uses this binary's OAuth client even without a standalone CLI).
            "Contents/Resources/bin/language_server",
            "Contents/MacOS/Gemini",
            "Contents/Resources/app/extensions/antigravity/bin/language_server_macos_arm",
            "Contents/Resources/app/extensions/antigravity/bin/language_server_macos_x64",
            "Contents/Resources/app/out/main.js",
        ] {
            for app in ["Antigravity.app", "Gemini.app"] { candidates.push(root.join(app).join(suffix)); }
        }
    }
    for path in candidates {
        if let Ok(data) = std::fs::read(path) {
            if let Some(client) = artifact_client(&data) {
                return Ok(client);
            }
        }
    }
    Err("Antigravity's OAuth client could not be identified. Update Antigravity/agy or configure a matching ANTIGRAVITY_OAUTH_CLIENT_ID and ANTIGRAVITY_OAUTH_CLIENT_SECRET pair.".into())
}
fn artifact_client(data: &[u8]) -> Option<Client> {
    // Paired Go-string initialization records, not neighboring strings in the pool.
    // Algorithm independently implemented from local artifact format research.
    let word = |offset: usize| {
        data.get(offset..offset + 4)
            .map(|b| u32::from_le_bytes(b.try_into().unwrap()))
    };
    if word(0)? != 0xfeedfacf {
        return None;
    }
    let intel = word(4)? == 0x01000007;
    if !intel && word(4)? != 0x0100000c {
        return None;
    }
    let commands_end = 32usize.checked_add(word(20)? as usize)?;
    let mut command = 32;
    let mut found = vec![];
    for _ in 0..word(16)?.min(4096) {
        let size = word(command + 4)? as usize;
        if size < 8 || command.checked_add(size)? > commands_end {
            return None;
        }
        if word(command) == Some(0x19)
            && size >= 72
            && data.get(command + 8..command + 15) == Some(b"__TEXT\0")
            && word(command + 40) == Some(0)
            && word(command + 44) == Some(0)
        {
            let text_end = word(command + 48)? as usize;
            if text_end > data.len() {
                return None;
            }
            for section in 0..word(command + 64)? as usize {
                let section = command + 72 + section * 80;
                if section + 80 > command + size {
                    return None;
                }
                if data.get(section..section + 7) != Some(b"__text\0") {
                    continue;
                }
                let start = word(section + 48)? as usize;
                let length = word(section + 40)? as usize;
                if start.checked_add(length)? > text_end {
                    return None;
                }
                let marker: &[u8] = if intel {
                    &[0x48, 0xc7, 0x40, 0x08]
                } else {
                    &[1, 8, 0, 0xa9]
                };
                for pos in start..start + length.saturating_sub(37) {
                    if data.get(pos..pos + 4) != Some(marker) {
                        continue;
                    }
                    let record = if intel {
                        pos
                    } else {
                        match pos.checked_sub(12) {
                            Some(r) => r,
                            None => continue,
                        }
                    };
                    let reference = |offset: usize| -> Option<(usize, usize)> {
                        if intel {
                            if word(offset)? & 0x00ffffff != 0x000d8d48 {
                                return None;
                            }
                            let target = (offset as i64) + 7 + (word(offset + 3)? as i32 as i64);
                            return Some((usize::try_from(target).ok()?, 0));
                        }
                        let page = word(offset)?;
                        let add = word(offset + 4)?;
                        let count = word(offset + 8)?;
                        if offset % 4 != 0
                            || page & 0x9f00001f != 0x90000001
                            || add & 0xffc003ff != 0x91000021
                            || count & 0xffe0001f != 0xd2800002
                        {
                            return None;
                        }
                        let immediate = ((page >> 5) & 0x7ffff) << 2 | ((page >> 29) & 3);
                        let pages = ((immediate << 11) as i32 >> 11) as i64;
                        let target =
                            ((offset & !4095) as i64) + pages * 4096 + ((add >> 10) & 4095) as i64;
                        Some((
                            usize::try_from(target).ok()?,
                            ((count >> 5) & 0xffff) as usize,
                        ))
                    };
                    let pair = if intel {
                        if data.get(record + 15..record + 22)
                            != Some(&[0x48, 0x89, 8, 0x48, 0xc7, 0x40, 0x18])
                            || word(record + 33) != Some(0x10488948)
                        {
                            continue;
                        }
                        reference(record + 8)
                            .zip(reference(record + 26))
                            .map(|(a, b)| {
                                (
                                    (a.0, word(record + 4).unwrap_or(0) as usize),
                                    (b.0, word(record + 22).unwrap_or(0) as usize),
                                )
                            })
                    } else {
                        if word(record + 28) != Some(0xa9010801) {
                            continue;
                        }
                        reference(record).zip(reference(record + 16))
                    };
                    let Some((id, secret)) = pair else {
                        continue;
                    };
                    if !(30..=256).contains(&id.1) || secret.1 != 35 {
                        continue;
                    }
                    let Some(id_bytes) = data.get(id.0..id.0 + id.1) else {
                        continue;
                    };
                    let Some(secret_bytes) = data.get(secret.0..secret.0 + secret.1) else {
                        continue;
                    };
                    let Ok(id) = std::str::from_utf8(id_bytes) else {
                        continue;
                    };
                    let Ok(secret) = std::str::from_utf8(secret_bytes) else {
                        continue;
                    };
                    if !id.ends_with(".apps.googleusercontent.com")
                        || !secret.starts_with("GOCSPX-")
                    {
                        continue;
                    }
                    if id == CONSUMER {
                        return Some(Client {
                            id: id.into(),
                            secret: secret.into(),
                        });
                    }
                    found.push(Client {
                        id: id.into(),
                        secret: secret.into(),
                    });
                }
            }
        }
        command += size;
    }
    (found.len() == 1).then(|| found.remove(0))
}
#[cfg(test)]
mod tests {
    use super::*;
    static REPOSITORY_TEST: Mutex<()> = Mutex::new(());

    #[test]
    fn saved_usage_starts_before_identity_and_plan_checks_finish() {
        let initial = json!({"project_id":"synthetic-project"});
        let verified = initial.clone();
        let (started, received) = std::sync::mpsc::channel();
        let result = verified_usage(&initial, move || {
            received.recv_timeout(Duration::from_millis(300)).map_err(|_| "Usage waited for identity and plan checks".to_string())?;
            Ok(verified)
        }, |_| { started.send(()).unwrap(); Ok(42) });
        assert_eq!(result.unwrap(), 42);
    }

    #[test]
    fn speculative_usage_never_bypasses_verification_or_uses_an_old_project() {
        let initial = json!({"project_id":"old"});
        let read_started = std::sync::atomic::AtomicBool::new(false);
        let failed = verified_usage(&initial, || Err("Google returned a different account".into()), |_| {
            read_started.store(true, std::sync::atomic::Ordering::SeqCst);
            Ok(42)
        });
        assert!(read_started.load(std::sync::atomic::Ordering::SeqCst));
        assert_eq!(failed.unwrap_err(), "Google returned a different account");
        let projects = Mutex::new(Vec::new());
        let usage = verified_usage(&initial, || Ok(json!({"project_id":"new"})), |value| {
            let project = value["project_id"].as_str().unwrap().to_owned();
            projects.lock().unwrap().push(project.clone());
            Ok(project)
        }).unwrap();
        assert_eq!(usage, "new");
        assert_eq!(*projects.lock().unwrap(), vec!["old", "new"]);
        let verified = std::sync::atomic::AtomicBool::new(false);
        let usage = verified_usage(&json!({}), || {
            verified.store(true, std::sync::atomic::Ordering::SeqCst);
            Ok(json!({"project_id":"first"}))
        }, |value| {
            assert!(verified.load(std::sync::atomic::Ordering::SeqCst));
            Ok(value["project_id"].clone())
        }).unwrap();
        assert_eq!(usage, "first");
        assert!(verified_usage(&initial, || Ok(initial.clone()), |_| Err::<(), _>("Usage unavailable".into())).is_err());
    }

    #[test]
    #[ignore = "Read-only live latency measurement using a disposable copy of one saved Google login"]
    fn live_saved_account_usage_latency() {
        let saved = list().unwrap().into_iter().next().expect("A saved Antigravity account is required");
        let home = std::env::temp_dir().join(format!("orbilap-agy-latency-{}", uuid::Uuid::new_v4()));
        private_dir(&home).unwrap();
        let result = (|| -> Result<Duration, String> {
            write_private(&home.join("auth.json"), &credentials(&saved.home)?)?;
            let probe = Probe::for_usage()?;
            let started = Instant::now();
            let usage = saved_usage_in(&home, &probe, true)?;
            assert!(usage.quota.windows.as_ref().is_some_and(|windows| !windows.is_empty()));
            Ok(started.elapsed())
        })();
        std::fs::remove_dir_all(&home).unwrap();
        let elapsed = result.unwrap();
        eprintln!("Complete verified Antigravity usage: {elapsed:?}");
        assert!(elapsed < Duration::from_secs(8), "Complete account usage still exceeds eight seconds");
    }

    #[test]
    fn saved_account_listing_does_not_queue_behind_usage_requests() {
        let _test = REPOSITORY_TEST.lock().unwrap();
        let guard = REPOSITORY.read().unwrap();
        let (send, receive) = std::sync::mpsc::channel();
        let reader = std::thread::spawn(move || { let _ = send.send(list()); });
        let ready = receive.recv_timeout(Duration::from_millis(200));
        drop(guard);
        reader.join().unwrap();
        assert!(ready.is_ok(), "Saved account cards waited behind a background Google request");
    }

    #[test]
    fn usage_overlaps_across_accounts_but_serializes_same_account_and_excludes_mutations() {
        let _test = REPOSITORY_TEST.lock().unwrap();
        let (started, start) = std::sync::mpsc::channel();
        let (release, released) = std::sync::mpsc::channel();
        let (other, other_ready) = std::sync::mpsc::channel();
        let (same, same_ready) = std::sync::mpsc::channel();
        let (writer, writer_ready) = std::sync::mpsc::channel();
        let deadline = Instant::now() + Duration::from_secs(3);
        let (parallel, serialized, protected) = std::thread::scope(|scope| {
            scope.spawn(move || with_account_usage("fixture-one", deadline, || {
                started.send(()).unwrap();
                released.recv_timeout(Duration::from_secs(3)).unwrap();
                Ok(())
            }).unwrap());
            start.recv_timeout(Duration::from_secs(1)).unwrap();
            scope.spawn(|| with_account_usage("fixture-two", deadline, || { other.send(()).unwrap(); Ok(()) }).unwrap());
            let parallel = other_ready.recv_timeout(Duration::from_millis(500)).is_ok();
            scope.spawn(|| with_account_usage("fixture-one", deadline, || { same.send(()).unwrap(); Ok(()) }).unwrap());
            let serialized = same_ready.recv_timeout(Duration::from_millis(50)).is_err();
            scope.spawn(|| with_repository(|| { writer.send(()).unwrap(); Ok(()) }).unwrap());
            let protected = writer_ready.recv_timeout(Duration::from_millis(50)).is_err();
            release.send(()).unwrap();
            (parallel, serialized, protected)
        });
        assert!(parallel, "Independent Google accounts waited for one another");
        assert!(serialized, "The same account could rotate its token concurrently");
        assert!(protected, "An account could be removed or replaced during its usage read");
        same_ready.recv_timeout(Duration::from_secs(1)).unwrap();
        writer_ready.recv_timeout(Duration::from_secs(1)).unwrap();
    }

    #[test]
    fn usage_waiting_for_repository_respects_the_total_deadline() {
        let _test = REPOSITORY_TEST.lock().unwrap();
        let _guard = REPOSITORY.write().unwrap();
        let started = Instant::now();
        let error = with_account_usage("fixture", started + Duration::from_millis(60), || Ok(())).unwrap_err();
        assert!(error.contains("took too long"));
        assert!(started.elapsed() < Duration::from_millis(300));
    }

    #[test]
    fn saved_usage_has_one_total_budget_for_all_request_stages() {
        let started = Instant::now();
        let probe = Probe::for_usage().unwrap();
        let deadline = probe.deadline.expect("saved usage must have a total deadline");
        assert!(deadline.duration_since(started) <= Duration::from_secs(13));
        let request = probe.request(probe.client.get("https://example.invalid/")).unwrap().build().unwrap();
        assert!(request.timeout().is_some_and(|timeout| *timeout <= Duration::from_secs(12)));
    }

    #[test]
    fn reenrollment_reuses_profile_but_replaces_a_removed_test_name() {
        let dir = std::env::temp_dir().join(format!("orbilap-agy-restore-name-{}", uuid::Uuid::new_v4()));
        private_dir(&dir).unwrap();
        let index = dir.join("profiles.json");
        let token = json!({"email":"one@example.com","client_id":"synthetic-client","client_secret":"synthetic-value","refresh_token":"synthetic-refresh"});
        let plan = paid_subscription(&json!({"paidTier":{"name":"Google AI Pro"}})).unwrap();
        let (id, created) = save_verified(&index, "Old test name", Some("one@example.com".into()), plan.clone(), &token).unwrap();
        assert!(created);
        let (same, created) = save_verified(&index, "Verified Google Name", Some("one@example.com".into()), plan, &token).unwrap();
        assert!(!created); assert_eq!(same, id);
        let saved: Vec<Saved> = serde_json::from_slice(&std::fs::read(&index).unwrap()).unwrap();
        assert_eq!(saved.len(), 1);
        assert_eq!(saved[0].name, "Verified Google Name");
        std::fs::remove_dir_all(dir).unwrap();
    }
    #[test]
    fn quota_pairs_put_five_hour_before_weekly_for_each_model_family() {
        let quota = measured_quota(vec![
            crate::quota::QuotaWindow { window:"Gemini · Weekly".into(), percent:20.0, resets_at:None, status:None },
            crate::quota::QuotaWindow { window:"Gemini · 5-hour".into(), percent:10.0, resets_at:None, status:None },
            crate::quota::QuotaWindow { window:"Claude & GPT (shared) · Weekly".into(), percent:40.0, resets_at:None, status:None },
            crate::quota::QuotaWindow { window:"Claude & GPT (shared) · 5-hour".into(), percent:30.0, resets_at:None, status:None },
        ]).unwrap();
        let windows = quota.windows.unwrap();
        assert_eq!(windows.iter().map(|w| w.percent).collect::<Vec<_>>(), [10.0,20.0,30.0,40.0]);
    }
    #[test]
    fn expired_discovery_budget_stops_before_sending_and_manual_requests_keep_their_timeout() {
        let probe = Probe::new(Some(Instant::now())).unwrap();
        let error = probe.request(probe.client.get("http://127.0.0.1:1/")).unwrap_err();
        assert!(error.contains("took too long"));
        let manual = Probe::new(None).unwrap();
        assert!(manual.request(manual.client.get("http://127.0.0.1:1/")).unwrap().build().unwrap().timeout().is_none());
        let automatic = Probe::new(Some(Instant::now() + Duration::from_secs(3))).unwrap();
        let request = automatic.request(automatic.client.get("http://127.0.0.1:1/")).unwrap().build().unwrap();
        assert!(request.timeout().is_some_and(|timeout| *timeout <= Duration::from_secs(3)));
    }

    #[test]
    fn automatic_enrollment_and_listing_do_not_wait_behind_background_renewal() {
        let _test = REPOSITORY_TEST.lock().unwrap();
        let _guard = REPOSITORY.write().unwrap();
        let started = Instant::now();
        assert!(discovery_profiles().is_ok());
        assert!(enrollment_profiles(Some(Instant::now())).is_err());
        let error = inspect_for_enrollment(Path::new("unused"), Some(Instant::now())).unwrap_err();
        assert!(String::from(error).contains("being checked"));
        assert!(started.elapsed() < Duration::from_millis(500));
    }

    #[test]
    fn automatic_budget_is_shared_across_requests_and_includes_response_body() {
        use std::io::{Read, Write};
        let listener = std::net::TcpListener::bind("127.0.0.1:0").unwrap();
        listener.set_nonblocking(true).unwrap();
        let endpoint = format!("http://{}/", listener.local_addr().unwrap());
        let server = std::thread::spawn(move || {
            let deadline = Instant::now() + Duration::from_secs(3);
            let mut requests = 0;
            while requests < 2 && Instant::now() < deadline {
                let Ok((mut socket, _)) = listener.accept() else {
                    std::thread::sleep(Duration::from_millis(1)); continue;
                };
                socket.set_read_timeout(Some(Duration::from_secs(1))).unwrap();
                let mut headers = vec![];
                let mut byte = [0];
                while !headers.ends_with(b"\r\n\r\n") && headers.len() < 8192 {
                    if socket.read(&mut byte).unwrap_or(0) == 0 { break; }
                    headers.push(byte[0]);
                }
                requests += 1;
                socket.write_all(b"HTTP/1.1 200 OK\r\nContent-Length: 2\r\nConnection: close\r\n\r\n").ok();
                std::thread::sleep(Duration::from_millis(350));
                socket.write_all(b"{}").ok();
            }
            requests
        });
        // This fixture talks only to its loopback server, even on hosts with a system proxy.
        let probe = Probe {
            client: reqwest::blocking::Client::builder().no_proxy().build().unwrap(),
            deadline: Some(Instant::now() + Duration::from_millis(600)),
        };
        assert!(probe.json(probe.client.get(&endpoint)).is_ok());
        assert!(probe.json(probe.client.get(&endpoint)).is_err(), "a second request must not restart the total budget");
        assert_eq!(server.join().unwrap(), 2);
    }

    #[test]
    fn rename_persists_only_the_selected_name_and_rejects_invalid_input() {
        let dir = std::env::temp_dir().join(format!("orbilap-agy-rename-{}", uuid::Uuid::new_v4()));
        std::fs::create_dir_all(&dir).unwrap();
        let path = dir.join("profiles.json");
        let original = json!([
            {"id":"one","name":"Personal","home":dir.join("one"),"email":"one@example.com","subscription":null},
            {"id":"two","name":"Work","home":dir.join("two"),"email":"two@example.com","subscription":null}
        ]);
        write_private(&path, &original).unwrap();
        rename_in(&path, "two", "  Office  ").unwrap();
        let updated: Value = serde_json::from_slice(&std::fs::read(&path).unwrap()).unwrap();
        let mut expected = original;
        expected[1]["name"] = json!("Office");
        assert_eq!(updated, expected);
        for name in ["", "  ", "bad\nname", &"x".repeat(65)] {
            assert!(rename_in(&path, "two", name).is_err());
        }
        assert!(rename_in(&path, "missing", "Name").is_err());
        let unchanged: Value = serde_json::from_slice(&std::fs::read(path).unwrap()).unwrap();
        assert_eq!(unchanged, expected);
        std::fs::remove_dir_all(dir).unwrap();
    }
    #[test]
    fn unknown_free_and_quota_only_are_not_paid() {
        for data in [
            json!({}),
            json!({"paidTier":{"name":"Free"}}),
            json!({"quota":100}),
            json!({"currentTier":{"id":"legacy-tier"}}),
        ] {
            assert!(paid_subscription(&data).is_err());
        }
        assert!(paid_subscription(
            &json!({"paidTier":{"id":"google-ai-pro","name":"Google AI Pro"}})
        )
        .is_ok());
    }
    #[test]
    fn verified_google_name_is_used_with_email_fallback_and_bounded_plain_text() {
        assert_eq!(google_profile_name(&json!({"given_name":"Jane","family_name":"Doe"})).as_deref(), Some("Jane Doe"));
        assert_eq!(google_profile_name(&json!({"name":"Ada Lovelace","given_name":"Jane","family_name":"Doe"})).as_deref(), Some("Ada Lovelace"));
        assert!(google_profile_name(&json!({"email":"one@example.com"})).is_none());
        assert_eq!(account_label(&json!({"google_name":"  Google Name  ","email":"one@example.com"})).as_deref(), Some("Google Name"));
        assert_eq!(account_label(&json!({"email":"one@example.com"})).as_deref(), Some("one@example.com"));
        assert_eq!(account_label(&json!({"google_name":"a\nb"})).as_deref(), Some("ab"));
        assert_eq!(account_label(&json!({"google_name":"x".repeat(100)})).unwrap().chars().count(), 64);
        assert!(account_label(&json!({})).is_none());
    }
    #[test]
    fn resume_uses_the_last_confirmed_account_without_touching_saved_tokens() {
        let dir = std::env::temp_dir().join(format!("orbilap-agy-resume-{}", uuid::Uuid::new_v4()));
        private_dir(&dir).unwrap();
        let index = dir.join("profiles.json");
        let mut app = crate::settings::AppSettings::default();
        assert!(!resume_login_from(&index, &dir.join("draft"), &app).unwrap());
        let mut saved = vec![];
        for id in ["one", "two"] {
            let home = dir.join(id); private_dir(&home).unwrap();
            write_private(&home.join("auth.json"), &json!({"client_id":"synthetic-client","client_secret":"synthetic-secret","refresh_token":id})).unwrap();
            saved.push(Saved { id:id.into(), name:id.into(), home, email:None, subscription:None });
        }
        write_private(&index, &serde_json::to_value(saved).unwrap()).unwrap();
        write_private(&dir.join("last-login.json"), &json!({"id":"one"})).unwrap();
        let legacy_draft = dir.join("legacy-draft");
        assert!(!resume_login_from(&index, &legacy_draft, &app).unwrap());
        assert!(!legacy_draft.exists());
        let auth = dir.join("one/auth.json");
        let mut value = paths::read_json(&auth).unwrap();
        value["google_name"] = json!("Jane Doe");
        write_private(&auth, &value).unwrap();
        assert!(resume_login_from(&index, &dir.join("draft"), &app).unwrap());
        let staged = paths::read_json(&dir.join("draft/antigravity-acp/acp_token.json")).unwrap();
        assert_eq!(staged["refresh_token"], "one");
        assert!(!dir.join("draft/auth.json").exists(), "credentials must still pass official agent access verification");
        assert_eq!(paths::read_json(&dir.join("two/auth.json")).unwrap()["refresh_token"], "two");
        app.workspaces.push(serde_json::from_value(json!({"id":"studio","name":"Studio","accent":"#007aff","accountIds":[],"antigravityAccountIds":["two"]})).unwrap());
        assert!(!resume_login_from(&index, &dir.join("new-account"), &app).unwrap(), "an enrolled account must lead to fresh Google sign-in, even if the last login is detached");
        assert!(!dir.join("new-account").exists(), "do not copy any old credentials for Add another account");
        std::fs::remove_dir_all(dir).unwrap();
    }
    #[test]
    fn paired_artifact_records_are_used_instead_of_string_pool_order() {
        let mut data = vec![0u8; 2048];
        fn put(data: &mut [u8], at: usize, value: u32) {
            data[at..at + 4].copy_from_slice(&value.to_le_bytes());
        }
        put(&mut data, 0, 0xfeedfacf);
        put(&mut data, 4, 0x0100000c);
        put(&mut data, 16, 1);
        put(&mut data, 20, 152);
        put(&mut data, 32, 0x19);
        put(&mut data, 36, 152);
        data[40..47].copy_from_slice(b"__TEXT\0");
        put(&mut data, 80, 2048);
        put(&mut data, 96, 1);
        data[104..111].copy_from_slice(b"__text\0");
        put(&mut data, 144, 80);
        put(&mut data, 152, 256);
        put(&mut data, 256, 0x90000001);
        put(&mut data, 260, 0x91000021 | (1024 << 10));
        put(&mut data, 264, 0xd2800002 | ((CONSUMER.len() as u32) << 5));
        put(&mut data, 268, 0xa9000801);
        put(&mut data, 272, 0x90000001);
        put(&mut data, 276, 0x91000021 | (1200 << 10));
        put(&mut data, 280, 0xd2800002 | (35 << 5));
        put(&mut data, 284, 0xa9010801);
        data[1024..1024 + CONSUMER.len()].copy_from_slice(CONSUMER.as_bytes());
        let secret = format!("GOCSPX-{}", "A".repeat(28));
        data[1200..1235].copy_from_slice(secret.as_bytes());
        let client = artifact_client(&data).unwrap();
        assert_eq!(client.id, CONSUMER);
        assert!(client.secret == secret);
        put(&mut data, 284, 0);
        assert!(artifact_client(&data).is_none());
    }
    #[test]
    fn malformed_artifacts_fail_closed() {
        for size in 0..80 {
            assert!(artifact_client(&vec![0; size]).is_none());
        }
    }
}

/// Copies the current Google login into a draft without altering its Keychain entry.
pub fn copy_current(home: &Path) -> Result<(), String> {
    copy_current_with_deadline(home, None)
}

pub(crate) fn copy_current_with_deadline(home: &Path, deadline: Option<Instant>) -> Result<(), String> {
    if deadline.is_some_and(|deadline| Instant::now() >= deadline) {
        return Err("Google verification took too long. Retry or connect this account manually.".into());
    }
    let source = dirs::home_dir()
        .ok_or("Cannot locate your home directory.")?
        .join(".gemini/antigravity-cli/antigravity-oauth-token");
    if let Ok(metadata) = std::fs::symlink_metadata(&source) {
        if metadata.is_file() && metadata.len() <= 256 * 1024 {
            let raw = std::fs::read(source).map_err(|_| "Cannot read the current AGY login.")?;
            let value: Value = serde_json::from_slice(&raw)
                .map_err(|_| "The current AGY login has an unsupported format.")?;
            return write_private(&home.join("auth.json"), &value);
        }
    }
    #[cfg(target_os = "macos")]
    {
        use base64::Engine;
        let mut child = std::process::Command::new("/usr/bin/security")
            .args([
                "find-generic-password",
                "-s",
                "gemini",
                "-a",
                "antigravity",
                "-w",
            ])
            .stdin(std::process::Stdio::null())
            .stdout(std::process::Stdio::piped())
            .stderr(std::process::Stdio::null())
            .spawn()
            .map_err(|_| "Cannot read the current AGY login.")?;
        let deadline = deadline.unwrap_or_else(|| Instant::now() + Duration::from_secs(15));
        loop {
            match child.try_wait() {
                Ok(Some(exit)) if exit.success() => {
                    let mut raw = vec![];
                    child
                        .stdout
                        .take()
                        .ok_or("Cannot read AGY login.")?
                        .take(256 * 1024)
                        .read_to_end(&mut raw)
                        .map_err(|_| "Cannot read AGY login.")?;
                    let text =
                        String::from_utf8(raw).map_err(|_| "Unsupported AGY login format.")?;
                    let bytes =
                        if let Some(encoded) = text.trim().strip_prefix("go-keyring-base64:") {
                            base64::engine::general_purpose::STANDARD
                                .decode(encoded)
                                .map_err(|_| "Unsupported AGY login format.")?
                        } else {
                            text.into_bytes()
                        };
                    let value: Value = serde_json::from_slice(&bytes)
                        .map_err(|_| "Unsupported AGY login format.")?;
                    return write_private(&home.join("auth.json"), &value);
                }
                Ok(Some(_)) => break,
                Ok(None) if Instant::now() < deadline => {
                    std::thread::sleep(Duration::from_millis(30))
                }
                _ => {
                    let _ = child.kill();
                    let _ = child.wait();
                    break;
                }
            }
        }
    }
    Err(
        "No current AGY login could be read. Use Sign in with Google or import a credentials file."
            .into(),
    )
}

/// Build the consumer profile expected by AGY's shared login store.
/// Never pass credential bytes through command arguments or the webview.
fn consumer_profile(value: &Value) -> Result<Value, String> {
    let required = |key: &str| value[key].as_str().filter(|s| !s.is_empty())
        .ok_or_else(|| "This Google login needs to be reconnected before switching.".to_string());
    let expiry = value["expiry_date"].as_i64()
        .and_then(crate::timestamps::from_unix_millis)
        .ok_or("This Google login has no valid expiry. Reconnect it before switching.")?;
    Ok(json!({
        "auth_method": "consumer",
        "id_token": required("id_token")?,
        "token": { "access_token": required("access_token")?, "refresh_token": required("refresh_token")?,
            "token_type": "Bearer", "expiry": crate::timestamps::format_rfc3339(expiry) }
    }))
}

/// Verify the saved identity and measured usage before changing the shared login.
pub fn activate(id: &str) -> Result<(), String> {
    activate_with(id, false, |profile, _| write_shared_login(profile))
}

pub(crate) fn activate_with<T>(
    id: &str, include_models: bool,
    commit: impl FnOnce(&Value, crate::quota::QuotaSet) -> Result<T, String>,
) -> Result<T, String> {
    with_repository(|| {
        if crate::cli::which_binary("agy").is_none()
            && !crate::account_setup::google_desktop_installed() {
            return Err("Install Antigravity before switching accounts.".into());
        }
        let saved = list_unlocked()?.into_iter().find(|p| p.id == id)
            .ok_or("This account no longer exists.")?;
        let probe = if include_models { Probe::for_usage()? } else { Probe::new(None)? };
        let (_, email, _) = inspect_with_probe(&saved.home, &probe)?;
        let quota = read_usage(&saved.home, &probe, include_models)?.quota;
        activate_verified(&saved, email, credentials(&saved.home)?, |profile| commit(profile, quota))
    })
}

pub fn open_desktop() -> Result<(), String> {
    let path = crate::account_setup::desktop_app_path("com.google.antigravity", "Antigravity.app")
        .ok_or("Install the Antigravity app to open it automatically.")?;
    let status = std::process::Command::new("/usr/bin/open")
        .arg(path)
        .status()
        .map_err(|_| "Could not open Antigravity. Open it from Applications.")?;
    if status.success() {
        Ok(())
    } else {
        Err("Could not open Antigravity. Open it from Applications.".into())
    }
}

fn activate_verified<T>(
    saved: &Saved,
    email: Option<String>,
    value: Value,
    write: impl FnOnce(&Value) -> Result<T, String>,
) -> Result<T, String> {
    if !saved.email.as_deref().zip(email.as_deref()).is_some_and(|(a,b)| a.eq_ignore_ascii_case(b)) {
        return Err("Google returned a different account. Reconnect this account before switching.".into());
    }
    write(&consumer_profile(&value)?)
}

pub(crate) fn write_shared_login(value: &Value) -> Result<(), String> {
    #[cfg(target_os = "macos")]
    {
        use base64::Engine;
        // A stale fallback can hide the Keychain's actual login from discovery.
        let fallback = dirs::home_dir().ok_or("Cannot locate your home directory.")?
            .join(".gemini/antigravity-cli/antigravity-oauth-token");
        if fallback.symlink_metadata().is_ok() {
            return Err("A legacy AGY login file is present. Sign in again in Antigravity to use its shared Keychain login before switching.".into());
        }
        let raw = serde_json::to_vec(value).map_err(|_| "Cannot prepare Google sign-in.")?;
        let encoded = format!("go-keyring-base64:{}", base64::engine::general_purpose::STANDARD.encode(raw));
        security_framework::passwords::set_generic_password("gemini", "antigravity", encoded.as_bytes())
            .map_err(|_| "Cannot update the Antigravity Keychain login. Check Keychain access and retry.".to_string())
    }
    #[cfg(not(target_os = "macos"))]
    { let _ = value; Err("Antigravity account switching currently requires macOS Keychain.".into()) }
}

#[cfg(test)]
mod activation_tests {
    use super::*;
    fn value() -> Value { json!({"access_token":"synthetic-access", "refresh_token":"synthetic-refresh",
        "id_token":"synthetic-id", "expiry_date": 1893456000000_i64}) }
    fn saved() -> Saved { Saved { id: "one".into(), name: "Work".into(), home: PathBuf::new(),
        email: Some("one@example.com".into()), subscription: None } }
    #[test]
    fn live_summary_bucket_fraction_is_read_at_the_bucket_level() {
        let data = json!({"groups":[{"buckets":[
            {"displayName":"Pro", "remainingFraction":0.25, "resetTime":"2030-01-01T00:00:00Z"},
            {"displayName":"Flash", "remainingFraction":0.0},
            {"displayName":"Reserve", "remainingFraction":1.0}
        ]}]});
        let windows = quota_from_summary(&data).unwrap().windows.unwrap();
        assert_eq!(windows.len(), 3);
        assert_eq!(windows.iter().map(|w| w.percent).collect::<Vec<_>>(), vec![75.0,100.0,0.0]);
        assert_eq!(windows[0].resets_at.as_deref(), Some("2030-01-01T00:00:00Z"));
    }
    #[test]
    fn legacy_nested_fraction_works_and_unknown_quota_is_never_zero() {
        assert_eq!(quota_from_summary(&json!({"groups":[{"buckets":[{"remaining":{"remainingFraction":0.5}}]}]})).unwrap().windows.unwrap()[0].percent, 50.0);
        for value in [json!({}),json!({"groups":[]}),json!({"groups":[{"buckets":[
            {"remainingFraction":-0.1}, {"remainingFraction":1.1}, {"remainingFraction":"0.5"}, {}
        ]}]})] { assert!(quota_from_summary(&value).is_err()); }
    }
    #[test]
    fn card_uses_reported_names_for_new_models_and_quota_groups() {
        let data = json!({"models": {
            "opaque-id": {"displayName":"Gemini 9 Preview","modelProvider":"MODEL_PROVIDER_GOOGLE",
                "weeklyQuotaInfo":{"remainingFraction":0.25}},
            "gemini-disabled": {"disabled":true},
            "claude-opus": {"modelProvider":"MODEL_PROVIDER_ANTHROPIC"}
        }});
        assert_eq!(google_models(&[data.clone()]), ["Gemini 9 Preview"]);
        let fallback = card_quota_from_models(&data).unwrap().windows.unwrap();
        assert_eq!(fallback[0].window, "Gemini 9 Preview · Weekly");
        assert_eq!(fallback[0].percent, 75.0);
        let summary = card_quota_from_summary(&json!({"groups":[
            {"displayName":"Gemini 9 Preview","buckets":[
                {"bucketId":"gemini-preview-weekly","window":"weekly","remainingFraction":0.5}
            ]}
        ]})).unwrap().windows.unwrap();
        assert_eq!(summary[0].window, "Gemini 9 Preview · Weekly");
    }

    #[test]
    fn summary_supports_flat_buckets_and_skips_disabled_groups() {
        let data = json!({"buckets":[
            {"bucketId":"gemini-standard-5h","window":"5h","remainingFraction":0.4},
            {"bucketId":"3p-weekly","window":"weekly","remainingFraction":0.2},
            {"bucketId":"disabled","disabled":true,"remainingFraction":0.0}
        ]});
        let windows = quota_from_summary(&data).unwrap().windows.unwrap();
        assert_eq!(windows.len(), 2);
        assert_eq!(windows[0].window, "Gemini · 5-hour");
        assert_eq!(windows[1].window, "Claude & GPT (shared) · Weekly");
        assert_eq!(windows[0].percent, 60.0);
    }
    #[test]
    fn model_fallback_and_endpoint_merge_keep_the_tightest_measured_limit() {
        let data = json!({"models":{
            "gemini-one":{"quotaInfo":{"remainingFraction":0.9}},
            "gemini-two":{"quotaInfo":{"remainingFraction":0.2},"weeklyQuotaInfo":{"remainingFraction":0.5}},
            "unknown":{"quotaInfo":{"remainingFraction":0.0}}
        }});
        let mut windows = quota_from_models(&data).unwrap().windows.unwrap();
        assert_eq!(windows.len(), 2);
        assert_eq!(windows.iter().find(|w| w.window == "Gemini · Reported quota").unwrap().percent, 80.0);
        let extra = quota_from_summary(&json!({"buckets":[{"displayName":"Gemini · Reported quota","remainingFraction":0.0}]})).unwrap();
        merge_windows(&mut windows, extra.windows.unwrap());
        assert_eq!(windows.iter().find(|w| w.window == "Gemini · Reported quota").unwrap().percent, 100.0);
        assert!(quota_from_models(&json!({"models":{"gemini-x":{"quotaInfo":{}}}})).is_err());
    }
    #[test]
    fn consumer_login_matches_native_token_schema_and_rejects_incomplete_tokens() {
        let profile = consumer_profile(&value()).unwrap();
        assert_eq!(profile["auth_method"], "consumer");
        assert_eq!(profile["token"]["token_type"], "Bearer");
        assert_eq!(profile["token"]["expiry"], "2030-01-01T00:00:00+00:00");
        for key in ["access_token", "refresh_token", "id_token", "expiry_date"] {
            let mut bad = value(); bad.as_object_mut().unwrap().remove(key);
            assert!(consumer_profile(&bad).is_err(), "missing {key}");
        }
    }
    #[test]
    fn activation_never_writes_on_invalid_credentials_or_changed_identity() {
        for email in [None, Some("other@example.com".into())] {
            assert!(activate_verified::<()>(&saved(), email, value(), |_| panic!("must not write")).is_err());
        }
        assert!(activate_verified::<()>(&saved(), saved().email, json!({}), |_| panic!("must not write")).is_err());
    }
    #[test]
    fn activation_writes_only_verified_profile_and_propagates_keychain_failure() {
        let result = activate_verified::<()>(&saved(), Some("ONE@example.com".into()), value(), |profile| {
            assert_eq!(profile["token"]["access_token"], "synthetic-access");
            Err("Keychain denied".into())
        });
        assert_eq!(result.unwrap_err(), "Keychain denied");
        assert!(activate_verified(&saved(), saved().email, value(), |_| Ok(())).is_ok());
    }
    #[test]
    fn native_expiry_and_id_token_survive_credential_normalization() {
        let home = std::env::temp_dir().join(format!("orbilap-google-schema-{}", uuid::Uuid::new_v4()));
        private_dir(&home).unwrap();
        let mut native = consumer_profile(&value()).unwrap();
        native["client_id"] = "synthetic-client".into(); native["client_secret"] = "synthetic-secret".into();
        write_private(&home.join("auth.json"), &native).unwrap();
        let normalized = credentials(&home).unwrap();
        assert_eq!(normalized["expiry_date"], value()["expiry_date"]);
        assert_eq!(normalized["id_token"], "synthetic-id");
        std::fs::remove_dir_all(home).unwrap();
    }
    #[test]
    #[ignore = "reads the current local Google login and verifies identity; never activates"]
    fn live_current_google_identity_matches_saved_account() {
        let email = crate::account_setup::current_google_email()
            .expect("The current Antigravity login must be identifiable.");
        let accounts = list().unwrap();
        let matches = accounts.iter().filter(|account| account.email.as_deref()
            .is_some_and(|saved| saved.eq_ignore_ascii_case(&email))).count();
        assert_eq!(matches, 1, "The current login must identify exactly one saved card.");
    }
    #[test]
    #[ignore = "reads and verifies the current local Google login in a disposable draft; never activates"]
    fn live_current_google_subscription_and_quota() {
        let home = std::env::temp_dir().join(format!("orbilap-google-live-{}", uuid::Uuid::new_v4()));
        private_dir(&home).unwrap();
        let result = (|| {
            copy_current(&home)?;
            let probe = Probe::new(None)?;
            let (_, _, subscription) = inspect_with_probe(&home, &probe)?;
            let quota = quota_after_inspect(&home, &probe)?;
            consumer_profile(&credentials(&home)?)?;
            eprintln!("Verified paid plan={:?}, measured windows={}", subscription.plan, quota.windows.as_ref().map_or(0, Vec::len));
            Ok::<_, String>(())
        })();
        std::fs::remove_dir_all(home).unwrap();
        result.unwrap();
    }
}
