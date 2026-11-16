//! Estimate from local, account-scoped Codex usage events. Historical or
//! unattributed transcripts are not a source of official quota per device.
use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};
use serde_json::Value;
use std::{
    collections::HashSet,
    fs,
    io::{BufRead, BufReader, Read},
    path::Path,
};

#[derive(Clone, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct Sample {
    window: String,
    resets_at: i64,
    tokens: u64,
}

struct Window {
    sample: Sample,
    start: i64,
}

const MAX_FILE: u64 = 48 * 1024 * 1024;
const MAX_SCAN: u64 = 192 * 1024 * 1024;
const MAX_LINE: u64 = 8 * 1024 * 1024;

fn time(value: &Value) -> Option<i64> {
    value
        .as_str()?
        .parse::<DateTime<Utc>>()
        .ok()
        .map(|date| date.timestamp_millis())
}

fn windows(quota: &crate::quota::QuotaSet, now: DateTime<Utc>) -> Vec<Window> {
    if quota.error.is_some() {
        return Vec::new();
    }
    quota
        .windows
        .iter()
        .flatten()
        .filter_map(|entry| {
            let hours = match entry.window.as_str() {
                "5-hour" => 5,
                "Weekly" => 168,
                _ => return None,
            };
            let reset = entry
                .resets_at
                .as_deref()?
                .parse::<DateTime<Utc>>()
                .ok()?
                .timestamp_millis();
            let start = reset - hours * 3_600_000;
            (start <= now.timestamp_millis() && now.timestamp_millis() < reset).then(|| Window {
                start,
                sample: Sample {
                    window: entry.window.clone(),
                    resets_at: reset,
                    tokens: 0,
                },
            })
        })
        .collect()
}

fn count(
    mut reader: impl BufRead,
    user: &str,
    account: &str,
    windows: &[Window],
    now: i64,
) -> Option<(String, Vec<u64>)> {
    let mut line = Vec::new();
    (&mut reader)
        .take(MAX_LINE + 1)
        .read_until(b'\n', &mut line)
        .ok()?;
    if line.len() as u64 > MAX_LINE {
        return None;
    }
    let header: Value = serde_json::from_slice(&line).ok()?;
    let meta = &header["payload"];
    if header["type"] != "session_meta"
        || meta["account_scoped"] != true
        || meta["model_provider"] != "openai"
        || meta["creator_account_id"] != account
        || meta["creator_user_id"] != user
        || !matches!(meta["source"].as_str(), Some("vscode" | "cli" | "exec"))
    {
        return None;
    }
    let id = meta["id"].as_str()?.to_owned();
    let mut totals = vec![0u64; windows.len()];
    let mut previous = 0;
    let mut observed = false;
    loop {
        line.clear();
        let size = (&mut reader)
            .take(MAX_LINE + 1)
            .read_until(b'\n', &mut line)
            .ok()?;
        if size as u64 > MAX_LINE {
            return None;
        }
        if size == 0 || !line.ends_with(b"\n") {
            break;
        }
        if !line
            .windows(b"\"token_count\"".len())
            .any(|bytes| bytes == b"\"token_count\"")
        {
            continue;
        }
        let Ok(row) = serde_json::from_slice::<Value>(&line) else {
            continue;
        };
        if row["type"] != "event_msg" || row["payload"]["type"] != "token_count" {
            continue;
        }
        let Some(total) = row["payload"]["info"]["total_token_usage"]["total_tokens"].as_u64()
        else {
            continue;
        };
        let delta = total.saturating_sub(previous);
        if total < previous {
            return None;
        }
        previous = total;
        let Some(stamp) = time(&row["timestamp"]) else {
            continue;
        };
        for (value, window) in totals.iter_mut().zip(windows) {
            if window.start <= stamp && stamp <= now && stamp < window.sample.resets_at {
                observed = true;
                *value = value.saturating_add(delta);
            }
        }
    }
    observed.then_some((id, totals))
}

fn aggregate(
    home: &Path,
    user: &str,
    account: &str,
    mut windows: Vec<Window>,
    now: DateTime<Utc>,
) -> Vec<Sample> {
    let Some(first) = windows.iter().map(|window| window.start).min() else {
        return Vec::new();
    };
    let mut budget = MAX_SCAN;
    let mut seen = HashSet::new();
    let mut visited = 0;
    let mut paths = vec![
        (home.join("sessions"), 0),
        (home.join("archived_sessions"), 0),
    ];
    while let Some((path, level)) = paths.pop() {
        visited += 1;
        if visited > 25_000 {
            return Vec::new();
        }
        let Ok(metadata) = fs::symlink_metadata(&path) else {
            continue;
        };
        if metadata.is_dir() && level < 5 {
            if let Ok(entries) = fs::read_dir(path) {
                paths.extend(entries.flatten().map(|entry| (entry.path(), level + 1)));
            }
        } else if metadata.is_file()
            && path
                .extension()
                .is_some_and(|extension| extension == "jsonl")
        {
            let Ok(modified) = metadata.modified() else {
                continue;
            };
            if DateTime::<Utc>::from(modified).timestamp_millis() < first {
                continue;
            }
            if metadata.len() > MAX_FILE || metadata.len() > budget {
                return Vec::new();
            }
            budget -= metadata.len();
            let Ok(file) = fs::File::open(path) else {
                continue;
            };
            if let Some((id, totals)) = count(
                BufReader::new(file.take(metadata.len())),
                user,
                account,
                &windows,
                now.timestamp_millis(),
            ) {
                if !seen.insert(id) {
                    continue;
                }
                for (window, tokens) in windows.iter_mut().zip(totals) {
                    window.sample.tokens = window.sample.tokens.saturating_add(tokens);
                }
            }
        }
    }
    if seen.is_empty() {
        Vec::new()
    } else {
        windows.into_iter().map(|window| window.sample).collect()
    }
}

pub(crate) fn samples(
    profile: &str,
    quota: &crate::quota::QuotaSet,
    now: DateTime<Utc>,
) -> Vec<Sample> {
    let Some((user, account)) = crate::profiles::device_token_identity(profile) else {
        return Vec::new();
    };
    aggregate(
        &crate::paths::codex_home(),
        &user,
        &account,
        windows(quota, now),
        now,
    )
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;

    #[test]
    fn matches_identity_and_counts_only_new_tokens_inside_the_window() {
        let header = json!({"type":"session_meta","payload":{"id":"thread","source":"vscode",
            "account_scoped":true,"creator_account_id":"workspace","creator_user_id":"user","model_provider":"openai"}});
        let row = |minute: u8, total: u64| {
            json!({"type":"event_msg","timestamp":format!("2026-11-15T12:{minute:02}:00Z"),
            "payload":{"type":"token_count","info":{"total_token_usage":{"total_tokens":total}}}})
        };
        let data = format!(
            "{header}\n{}\n{}\n{}\n{}\n",
            row(1, 300),
            row(3, 450),
            row(4, 450),
            row(7, 600)
        );
        let first = "2026-11-15T12:02:00Z"
            .parse::<DateTime<Utc>>()
            .unwrap()
            .timestamp_millis();
        let windows = [Window {
            start: first,
            sample: Sample {
                window: "Weekly".into(),
                resets_at: first + 240000,
                tokens: 0,
            },
        }];
        assert!(count(
            data.as_bytes(),
            "other-user",
            "workspace",
            &windows,
            first + 600000
        )
        .is_none());
        assert!(count(
            data.as_bytes(),
            "user",
            "other-workspace",
            &windows,
            first + 600000
        )
        .is_none());
        assert_eq!(
            count(
                data.as_bytes(),
                "user",
                "workspace",
                &windows,
                first + 600000
            )
            .unwrap()
            .1,
            vec![150]
        );
    }
}
