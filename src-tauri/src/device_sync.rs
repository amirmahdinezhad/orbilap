//! Orbilap device credentials and account identities stay native. The coordinator
//! receives only a per-group account hash, device metadata and optional totals.
use base64::{prelude::BASE64_URL_SAFE_NO_PAD, Engine};
use serde::{Deserialize, Serialize};
use serde_json::{json, Value};
use sha2::{Digest, Sha256};
use std::{
    collections::BTreeMap,
    fs,
    io::Read,
    path::{Path, PathBuf},
    sync::{LazyLock, Mutex},
    time::Duration,
};
use uuid::Uuid;

static LOCK: LazyLock<Mutex<()>> = LazyLock::new(|| Mutex::new(()));

// Keep in sync with src/deviceManagementAvailability.ts; see docs/DEVICE-SYNC.md.
pub(crate) const ENABLED: bool = false;

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct AccountRef {
    provider: String,
    id: String,
    session_id: Option<String>,
}

#[derive(Deserialize)]
#[serde(
    tag = "action",
    rename_all = "camelCase",
    rename_all_fields = "camelCase"
)]
pub(crate) enum Operation {
    Status,
    Create {
        endpoint: String,
        setup_key: String,
        name: String,
        capacity: u8,
    },
    Join {
        invitation: String,
        name: String,
    },
    Capacity {
        capacity: u8,
    },
    Shares {
        shares: Option<BTreeMap<String, u8>>,
    },
    Invite,
    Revoke {
        device_id: String,
    },
}

#[derive(Clone, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
struct Link {
    endpoint: String,
    group_id: String,
    device_id: String,
    secret: String,
    provider: String,
    profile_id: Option<String>,
    pending: bool,
}

#[derive(Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
struct Invitation {
    endpoint: String,
    group_id: String,
    invitation: String,
}

#[derive(Serialize)]
#[serde(
    tag = "state",
    rename_all = "camelCase",
    rename_all_fields = "camelCase"
)]
pub(crate) enum Outcome {
    Unlinked,
    Revoked,
    Connected {
        group: Group,
        quota: Option<crate::quota::QuotaSet>,
    },
    Invitation {
        code: String,
        expires_at: i64,
    },
}

#[derive(Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct Group {
    device_id: String,
    #[serde(default)]
    owner_device_id: Option<String>,
    capacity: u8,
    devices: Vec<Device>,
    #[serde(default)]
    shares: Option<BTreeMap<String, u8>>,
    #[serde(default)]
    estimates: Vec<Estimate>,
    #[serde(default)]
    alerts: Vec<Alert>,
}

#[derive(Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
struct Estimate {
    device_id: String,
    window: String,
    resets_at: i64,
    percent: f64,
    share: Option<f64>,
    #[serde(skip_serializing_if = "Option::is_none")]
    valid_until: Option<i64>,
}

#[derive(Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
struct Alert {
    #[serde(flatten)]
    estimate: Estimate,
    device_name: String,
}

#[derive(Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
struct Device {
    id: String,
    name: String,
    last_seen: i64,
    revoked_at: Option<i64>,
    samples: Vec<crate::device_usage::Sample>,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct ServerInvitation {
    invitation: String,
    expires_at: i64,
}

fn stable_identity(account: &AccountRef) -> Result<String, String> {
    if let Some(session) = &account.session_id {
        return crate::account_setup::device_identity(session, &account.id, &account.provider);
    }
    match account.provider.as_str() {
        "codex" => {
            let auth = crate::profiles::saved_auth_path(&account.id)?;
            crate::profiles::setup_login_identity(auth.parent().ok_or("Account is unavailable.")?)
        }
        "claude" => crate::claude_profiles::device_email(&account.id),
        "antigravity" => crate::antigravity::list()?
            .into_iter()
            .find(|profile| profile.id == account.id)
            .and_then(|profile| profile.email)
            .map(|email| email.to_lowercase())
            .ok_or_else(|| "Account is unavailable.".into()),
        _ => Err("Choose a supported account.".into()),
    }
}

fn digest(parts: &[&str]) -> String {
    let mut hash = Sha256::new();
    for part in parts {
        hash.update((part.len() as u64).to_be_bytes());
        hash.update(part.as_bytes());
    }
    format!("{:x}", hash.finalize())
}

fn root() -> PathBuf {
    crate::paths::app_data_dir().join("orbilap-device-links")
}

fn link_path(provider: &str, identity: &str) -> PathBuf {
    root().join(format!("{}.json", digest(&[provider, identity])))
}

fn read(path: &Path) -> Result<Option<Link>, String> {
    let metadata = match fs::symlink_metadata(path) {
        Ok(metadata) => metadata,
        Err(err) if err.kind() == std::io::ErrorKind::NotFound => return Ok(None),
        Err(_) => return Err("Cannot read this Mac's device link.".into()),
    };
    if !metadata.is_file() || metadata.len() > 4096 {
        return Err("This Mac's device link is invalid.".into());
    }
    let bytes = fs::read(path).map_err(|_| "Cannot read this Mac's device link.")?;
    serde_json::from_slice(&bytes)
        .map(Some)
        .map_err(|_| "This Mac's device link is invalid.".into())
}

fn write(path: &Path, link: &Link) -> Result<(), String> {
    crate::profiles::private_dir(&root())?;
    crate::profiles::write_private(path, &json!(link))
}

pub(crate) fn bind_saved(provider: &str, identity: &str, id: &str) {
    if !ENABLED {
        return;
    }
    let Ok(_guard) = LOCK.lock() else { return };
    let path = link_path(provider, identity);
    if let Ok(Some(mut link)) = read(&path) {
        link.profile_id = Some(id.into());
        let _ = write(&path, &link);
    }
}

fn endpoint(raw: &str) -> Result<String, String> {
    let url =
        reqwest::Url::parse(raw.trim()).map_err(|_| "Enter the device server's HTTPS address.")?;
    let loopback = matches!(url.host_str(), Some("127.0.0.1" | "[::1]"));
    if !matches!(url.scheme(), "https") && !(url.scheme() == "http" && loopback) {
        return Err("Use HTTPS to connect other Macs to the device server.".into());
    }
    if url.host().is_none()
        || !url.username().is_empty()
        || url.password().is_some()
        || url.query().is_some()
        || url.fragment().is_some()
        || url.path() != "/"
    {
        return Err(
            "Enter only the device server address, without a path or sign-in details.".into(),
        );
    }
    Ok(url.to_string().trim_end_matches('/').to_owned())
}

fn valid_secret(text: &str) -> bool {
    (32..=128).contains(&text.len())
        && text
            .bytes()
            .all(|b| b.is_ascii_alphanumeric() || b == b'-' || b == b'_')
}

fn parse_invitation(code: &str) -> Result<Invitation, String> {
    let invalid = "Use a valid Orbilap invitation from another Mac.";
    let value = code
        .trim()
        .strip_prefix("orbilap-device-v1.")
        .filter(|v| v.len() < 3072)
        .ok_or(invalid)?;
    let raw = BASE64_URL_SAFE_NO_PAD.decode(value).map_err(|_| invalid)?;
    let mut invitation: Invitation = serde_json::from_slice(&raw).map_err(|_| invalid)?;
    if Uuid::parse_str(&invitation.group_id).is_err() || !valid_secret(&invitation.invitation) {
        return Err(invalid.into());
    }
    invitation.endpoint = endpoint(&invitation.endpoint)?;
    Ok(invitation)
}

#[derive(Debug)]
struct Failure {
    status: Option<u16>,
    code: Option<String>,
}

fn send<T: serde::de::DeserializeOwned>(
    link: &Link,
    body: Value,
    setup: Option<&str>,
) -> Result<T, Failure> {
    let transport = |_| Failure {
        status: None,
        code: None,
    };
    let base = endpoint(&link.endpoint).map_err(transport)?;
    let client = reqwest::blocking::Client::builder()
        .timeout(Duration::from_secs(8))
        .redirect(reqwest::redirect::Policy::none())
        .no_proxy()
        .build()
        .map_err(|_| Failure {
            status: None,
            code: None,
        })?;
    let mut request = client
        .post(format!("{base}/v1/devices"))
        .bearer_auth(&link.secret)
        .json(&body);
    if let Some(key) = setup {
        request = request.header("X-Setup-Key", key);
    }
    let response = request.send().map_err(|_| Failure {
        status: None,
        code: None,
    })?;
    let status = response.status();
    if !status.is_success() {
        let mut raw = Vec::new();
        let code = response
            .take(4096)
            .read_to_end(&mut raw)
            .ok()
            .and_then(|_| serde_json::from_slice::<Value>(&raw).ok())
            .and_then(|body| body["code"].as_str().map(str::to_owned));
        return Err(Failure {
            status: Some(status.as_u16()),
            code,
        });
    }
    let mut bytes = Vec::new();
    response
        .take(512 * 1024 + 1)
        .read_to_end(&mut bytes)
        .map_err(|_| Failure {
            status: None,
            code: None,
        })?;
    if bytes.len() > 512 * 1024 {
        return Err(Failure {
            status: None,
            code: None,
        });
    }
    serde_json::from_slice(&bytes).map_err(|_| Failure {
        status: None,
        code: None,
    })
}

fn message(failure: Failure, action: &str) -> String {
    match failure.code.as_deref() {
        Some("owner_required") => return "Only the owner Mac can manage this group.".into(),
        Some("invalid_shares") => return "Assign at most 100% across the connected Macs.".into(),
        Some("not_over_share") => return "This Mac no longer has a current estimate above its share. Refresh the device list.".into(),
        _ => {}
    }
    match (failure.status, action) {
        (Some(401), "create") => "The device server rejected the setup key.",
        (Some(403), "join") => "The invitation requires the same provider account.",
        (Some(410), "join") => "This invitation expired or was already used. Get a new invitation.",
        (Some(429), "invite") => "Too many active invitations. Wait for one to be used or expire.",
        (Some(409), "join" | "invite") => {
            "All slots are in use. Increase capacity or revoke a device."
        }
        (Some(409), "capacity") => {
            "Revoke a device before lowering capacity below the connected count."
        }
        (Some(400), _) => "The device server rejected these settings.",
        (Some(401 | 403), _) => "This Mac is no longer connected.",
        _ => "Could not reach the device server or verify its response. Try again.",
    }
    .into()
}

fn validate_name(name: &str) -> Result<&str, String> {
    let name = name.trim();
    if name.is_empty() || name.chars().count() > 64 || name.chars().any(char::is_control) {
        return Err("Use a device name with 1–64 characters.".into());
    }
    Ok(name)
}

fn capacity(value: u8) -> Result<u8, String> {
    if (1..=64).contains(&value) {
        Ok(value)
    } else {
        Err("Use a capacity from 1 to 64.".into())
    }
}

fn new_link(account: &AccountRef, endpoint: String, group_id: String) -> Link {
    Link {
        endpoint,
        group_id,
        device_id: Uuid::new_v4().to_string(),
        secret: format!("{}{}", Uuid::new_v4().simple(), Uuid::new_v4().simple()),
        provider: account.provider.clone(),
        pending: true,
        profile_id: account.session_id.is_none().then(|| account.id.clone()),
    }
}

fn quota(link: &Link) -> Option<crate::quota::QuotaSet> {
    let id = link.profile_id.as_deref()?;
    match link.provider.as_str() {
        "codex" => crate::profiles::quota_for(id),
        "claude" => crate::claude_profiles::quota(Some(id)).ok(),
        "antigravity" => crate::antigravity::account_quota(id, false)
            .ok()
            .map(|result| result.quota),
        _ => None,
    }
    // Claude can return historical local snapshots. Keep the timestamp in the UI.
}

fn publish(link: &Link) -> (Result<Group, Failure>, Option<crate::quota::QuotaSet>) {
    let quota = quota(link);
    let mut body = json!({ "action": "status", "groupId": &link.group_id });
    if let Some(profile) = link
        .profile_id
        .as_deref()
        .filter(|_| link.provider == "codex")
    {
        body["samples"] = json!(quota.as_ref().map_or_else(Vec::new, |quota| {
            crate::device_usage::samples(profile, quota, chrono::Utc::now())
        }));
        let official: Vec<_> = quota
            .as_ref()
            .filter(|quota| quota.error.is_none() && quota.as_of.is_none())
            .into_iter()
            .flat_map(|quota| quota.windows.iter().flatten())
            .filter_map(|window| {
                if !matches!(window.window.as_str(), "5-hour" | "Weekly")
                    || !window.percent.is_finite()
                    || !(0.0..=100.0).contains(&window.percent)
                {
                    return None;
                }
                let reset = chrono::DateTime::parse_from_rfc3339(window.resets_at.as_deref()?)
                    .ok()?
                    .timestamp_millis();
                Some(
                    json!({"window": &window.window, "resetsAt": reset, "percent": window.percent}),
                )
            })
            .collect();
        body["quotas"] = json!(official);
    }
    (send(link, body, None), quota)
}

fn status(path: &Path, link: Link) -> Result<Outcome, String> {
    let (group, quota) = publish(&link);
    match group {
        Ok(group) => {
            if link.pending {
                write(
                    path,
                    &Link {
                        pending: false,
                        ..link
                    },
                )?;
            }
            Ok(Outcome::Connected { group, quota })
        }
        Err(failure) if failure.code.as_deref() == Some("member_missing") && link.pending => {
            Ok(Outcome::Unlinked)
        }
        Err(failure)
            if matches!(
                failure.code.as_deref(),
                Some("member_revoked" | "member_missing")
            ) =>
        {
            fs::remove_file(path).map_err(|_| "Cannot clear this Mac's revoked device link.")?;
            Ok(Outcome::Revoked)
        }
        Err(failure) => Err(message(failure, "status")),
    }
}

pub(crate) fn run(account: AccountRef, operation: Operation) -> Result<Outcome, String> {
    if !ENABLED {
        return Err("Device management is not available in this version.".into());
    }
    let identity = stable_identity(&account)?;
    let path = link_path(&account.provider, &identity);
    let _guard = LOCK.lock().map_err(|_| "Device sync is busy.")?;
    let mut existing = read(&path)?;
    if let Some(link) = existing.as_mut() {
        if account.session_id.is_none() && link.profile_id.as_deref() != Some(&account.id) {
            link.profile_id = Some(account.id.clone());
            write(&path, link)?;
        }
    }

    let (mut link, operation_body, setup, action) = match operation {
        Operation::Status => {
            return existing.map_or(Ok(Outcome::Unlinked), |link| status(&path, link))
        }
        Operation::Create {
            endpoint: raw,
            setup_key,
            name,
            capacity: max,
        } => {
            let endpoint = endpoint(&raw)?;
            let setup_key = setup_key.trim().to_owned();
            if !valid_secret(&setup_key) {
                return Err("Enter the setup key for your device server.".into());
            }
            let name = validate_name(&name)?;
            let max = capacity(max)?;
            let previous = existing
                .as_ref()
                .filter(|l| l.pending && l.endpoint == endpoint);
            let id = previous.map_or_else(|| Uuid::new_v4().to_string(), |l| l.group_id.clone());
            let link = previous
                .cloned()
                .unwrap_or_else(|| new_link(&account, endpoint, id));
            (
                link,
                json!({ "capacity": max, "name": name }),
                Some(setup_key),
                "create",
            )
        }
        Operation::Join { invitation, name } => {
            let invitation = parse_invitation(&invitation)?;
            let name = validate_name(&name)?;
            let previous = existing.as_ref().filter(|l| {
                l.pending && l.endpoint == invitation.endpoint && l.group_id == invitation.group_id
            });
            let link = previous
                .cloned()
                .unwrap_or_else(|| new_link(&account, invitation.endpoint, invitation.group_id));
            (
                link,
                json!({ "invitation": invitation.invitation, "name": name }),
                None,
                "join",
            )
        }
        Operation::Invite => {
            let link = existing.ok_or("Connect this Mac first.")?;
            let reply: ServerInvitation = send(
                &link,
                json!({ "action": "invite", "groupId": link.group_id }),
                None,
            )
            .map_err(|failure| message(failure, "invite"))?;
            if !valid_secret(&reply.invitation) {
                return Err("Invalid invitation from the device server.".into());
            }
            let code = Invitation {
                group_id: link.group_id,
                endpoint: link.endpoint,
                invitation: reply.invitation,
            };
            return Ok(Outcome::Invitation {
                code: format!(
                    "orbilap-device-v1.{}",
                    BASE64_URL_SAFE_NO_PAD.encode(
                        serde_json::to_vec(&code).map_err(|_| "Cannot encode the invitation.")?
                    )
                ),
                expires_at: reply.expires_at,
            });
        }
        Operation::Capacity { capacity: max } => (
            existing.clone().ok_or("Connect this Mac first.")?,
            json!({ "capacity": capacity(max)? }),
            None,
            "capacity",
        ),
        Operation::Shares { shares } => {
            if shares.as_ref().is_some_and(|values| {
                values.len() > 64
                    || values.values().map(|value| u32::from(*value)).sum::<u32>() > 100
                    || values.keys().any(|id| Uuid::parse_str(id).is_err())
            }) {
                return Err("Assign at most 100% across the connected Macs.".into());
            }
            (
                existing.clone().ok_or("Connect this Mac first.")?,
                json!({ "shares": shares }),
                None,
                "shares",
            )
        }
        Operation::Revoke { device_id } => {
            if Uuid::parse_str(&device_id).is_err() {
                return Err("Choose a connected device.".into());
            }
            (
                existing.clone().ok_or("Connect this Mac first.")?,
                json!({ "deviceId": device_id }),
                None,
                "revoke",
            )
        }
    };
    let enrolling = matches!(action, "create" | "join");
    let mut body = operation_body;
    body["groupId"] = json!(&link.group_id);
    body["action"] = json!(action);
    if enrolling {
        if existing.as_ref().is_some_and(|previous| {
            !previous.pending
                || previous.endpoint != link.endpoint
                || previous.group_id != link.group_id
        }) {
            return Err(
                "Refresh this account's current device connection before starting another.".into(),
            );
        }
        body["deviceId"] = json!(&link.device_id);
        body["accountTag"] = json!(digest(&[&link.group_id, &account.provider, &identity]));
        write(&path, &link)?;
    }
    let result: Result<Group, Failure> = send(&link, body, setup.as_deref());
    match result {
        Ok(group) => {
            if link.pending {
                link.pending = false;
                write(&path, &link)?;
            }
            Ok(Outcome::Connected { group, quota: None })
        }
        Err(failure) => {
            if enrolling
                && failure
                    .status
                    .is_some_and(|status| (400..500).contains(&status))
            {
                fs::remove_file(&path)
                    .map_err(|_| "Cannot clear this Mac's failed device link.")?;
            }
            Err(message(failure, action))
        }
    }
}

fn notify_overages(app: &tauri::AppHandle, path: &Path, link: &Link, group: Group) {
    use tauri_plugin_notification::NotificationExt;
    if group.device_id != link.device_id || group.alerts.is_empty() {
        return;
    }
    let now = chrono::Utc::now().timestamp_millis();
    let receipt_path = path.with_extension("alerts");
    let mut receipts: BTreeMap<String, i64> = fs::symlink_metadata(&receipt_path)
        .ok()
        .filter(|metadata| metadata.is_file() && metadata.len() <= 32 * 1024)
        .and_then(|_| fs::read(&receipt_path).ok())
        .and_then(|bytes| serde_json::from_slice(&bytes).ok())
        .unwrap_or_default();
    receipts.retain(|_, reset| *reset > now);
    let label = link
        .profile_id
        .as_deref()
        .and_then(crate::profiles::device_profile_name)
        .unwrap_or_else(|| "Codex account".into());
    let mut changed = false;
    for alert in group.alerts.into_iter().take(128) {
        let estimate = alert.estimate;
        let is_local = estimate.device_id == link.device_id;
        if (!is_local && group.owner_device_id.as_deref() != Some(&link.device_id))
            || Uuid::parse_str(&estimate.device_id).is_err()
            || !matches!(estimate.window.as_str(), "5-hour" | "Weekly")
            || !(now..=now + 7 * 86_400_000).contains(&estimate.resets_at)
        {
            continue;
        }
        let Some(share) = estimate.share.filter(|share| {
            (0.0..=100.0).contains(share)
                && (*share..=100.0).contains(&estimate.percent)
                && estimate.percent > *share
        }) else {
            continue;
        };
        let key = format!(
            "{}:{}:{}:{}",
            link.group_id, estimate.device_id, estimate.window, estimate.resets_at
        );
        if receipts.contains_key(&key) {
            continue;
        }
        let device: String = if is_local {
            "This Mac".into()
        } else {
            alert
                .device_name
                .chars()
                .filter(|ch| !ch.is_control())
                .take(64)
                .collect()
        };
        let body = format!("{device} exceeded its share on {label}: estimated {:.2}% of the {} limit, with {:.2}% assigned.",
            estimate.percent, estimate.window, share);
        if app
            .notification()
            .builder()
            .title("Orbilap · Device over its share")
            .body(body)
            .show()
            .is_ok()
        {
            receipts.insert(key, estimate.resets_at);
            changed = true;
        }
    }
    if changed {
        let _ = crate::profiles::write_private(&receipt_path, &json!(receipts));
    }
}

pub(crate) fn start_monitor(app: tauri::AppHandle) {
    if !ENABLED {
        return;
    }
    std::thread::spawn(move || loop {
        std::thread::sleep(Duration::from_secs(90));
        let Ok(entries) = fs::read_dir(root()) else {
            continue;
        };
        for entry in entries.flatten().take(128) {
            let path = entry.path();
            if path.extension().and_then(|x| x.to_str()) != Some("json") {
                continue;
            }
            let Ok(Some(link)) = read(&path) else {
                continue;
            };
            let Some(id) = &link.profile_id else { continue };
            if link.pending {
                continue;
            }
            let account = AccountRef {
                provider: link.provider.clone(),
                id: id.clone(),
                session_id: None,
            };
            let Ok(identity) = stable_identity(&account) else {
                continue;
            };
            if link_path(&link.provider, &identity) != path {
                continue;
            }
            // Avoid fetching other providers' quotas just to report a heartbeat.
            if link.provider == "codex" {
                if let (Ok(group), _) = publish(&link) {
                    notify_overages(&app, &path, &link, group);
                }
            } else {
                let _ = send::<Group>(
                    &link,
                    json!({ "action": "status", "groupId": link.group_id }),
                    None,
                );
            }
        }
    });
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn parked_feature_rejects_requests_before_looking_up_accounts() {
        let account = AccountRef {
            provider: "codex".into(),
            id: "missing-profile".into(),
            session_id: Some("missing-session".into()),
        };
        assert_eq!(
            run(account, Operation::Status).err().as_deref(),
            Some("Device management is not available in this version.")
        );
    }

    #[test]
    fn addresses_require_https_except_for_literal_loopback() {
        assert!(endpoint("https://example.com:8843").is_ok());
        assert!(endpoint("http://127.0.0.1:8843").is_ok());
        for bad in [
            "http://example.com",
            "file:///tmp/test",
            "https://user@example.com",
            "https://example.com/path",
            "https://example.com?q=1",
            "https://example.com/#abc",
        ] {
            assert!(endpoint(bad).is_err(), "{bad}");
        }
    }
}
