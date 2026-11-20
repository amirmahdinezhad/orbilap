//! The subscription endpoint supplies payment evidence. The Codex usage
//! endpoint independently supplies the account's current plan.
use crate::{codex, subscriptions::SubscriptionBilling};
use serde_json::Value;
use sha2::{Digest, Sha256};
use std::{collections::HashMap, io::Read, sync::{LazyLock, Mutex}, time::{Duration, Instant}};

#[derive(Clone)]
pub(crate) struct Snapshot {
    pub billing: SubscriptionBilling,
    pub active_until: Option<String>,
}

fn date(value: &Value) -> Option<String> {
    let text = value.as_str()?;
    crate::timestamps::parse_rfc3339(text).ok()?;
    Some(text.to_owned())
}

fn parse(payload: &Value) -> Option<Snapshot> {
    // A plan name or successful usage cannot establish whether renewal was paid.
    let payment_required = payload["is_delinquent"].as_bool()?;
    Some(Snapshot {
        billing: SubscriptionBilling {
            payment_required,
            payment_due_at: payment_required.then(|| date(&payload["became_delinquent_timestamp"])).flatten(),
            grace_period_ends_at: payment_required.then(|| date(&payload["grace_period_end_timestamp"])).flatten(),
            checked_at: crate::timestamps::now_rfc3339(),
        },
        active_until: date(&payload["active_until"]),
    })
}

struct Entry {
    attempted: Instant,
    token_hash: [u8; 32],
    snapshot: Option<Snapshot>,
}

#[derive(Default)]
struct BillingCache(Mutex<HashMap<[u8; 32], Entry>>);

impl BillingCache {
    fn peek(&self, identity: [u8; 32]) -> Option<Snapshot> {
        self.0.lock().ok()?.get(&identity)?.snapshot.clone()
    }

    fn read(&self, identity: [u8; 32], token_hash: [u8; 32], force: bool, fetch: impl FnOnce() -> Option<Snapshot>) -> Option<Snapshot> {
        let previous = {
            let cache = self.0.lock().ok()?;
            if let Some(entry) = cache.get(&identity) {
                if !force && entry.token_hash == token_hash && entry.attempted.elapsed() < Duration::from_secs(60) {
                    return entry.snapshot.clone();
                }
            }
            cache.get(&identity).and_then(|entry| entry.snapshot.clone())
        };
        let started = Instant::now();
        // Outages cannot turn known overdue payment into a successful renewal.
        // Keep the original checkedAt so stale evidence remains distinguishable.
        let fresh = fetch().or(previous);
        if let Ok(mut cache) = self.0.lock() {
            if cache.get(&identity).is_some_and(|entry| entry.attempted > started) {
                return cache.get(&identity).and_then(|entry| entry.snapshot.clone());
            }
            if cache.len() >= 256 && !cache.contains_key(&identity) {
                if let Some(oldest) = cache.iter().min_by_key(|(_, entry)| entry.attempted).map(|(key, _)| *key) {
                    cache.remove(&oldest);
                }
            }
            cache.insert(identity, Entry { attempted: started, token_hash, snapshot: fresh.clone() });
        }
        fresh
    }
}

static CACHE: LazyLock<BillingCache> = LazyLock::new(BillingCache::default);

struct LivePlan {
    started: Instant,
    token_hash: [u8; 32],
    free: bool,
}

static LIVE_PLANS: LazyLock<Mutex<HashMap<[u8; 32], LivePlan>>> = LazyLock::new(|| Mutex::new(HashMap::new()));

fn identity(raw: &Value) -> Option<[u8; 32]> {
    let claims = raw["tokens"]["id_token"].as_str().and_then(codex::jwt_payload)?;
    let subject = claims["sub"].as_str().filter(|subject| !subject.is_empty())?;
    let account = raw["tokens"]["account_id"].as_str()
        .or_else(|| claims["https://api.openai.com/auth"]["chatgpt_account_id"].as_str())
        .filter(|account| !account.is_empty())?;
    Some(Sha256::digest(serde_json::to_vec(&(subject, account)).ok()?).into())
}

fn access_token_hash(raw: &Value) -> Option<[u8; 32]> {
    let token = raw["tokens"]["access_token"].as_str().filter(|token| !token.is_empty())?;
    Some(Sha256::digest(token.as_bytes()).into())
}

pub(crate) fn live_plan_is_free(raw: &Value) -> bool {
    identity(raw).is_some_and(|key| {
        LIVE_PLANS.lock().is_ok_and(|plans| plans.get(&key).is_some_and(|plan| plan.free))
    })
}

pub(crate) fn live_plan_is_fresh(raw: &Value) -> bool {
    identity(raw).zip(access_token_hash(raw)).is_some_and(|(key, token_hash)| {
        LIVE_PLANS.lock().is_ok_and(|plans| plans.get(&key).is_some_and(|plan| {
            plan.token_hash == token_hash && plan.started.elapsed() < Duration::from_secs(60)
        }))
    })
}

/// Only a successful, account-scoped usage response can change visibility.
pub(crate) fn observe_usage_plan(raw: &Value, started: Instant, payload: &Value) {
    let Some(plan) = payload["plan_type"].as_str() else { return; };
    let free = plan == "free";
    if !free && !crate::subscriptions::is_chatgpt_paid_plan(plan) { return; }
    let Some((key, token_hash)) = identity(raw).zip(access_token_hash(raw)) else { return; };
    let Ok(mut plans) = LIVE_PLANS.lock() else { return; };
    if plans.get(&key).is_some_and(|previous| previous.started > started) { return; }
    if plans.len() >= 256 && !plans.contains_key(&key) {
        if let Some(oldest) = plans.iter().min_by_key(|(_, plan)| plan.started).map(|(key, _)| *key) {
            plans.remove(&oldest);
        }
    }
    plans.insert(key, LivePlan { started, token_hash, free });
}

/// Existing payment evidence survives rename/switch responses without network I/O.
pub(crate) fn cached(raw: &Value) -> Option<Snapshot> {
    CACHE.peek(identity(raw)?)
}

/// No credential values are retained in cache, logs, errors or IPC metadata.
pub(crate) fn chatgpt(raw: &Value, force: bool) -> Option<Snapshot> {
    let identity = identity(raw)?;
    let (token, account, _) = codex::oauth_access_from(raw)?;
    let account = account.filter(|account| !account.is_empty())?;
    let token_hash: [u8; 32] = Sha256::digest(token.as_bytes()).into();
    CACHE.read(identity, token_hash, force, || {
        let client = crate::quota::usage_client().ok()?;
        let mut url = reqwest::Url::parse("https://chatgpt.com/backend-api/subscriptions").ok()?;
        url.query_pairs_mut().append_pair("account_id", &account);
        let response = client.get(url)
            .bearer_auth(token)
            .header("ChatGPT-Account-Id", &account)
            .header("Accept", "application/json")
            .header("User-Agent", concat!("Orbilap/", env!("CARGO_PKG_VERSION")))
            .timeout(Duration::from_secs(4))
            .send().ok()?;
        if !response.status().is_success() { return None; }
        let mut body = Vec::new();
        response.take(256 * 1024 + 1).read_to_end(&mut body).ok()?;
        if body.len() > 256 * 1024 { return None; }
        parse(&serde_json::from_slice::<Value>(&body).ok()?)
    })
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;

    fn overdue() -> Snapshot {
        parse(&json!({"is_delinquent":true, "active_until":"2099-12-13T05:37:18Z",
            "became_delinquent_timestamp":"2026-11-13T06:37:59Z", "grace_period_end_timestamp":"2026-11-20T06:37:59Z"})).unwrap()
    }

    #[test]
    fn future_access_date_and_paid_plan_do_not_mask_overdue_payment() {
        let result = overdue();
        assert!(result.billing.payment_required);
        assert_eq!(result.billing.payment_due_at.as_deref(), Some("2026-11-13T06:37:59Z"));
        assert_eq!(result.billing.grace_period_ends_at.as_deref(), Some("2026-11-20T06:37:59Z"));
        assert_eq!(result.active_until.as_deref(), Some("2099-12-13T05:37:18Z"));
        assert!(parse(&json!({"plan_type":"plus", "is_active":true})).is_none());
        assert!(parse(&json!({"is_delinquent":"true"})).is_none());
    }

    #[test]
    fn renewal_clears_old_payment_dates_and_malformed_dates_are_omitted() {
        let renewed = parse(&json!({"is_delinquent":false, "became_delinquent_timestamp":"2026-11-13T06:37:59Z"})).unwrap();
        assert!(!renewed.billing.payment_required);
        assert!(renewed.billing.payment_due_at.is_none());
        let malformed = parse(&json!({"is_delinquent":true, "active_until":"invalid", "became_delinquent_timestamp":0})).unwrap();
        assert!(malformed.billing.payment_required);
        assert!(malformed.billing.payment_due_at.is_none() && malformed.active_until.is_none());
    }

    #[test]
    fn cached_accounts_are_isolated_and_manual_refresh_or_token_rotation_rechecks() {
        let cache = BillingCache::default();
        let first = cache.read([1;32], [3;32], false, || Some(overdue())).unwrap();
        assert_eq!(cache.peek([1;32]).unwrap().billing, first.billing);
        assert!(cache.peek([2;32]).is_none());
        assert!(cache.read([1;32], [3;32], false, || panic!("cached request")).unwrap().billing.payment_required);
        assert!(cache.read([2;32], [3;32], false, || None).is_none());
        let failed = cache.read([1;32], [3;32], true, || None).unwrap();
        assert_eq!(first.billing, failed.billing);
        let renewed = cache.read([1;32], [4;32], false, || parse(&json!({"is_delinquent":false}))).unwrap();
        assert!(!renewed.billing.payment_required);
    }
}
