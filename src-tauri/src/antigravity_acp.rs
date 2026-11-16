//! Google-owned OAuth through a pinned official ACP runtime. No prompts or tools run.
//! Profiles, working directories and temporary files belong to the enrollment draft.
use crate::{account_login::Progress, paths, profiles::{private_dir, write_private}};
use serde_json::{json, Value};
use sha2::{Digest, Sha256};
use std::{
    fs::{self, File, OpenOptions},
    io::{BufRead, BufReader, Read, Write},
    path::{Path, PathBuf},
    process::{Child, Command, Stdio},
    sync::{atomic::{AtomicBool, Ordering}, mpsc, Arc, LazyLock, Mutex},
    time::{Duration, Instant},
};

const VERSION: &str = "1.4.5";
const AUTH_MARKER: &str = "__ORBILAP_ANTIGRAVITY_AUTH_URL__";
const AUTH_PREFIX: &str = "Open the following link to authenticate the ACP server: ";
const MAX_LINE: usize = 1024 * 1024;
static INSTALL: LazyLock<Mutex<()>> = LazyLock::new(|| Mutex::new(()));

struct Asset {
    platform: &'static str,
    archive_hash: &'static str,
    archive_bytes: u64,
    executable_hash: &'static str,
    harness_hash: &'static str,
}
fn asset(arch: &str) -> Result<Asset, String> {
    // Google's 1.4.5 archives, cross-checked against the ACP registry/T3 release manifest.
    match arch {
        "aarch64" => Ok(Asset { platform: "darwin-arm64", archive_bytes: 97_923_855,
            archive_hash: "886fff7767d08994ca39eb02c3d01a7532c7325a94aa33aaf52d52068733284f",
            executable_hash: "fb2581fb49738263db15ffccf3f48d979794ffb748350e85c335953f6b6522a2",
            harness_hash: "9d87cb505e6efa316f55bb98459de614de867dce43cdeb5677b2153d77c283e8" }),
        "x86_64" => Ok(Asset { platform: "darwin-x86_64", archive_bytes: 103_577_295,
            archive_hash: "b39f3573c03b9acb9df028853f647527f1f3133f32bd77e78b796e48a205114a",
            executable_hash: "90c43d0631538188f371ff7db58947a3834486f0788c6eaca10259a7826c5803",
            harness_hash: "ca25abb645c04474908b7194188c909f94ba57af2ce666b30307ce20ee86fca0" }),
        _ => Err("Google Antigravity sign-in requires a supported macOS architecture.".into()),
    }
}
fn cancelled(cancel: &AtomicBool) -> Result<(), String> {
    if cancel.load(Ordering::SeqCst) { Err("Sign-in cancelled.".into()) } else { Ok(()) }
}
fn hash_file(path: &Path) -> Result<String, String> {
    let metadata = fs::symlink_metadata(path).map_err(|_| "Google runtime is missing.")?;
    if !metadata.is_file() || metadata.len() > 200 * 1024 * 1024 { return Err("Invalid Google runtime file.".into()); }
    let mut file = File::open(path).map_err(|_| "Cannot verify Google runtime.")?;
    let mut hash = Sha256::new();
    let mut buffer = [0; 64 * 1024];
    loop {
        let size = file.read(&mut buffer).map_err(|_| "Cannot verify Google runtime.")?;
        if size == 0 { break; }
        hash.update(&buffer[..size]);
    }
    Ok(format!("{:x}", hash.finalize()))
}
fn verify_runtime(root: &Path, release: &Asset) -> Result<(), String> {
    if fs::symlink_metadata(root).map_err(|_| "Google runtime is missing.")?.file_type().is_symlink()
        || hash_file(&root.join("agy_acp_server.par"))? != release.executable_hash
        || hash_file(&root.join("localharness_external"))? != release.harness_hash {
        return Err("Google runtime verification failed. Retry sign-in to reinstall it.".into());
    }
    Ok(())
}
fn grouped(command: &mut Command) {
    #[cfg(unix)] {
        use std::os::unix::process::CommandExt;
        command.process_group(0);
    }
}
fn terminate(child: &mut Child) {
    #[cfg(unix)] unsafe { libc::kill(-(child.id() as i32), libc::SIGKILL); }
    let _ = child.kill();
    let _ = child.wait();
}
fn run_bounded(command: &mut Command, cancel: &AtomicBool, timeout: Duration) -> Result<(), String> {
    grouped(command);
    let mut child = command.stdin(Stdio::null()).stdout(Stdio::null()).stderr(Stdio::null()).spawn()
        .map_err(|_| "Cannot start Google's runtime installer.")?;
    let deadline = Instant::now() + timeout;
    let result = loop {
        if cancel.load(Ordering::SeqCst) { break Err("Sign-in cancelled.".into()); }
        if Instant::now() >= deadline { break Err("Google runtime installation timed out. Check your connection and retry.".into()); }
        match child.try_wait() {
            Ok(Some(status)) => break if status.success() { Ok(()) } else { Err("Cannot install Google's runtime. Check your connection and retry.".into()) },
            Err(_) => break Err("Cannot check Google's runtime installer.".into()),
            _ => std::thread::sleep(Duration::from_millis(40)),
        }
    };
    terminate(&mut child);
    result
}
struct Temporary(PathBuf);
impl Drop for Temporary { fn drop(&mut self) { let _ = fs::remove_dir_all(&self.0); } }

/// Install only Google's fixed HTTPS asset, verifying the archive and both executables.
fn ensure_runtime(cancel: &AtomicBool) -> Result<PathBuf, String> {
    if !cfg!(target_os = "macos") { return Err("Official Antigravity sign-in is currently supported on macOS.".into()); }
    let release = asset(std::env::consts::ARCH)?;
    let _lock = loop {
        cancelled(cancel)?;
        match INSTALL.try_lock() {
            Ok(lock) => break lock,
            Err(std::sync::TryLockError::WouldBlock) => std::thread::sleep(Duration::from_millis(40)),
            Err(_) => return Err("Google runtime installer is unavailable. Restart Orbilap.".into()),
        }
    };
    let parent = paths::app_data_dir().join("orbilap-tools/antigravity-acp");
    private_dir(&parent)?;
    let root = parent.join(format!("{VERSION}-{}", release.platform));
    if verify_runtime(&root, &release).is_ok() { return Ok(root); }
    let stage = Temporary(parent.join(format!(".install-{}", uuid::Uuid::new_v4())));
    private_dir(&stage.0)?;
    let archive = stage.0.join("runtime.zip");
    let url = format!("https://dl.google.com/agy-extensions/releases/macos/agy-acp-server-{VERSION}-{}.zip", release.platform);
    run_bounded(Command::new("/usr/bin/curl").args(["--fail", "--silent", "--show-error", "--proto", "=https", "--max-time", "180", "--connect-timeout", "15", "--max-filesize", "110000000", "--output"]).arg(&archive).arg(url), cancel, Duration::from_secs(185))?;
    if fs::metadata(&archive).map_err(|_| "Google runtime download is missing.")?.len() != release.archive_bytes
        || hash_file(&archive)? != release.archive_hash { return Err("Google runtime download failed its integrity check. Retry sign-in.".into()); }
    let extracted = stage.0.join("runtime");
    private_dir(&extracted)?;
    run_bounded(Command::new("/usr/bin/ditto").args(["-x", "-k"]).arg(&archive).arg(&extracted), cancel, Duration::from_secs(30))?;
    verify_runtime(&extracted, &release)?;
    cancelled(cancel)?;
    #[cfg(unix)] {
        use std::os::unix::fs::PermissionsExt;
        for name in ["agy_acp_server.par", "localharness_external"] {
            fs::set_permissions(extracted.join(name), fs::Permissions::from_mode(0o700)).map_err(|_| "Cannot prepare Google runtime.")?;
        }
    }
    if root.exists() { fs::remove_dir_all(&root).map_err(|_| "Cannot replace Google runtime.")?; }
    fs::rename(&extracted, &root).map_err(|_| "Cannot install Google runtime.")?;
    Ok(root)
}

/// Only Google's code-flow URL with a loopback callback may cross IPC or open a browser.
fn authorization_url(text: &str) -> Result<String, String> {
    let invalid = || "Google's agent returned an invalid sign-in link.".to_owned();
    if text.len() > 16_384 || text.chars().any(char::is_whitespace) { return Err(invalid()); }
    let mut url = reqwest::Url::parse(text).map_err(|_| invalid())?;
    let values = |key: &str| url.query_pairs().filter(|(k, _)| k == key).map(|(_, v)| v.into_owned()).collect::<Vec<_>>();
    let state = values("state"); let redirect = values("redirect_uri");
    if url.origin().ascii_serialization() != "https://accounts.google.com" || url.path() != "/o/oauth2/v2/auth"
        || !url.username().is_empty() || url.password().is_some() || url.fragment().is_some()
        || values("response_type") != ["code"] || state.len() != 1 || state[0].is_empty() || state[0].len() > 512
        || state[0].chars().any(char::is_whitespace) || redirect.len() != 1 { return Err(invalid()); }
    let callback = reqwest::Url::parse(&redirect[0]).map_err(|_| invalid())?;
    if callback.scheme() != "http" || callback.host_str() != Some("127.0.0.1") || callback.port().unwrap_or(0) < 1024
        || callback.path() != "/" || callback.query().is_some() || callback.fragment().is_some()
        || !callback.username().is_empty() || callback.password().is_some() { return Err(invalid()); }
    // Ask for profile metadata on the Google consent screen while preserving
    // the agent-owned state, PKCE challenge, callback and existing permissions.
    let mut scopes = values("scope");
    if scopes.len() > 1 { return Err(invalid()); }
    let existing = scopes.pop().unwrap_or_default();
    let mut scopes: Vec<_> = existing.split_ascii_whitespace().collect();
    if !scopes.iter().any(|scope| matches!(*scope, "profile" | "https://www.googleapis.com/auth/userinfo.profile")) {
        scopes.push("profile");
    }
    let parameters: Vec<_> = url.query_pairs().filter(|(key, _)| key != "prompt" && key != "scope").map(|(k, v)| (k.into_owned(), v.into_owned())).collect();
    url.set_query(None);
    url.query_pairs_mut().extend_pairs(parameters)
        .append_pair("scope", &scopes.join(" "))
        .append_pair("prompt", "select_account consent");
    Ok(url.into())
}

fn spawn_agent(home: &Path, runtime: &Path) -> Result<Child, String> {
    let acp = home.join("antigravity-acp");
    for path in [home.to_path_buf(), acp.clone(), home.join("tmp"), home.join("work")] { private_dir(&path)?; }
    write_private(&acp.join("settings.json"), &json!({"auth":{"type":"oauth-personal"}}))?;
    let helper = home.join("browser-helper");
    let mut options = OpenOptions::new(); options.write(true).create_new(true);
    #[cfg(unix)] { use std::os::unix::fs::OpenOptionsExt; options.mode(0o700); }
    let mut file = options.open(&helper).map_err(|_| "Cannot prepare Google's sign-in browser.")?;
    // URL is data passed as one argument. Never evaluate it as shell code.
    file.write_all(format!("#!/bin/sh\nprintf '%s%s\\n' '{AUTH_MARKER}' \"$1\" >&2\n").as_bytes()).map_err(|_| "Cannot prepare Google's sign-in browser.")?;
    let helper_text = helper.to_str().ok_or("Unsupported Google profile path.")?;
    if helper_text.contains([':', '\n', '\r', '\0']) { return Err("Unsupported Google profile path.".into()); }
    let browser = format!("'{}' %s", helper_text.replace('\'', "'\"'\"'"));
    let mut command = Command::new(runtime.join("agy_acp_server.par"));
    command.env_clear();
    // Preserve networking configuration, never ambient provider keys or Google credentials.
    for key in ["HOME", "PATH", "LANG", "LC_ALL", "HTTPS_PROXY", "HTTP_PROXY", "ALL_PROXY", "NO_PROXY", "https_proxy", "http_proxy", "all_proxy", "no_proxy", "SSL_CERT_FILE", "SSL_CERT_DIR"] {
        if let Some(value) = std::env::var_os(key) { command.env(key, value); }
    }
    command.env("GEMINI_HOME", home).env("AGY_ACP_FORCE_FILE_STORAGE", "1")
        .env("BROWSER", browser).env("PYTHONUNBUFFERED", "1")
        .env("ANTIGRAVITY_HARNESS_PATH", runtime.join("localharness_external"))
        .env("TMPDIR", home.join("tmp")).current_dir(home.join("work"))
        .stdin(Stdio::piped()).stdout(Stdio::piped()).stderr(Stdio::piped());
    grouped(&mut command);
    command.spawn().map_err(|_| "Cannot start Google's Antigravity agent.".into())
}

fn pump<R: Read + Send + 'static>(reader: R, sender: mpsc::SyncSender<Result<String, ()>>) -> std::thread::JoinHandle<()> {
    std::thread::spawn(move || {
        let mut reader = BufReader::new(reader);
        loop {
            let mut line = Vec::new();
            let read = reader.by_ref().take((MAX_LINE + 1) as u64).read_until(b'\n', &mut line);
            if !matches!(read, Ok(n) if n > 0) { break; }
            if line.len() > MAX_LINE { let _ = sender.send(Err(())); break; }
            if sender.send(String::from_utf8(line).map_err(|_| ())).is_err() { break; }
        }
    })
}
fn send(child: &mut Child, id: u64, method: &str, params: Value) -> Result<(), String> {
    let input = child.stdin.as_mut().ok_or("Google agent input is closed.")?;
    writeln!(input, "{}", json!({"jsonrpc":"2.0","id":id,"method":method,"params":params}))
        .and_then(|()| input.flush()).map_err(|_| "Cannot contact Google's Antigravity agent.".into())
}
fn rpc_result(message: &Value, id: u64) -> Result<Option<&Value>, String> {
    if message["id"].as_u64() != Some(id) || message.get("method").is_some() { return Ok(None); }
    // Never echo agent/Google errors: they can contain account data or tokens.
    if message.get("error").is_some() { return Err("Google's agent could not verify access. Check your Google subscription and retry sign-in.".into()); }
    message.get("result").map(Some).ok_or("Google's agent returned an invalid response.".into())
}
fn drive(child: &mut Child, home: &Path, cancel: &AtomicBool, progress: &Mutex<Progress>) -> Result<(), String> {
    let (sender, receiver) = mpsc::sync_channel(32);
    let stdout = pump(child.stdout.take().ok_or("Google agent output is closed.")?, sender.clone());
    let stderr = pump(child.stderr.take().ok_or("Google agent output is closed.")?, sender);
    let result = (|| {
        send(child, 1, "initialize", json!({"protocolVersion":1,"clientInfo":{"name":"orbilap","version":env!("CARGO_PKG_VERSION")},"clientCapabilities":{}}))?;
        let mut expected = 1;
        let deadline = Instant::now() + Duration::from_secs(600);
        loop {
            cancelled(cancel)?;
            if Instant::now() >= deadline { return Err("Google sign-in timed out. Try again.".into()); }
            let line = match receiver.recv_timeout(Duration::from_millis(40)) {
                Ok(Ok(line)) => line,
                Ok(Err(())) => return Err("Google's agent returned an oversized or invalid response.".into()),
                Err(mpsc::RecvTimeoutError::Timeout) => {
                    if child.try_wait().map_err(|_| "Cannot check Google agent.")?.is_some() { return Err("Google's agent stopped before verification. Retry sign-in.".into()); }
                    continue;
                }
                Err(_) => return Err("Google's agent disconnected. Retry sign-in.".into()),
            };
            let line = line.trim();
            if let Some(url) = line.strip_prefix(AUTH_MARKER).or_else(|| line.strip_prefix(AUTH_PREFIX)) {
                let url = authorization_url(url)?;
                let mut state = progress.lock().map_err(|_| "Cannot update Google sign-in.")?;
                if state.auth_url.as_ref().is_some_and(|old| old != &url) { return Err("Google's agent started more than one sign-in. Retry.".into()); }
                state.auth_url = Some(url);
                continue;
            }
            let Ok(message) = serde_json::from_str::<Value>(line) else { continue; };
            // This is an authentication-only client: no file, terminal or permission capabilities.
            if message.get("method").is_some() && message.get("id").is_some() {
                let input = child.stdin.as_mut().ok_or("Google agent input is closed.")?;
                writeln!(input, "{}", json!({"jsonrpc":"2.0","id":message["id"],"error":{"code":-32601,"message":"Authentication-only client"}})).map_err(|_| "Cannot respond to Google agent.")?;
                continue;
            }
            let Some(response) = rpc_result(&message, expected)? else { continue; };
            if expected == 2 {
                progress.lock().map_err(|_| "Cannot update Google sign-in.")?.auth_url = None;
                // Enrollment verifies identity, paid plan and live quota after OAuth.
                return stage_acp_login(home);
            }
            if response["agentInfo"]["name"] != "antigravity-acp" || response["agentInfo"]["version"] != VERSION
                || !matches!(response["protocolVersion"].as_u64(), Some(1 | 2))
                || !response["authMethods"].as_array().is_some_and(|methods| methods.iter().any(|m| m["id"] == "oauth-personal")) {
                return Err("Google runtime identity could not be verified.".into());
            }
            send(child, 2, "authenticate", json!({"methodId":"oauth-personal"}))?;
            expected = 2;
        }
    })();
    terminate(child);
    // Dropping the receiver releases readers blocked by a noisy/full output queue.
    drop(receiver);
    let _ = stdout.join(); let _ = stderr.join();
    result
}
fn stage_credentials(home: &Path, token: &Value) -> Result<(), String> {
    for key in ["client_id", "client_secret", "refresh_token"] {
        if !token[key].as_str().is_some_and(|s| !s.trim().is_empty()) { return Err("Google did not return complete account credentials.".into()); }
    }
    write_private(&home.join("auth.json"), token)
}

pub struct Login {
    cancel: Arc<AtomicBool>,
    resumed_saved: Arc<AtomicBool>,
    progress: Arc<Mutex<Progress>>,
    worker: Option<std::thread::JoinHandle<()>>,
}
impl Login {
    /// Downloads/verifies the official runtime off the IPC thread, then starts isolated OAuth.
    pub fn start(home: &Path, resume_saved: bool) -> Result<Self, String> {
        private_dir(home)?;
        let cancel = Arc::new(AtomicBool::new(false));
        let resumed_saved = Arc::new(AtomicBool::new(false));
        let resumed = resumed_saved.clone();
        let progress = Arc::new(Mutex::new(Progress { status: "pending".into(), ..Default::default() }));
        let stopped = cancel.clone(); let output = progress.clone(); let home = home.to_path_buf();
        let worker = std::thread::spawn(move || {
            let result = (|| {
                if resume_saved && crate::antigravity::resume_login(&home)? {
                    // Saved OAuth is checked by enrollment's live identity/plan/quota probes.
                    // Recreating an ACP session adds model loading but no additional identity proof.
                    stage_acp_login(&home)?;
                    resumed.store(true, Ordering::Relaxed);
                    return Ok(());
                }
                let runtime = ensure_runtime(&stopped)?;
                cancelled(&stopped)?;
                let mut child = spawn_agent(&home, &runtime)?;
                drive(&mut child, &home, &stopped, &output)
            })();
            if let Ok(mut state) = output.lock() {
                state.status = if result.is_ok() { "completed" } else { "failed" }.into();
                state.auth_url = None;
                state.error = result.err();
            }
        });
        Ok(Self { cancel, resumed_saved, progress, worker: Some(worker) })
    }
    pub fn resumed_saved(&self) -> bool {
        self.resumed_saved.load(Ordering::Relaxed)
    }
    pub fn poll(&mut self) -> Progress { self.progress.lock().map(|state| state.clone()).unwrap_or_default() }
    pub fn stop(&mut self) {
        self.cancel.store(true, Ordering::SeqCst);
        if let Some(worker) = self.worker.take() { let _ = worker.join(); }
    }
}
impl Drop for Login { fn drop(&mut self) { self.stop(); } }

fn stage_acp_login(home: &Path) -> Result<(), String> {
    let path = home.join("antigravity-acp/acp_token.json");
    let metadata = fs::symlink_metadata(&path).map_err(|_| "Cannot read saved Google sign-in.")?;
    if !metadata.is_file() || metadata.len() > 256 * 1024 { return Err("Invalid saved Google sign-in. Reconnect the account.".into()); }
    #[cfg(unix)]
    {
        use std::os::unix::fs::PermissionsExt;
        fs::set_permissions(&path, fs::Permissions::from_mode(0o600))
            .map_err(|_| "Cannot protect Google credentials.")?;
    }
    let token: Value = serde_json::from_slice(&fs::read(path).map_err(|_| "Cannot read saved Google sign-in.")?)
        .map_err(|_| "Invalid saved Google sign-in.")?;
    stage_credentials(home, &token)
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn google_links_reject_spoofing_and_unsafe_callbacks() {
        let link = "https://accounts.google.com/o/oauth2/v2/auth?response_type=code&state=random&redirect_uri=http%3A%2F%2F127.0.0.1%3A54321%2F";
        assert!(authorization_url(link).is_ok());
        let chosen = reqwest::Url::parse(&authorization_url(&format!("{link}&prompt=consent&code_challenge=synthetic-challenge&scope=openid+email")).unwrap()).unwrap();
        let pairs: std::collections::HashMap<_, _> = chosen.query_pairs().into_owned().collect();
        assert_eq!(pairs["prompt"], "select_account consent");
        assert_eq!(pairs["state"], "random");
        assert_eq!(pairs["scope"], "openid email profile");
        let original_scope = "openid email https://www.googleapis.com/auth/userinfo.profile";
        let with_profile = format!("{link}&scope={}", original_scope.replace(' ', "+"));
        let unchanged = reqwest::Url::parse(&authorization_url(&with_profile).unwrap()).unwrap();
        assert!(unchanged.query_pairs().any(|(key, value)| key == "scope" && value == original_scope));
        assert!(authorization_url(&format!("{link}&scope=openid&scope=email")).is_err());
        assert_eq!(pairs["code_challenge"], "synthetic-challenge");
        assert_eq!(pairs["redirect_uri"], "http://127.0.0.1:54321/");
        for hostile in [link.replace("accounts.google.com", "accounts.google.com.evil.test"), link.replace("54321", "80"), link.replace("127.0.0.1", "example.com"), format!("{link}&state=other"), format!("{link}#fragment"), link.replace("random", "a%20b")] {
            assert!(authorization_url(&hostile).is_err(), "{hostile}");
        }
    }
    #[test]
    fn incomplete_credentials_and_protocol_errors_fail_without_secrets() {
        let home = std::env::temp_dir().join(format!("orbilap-acp-test-{}", uuid::Uuid::new_v4()));
        assert!(stage_credentials(&home, &json!({"refresh_token":"synthetic"})).is_err());
        assert!(!home.exists());
        let error = rpc_result(&json!({"id":2,"error":{"message":"sensitive token"}}), 2).unwrap_err();
        assert!(!error.contains("sensitive"));
        assert!(rpc_result(&json!({"id":4,"result":{}}), 2).unwrap().is_none());
        assert!(asset("unknown").is_err());
    }
    #[test]
    fn saved_login_stages_for_live_enrollment_without_an_agent_process() {
        let dir = Temporary(std::env::temp_dir().join(format!("orbilap-acp-cached-{}", uuid::Uuid::new_v4())));
        private_dir(&dir.0.join("antigravity-acp")).unwrap();
        write_private(&dir.0.join("antigravity-acp/acp_token.json"), &json!({"client_id":"synthetic-client","client_secret":"synthetic-secret","refresh_token":"synthetic-refresh"})).unwrap();
        stage_acp_login(&dir.0).unwrap();
        assert!(dir.0.join("auth.json").is_file());
        assert!(!dir.0.join("work").exists(), "saved-login enrollment must not start the agent");
        assert!(!dir.0.join("browser-helper").exists());
    }
    #[test]
    fn tampered_runtime_is_rejected() {
        let dir = std::env::temp_dir().join(format!("orbilap-acp-tamper-{}", uuid::Uuid::new_v4()));
        private_dir(&dir).unwrap();
        fs::write(dir.join("agy_acp_server.par"), b"tampered").unwrap();
        fs::write(dir.join("localharness_external"), b"tampered").unwrap();
        assert!(verify_runtime(&dir, &asset("aarch64").unwrap()).is_err());
        fs::remove_dir_all(dir).unwrap();
    }
    #[cfg(unix)]
    fn fixture(script: &str) -> Temporary {
        use std::os::unix::fs::PermissionsExt;
        let dir = Temporary(std::env::temp_dir().join(format!("orbilap-acp-fixture-{}", uuid::Uuid::new_v4())));
        private_dir(&dir.0).unwrap();
        let runtime = dir.0.join("runtime"); private_dir(&runtime).unwrap();
        let binary = runtime.join("agy_acp_server.par");
        fs::write(&binary, script).unwrap();
        fs::set_permissions(binary, fs::Permissions::from_mode(0o700)).unwrap();
        dir
    }
    #[test]
    #[cfg(unix)]
    fn official_protocol_stages_after_oauth_without_starting_an_agent_session() {
        let dir = fixture(r##"#!/bin/sh
read -r init
printf '%s\n' '{"jsonrpc":"2.0","id":1,"result":{"protocolVersion":1,"agentInfo":{"name":"antigravity-acp","version":"1.4.5"},"authMethods":[{"id":"oauth-personal"}]}}'
read -r auth
printf '%s\n' "$init" "$auth" > "$GEMINI_HOME/requests.jsonl"
printf '%s' '{"client_id":"synthetic-client","client_secret":"synthetic-value","refresh_token":"synthetic-refresh"}' > "$GEMINI_HOME/antigravity-acp/acp_token.json"
printf '%s\n' '{"jsonrpc":"2.0","id":2,"result":{}}'
if read -r session; then
    printf '%s\n' '{"jsonrpc":"2.0","id":3,"error":{"code":-32603,"message":"Synthetic session failure"}}'
fi
"##);
        let home = dir.0.join("profile with spaces");
        let mut child = spawn_agent(&home, &dir.0.join("runtime")).unwrap();
        drive(&mut child, &home, &AtomicBool::new(false), &Mutex::new(Progress::default())).unwrap();
        assert!(home.join("auth.json").is_file());
        let requests: Vec<Value> = fs::read_to_string(home.join("requests.jsonl")).unwrap().lines().map(|line| serde_json::from_str(line).unwrap()).collect();
        assert_eq!(requests.iter().map(|r| r["method"].as_str().unwrap()).collect::<Vec<_>>(), ["initialize", "authenticate"]);
        assert_eq!(requests[1]["params"]["methodId"], "oauth-personal");
        use std::os::unix::fs::PermissionsExt;
        assert_eq!(fs::metadata(home.join("auth.json")).unwrap().permissions().mode() & 0o777, 0o600);
    }
    #[test]
    #[cfg(unix)]
    fn cancellation_kills_agent_and_children_without_saving_credentials() {
        let dir = fixture("#!/bin/sh\nsleep 30\n");
        let home = dir.0.join("profile");
        let mut child = spawn_agent(&home, &dir.0.join("runtime")).unwrap();
        let cancel = AtomicBool::new(false);
        let started = Instant::now();
        std::thread::scope(|scope| {
            scope.spawn(|| { std::thread::sleep(Duration::from_millis(100)); cancel.store(true, Ordering::SeqCst); });
            assert!(drive(&mut child, &home, &cancel, &Mutex::new(Progress::default())).unwrap_err().contains("cancelled"));
        });
        assert!(started.elapsed() < Duration::from_secs(2));
        assert!(!home.join("auth.json").exists());
    }
    #[test]
    #[cfg(unix)]
    fn browser_helper_quotes_urls_and_keeps_them_as_data() {
        let dir = fixture("#!/bin/sh\nexit 0\n");
        let home = dir.0.join("profile's space");
        let mut child = spawn_agent(&home, &dir.0.join("runtime")).unwrap(); terminate(&mut child);
        let text = "https://accounts.google.com/?x=$(touch bad)&y=`echo bad`";
        let output = Command::new(home.join("browser-helper")).arg(text).output().unwrap();
        assert_eq!(String::from_utf8(output.stderr).unwrap(), format!("{AUTH_MARKER}{text}\n"));
        assert!(!home.join("bad").exists());
    }
    #[test]
    #[ignore = "Opt-in: downloads Google's verified runtime and may require Google browser sign-in"]
    fn live_official_google_sign_in() {
        let home = Temporary(std::env::temp_dir().join(format!("orbilap-acp-live-{}", uuid::Uuid::new_v4())));
        private_dir(&home.0).unwrap();
        // An explicitly selected, existing Orbilap profile can exercise saved-login reuse.
        if let Ok(source) = std::env::var("ORBILAP_ACP_TEST_PROFILE") {
            let value: Value = serde_json::from_slice(&fs::read(Path::new(&source).join("auth.json")).unwrap()).unwrap();
            let acp = home.0.join("antigravity-acp"); private_dir(&acp).unwrap();
            write_private(&acp.join("acp_token.json"), &value).unwrap();
        }
        let mut login = Login::start(&home.0, false).unwrap();
        let deadline = Instant::now() + Duration::from_secs(780);
        loop {
            let progress = login.poll();
            if let Some(url) = progress.auth_url {
                // Local browser handoff only. No credentials or callback codes go to logs.
                if let Ok(path) = std::env::var("ORBILAP_ACP_TEST_AUTH_URL_FILE") { fs::write(path, url).unwrap(); }
            }
            if progress.status != "pending" {
                assert_eq!(progress.status, "completed", "{}", progress.error.unwrap_or_default());
                break;
            }
            assert!(Instant::now() < deadline, "Official Google sign-in did not finish");
            std::thread::sleep(Duration::from_millis(100));
        }
        login.stop();
        let (_, _, subscription) = crate::antigravity::inspect(&home.0).unwrap();
        let quota = crate::antigravity::quota_in(&home.0).unwrap();
        println!("Official ACP verified: plan={:?}, windows={}", subscription.plan, quota.windows.unwrap().len());
        // Reuse exactly the saved credential format, in a fresh disposable profile.
        let resumed = Temporary(std::env::temp_dir().join(format!("orbilap-acp-resume-{}", uuid::Uuid::new_v4())));
        let target = resumed.0.join("antigravity-acp"); private_dir(&target).unwrap();
        let token: Value = serde_json::from_slice(&fs::read(home.0.join("auth.json")).unwrap()).unwrap();
        write_private(&target.join("acp_token.json"), &token).unwrap();
        let mut again = Login::start(&resumed.0, false).unwrap();
        let deadline = Instant::now() + Duration::from_secs(180);
        loop {
            let state = again.poll();
            assert!(state.auth_url.is_none(), "Saved-login reuse unexpectedly requested browser sign-in");
            if state.status != "pending" { assert_eq!(state.status, "completed", "{}", state.error.unwrap_or_default()); break; }
            assert!(Instant::now() < deadline, "Saved-login reuse timed out");
            std::thread::sleep(Duration::from_millis(100));
        }
        again.stop();
        println!("Official ACP saved-login reuse verified without browser sign-in");
    }
}
