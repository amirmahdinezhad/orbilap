//! Bounded, cancellable CLI-owned sign-in. Only approved login URLs/codes cross IPC.
use serde::Serialize;
use std::{
    io::{Read, Write},
    path::Path,
    process::{Child, Command, Stdio},
    sync::{Arc, Mutex},
    time::{Duration, Instant},
};

#[derive(Clone, Default, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Progress {
    pub status: String,
    pub auth_url: Option<String>,
    pub user_code: Option<String>,
    pub error: Option<String>,
}
pub struct Login {
    child: Child,
    output: Arc<Mutex<String>>,
    started: Instant,
    provider: String,
    sent_enter: bool,
    browser: Option<BrowserLogin>,
}

#[derive(Default)]
struct BrowserLogin {
    read_until: usize,
    initialized: bool,
    requested: bool,
    login_id: Option<String>,
    auth_url: Option<String>,
    completed: Option<bool>,
}

impl BrowserLogin {
    fn read(&mut self, text: &str) -> Progress {
        let remaining = &text[self.read_until..];
        for line in remaining.split_inclusive('\n') {
            if !line.ends_with('\n') { break; }
            self.read_until += line.len();
            let Ok(message) = serde_json::from_str::<serde_json::Value>(line) else { continue };
            match message["id"].as_u64() {
                Some(1) if message.get("result").is_some() => self.initialized = true,
                Some(1 | 2) if message.get("error").is_some() => self.completed = Some(false),
                Some(2) => {
                    let result = &message["result"];
                    if let (Some(id), Some(url)) = (result["loginId"].as_str(), result["authUrl"].as_str()) {
                        if result["type"] == "chatgpt" && !id.is_empty() && id.len() <= 128 && allowed_login_url(url, "codex") {
                            self.login_id = Some(id.into());
                            self.auth_url = Some(url.into());
                        } else { self.completed = Some(false); }
                    } else { self.completed = Some(false); }
                }
                _ if message["method"] == "account/login/completed" => {
                    let params = &message["params"];
                    if self.login_id.is_some() && params["loginId"].as_str() == self.login_id.as_deref() {
                        self.completed = Some(params["success"].as_bool() == Some(true));
                    }
                }
                _ => {}
            }
        }
        self.progress()
    }

    fn progress(&self) -> Progress {
        Progress {
            status: match self.completed { Some(true) => "completed", Some(false) => "failed", None => "pending" }.into(),
            auth_url: self.auth_url.clone(),
            error: (self.completed == Some(false)).then(|| "Browser sign-in did not complete. Retry with an up-to-date Codex CLI.".into()),
            ..Default::default()
        }
    }
}

/// Use a real PTY for Claude's interactive login; Codex's login supports pipes.
pub fn command(binary: &Path, provider: &str, method: &str, home: &Path) -> Command {
    let mut command = if provider == "claude" {
        let mut c = Command::new("/usr/bin/script");
        c.args(["-q", "/dev/null"])
            .arg(binary)
            .args(["auth", "login", "--claudeai"]);
        c.env("CLAUDE_CONFIG_DIR", home)
            .env("CLAUDE_SECURESTORAGE_CONFIG_DIR", home);
        c
    } else {
        let mut c = Command::new(binary);
        c.args(["-c", "cli_auth_credentials_store=\"file\"", "login"]);
        if method == "device" {
            c.arg("--device-auth");
        }
        c.env("CODEX_HOME", home);
        c
    };
    isolate_auth_environment(&mut command);
    command
        .current_dir(home)
        .env("NO_COLOR", "1")
        .env("TERM", "xterm-256color")
        .stdin(Stdio::piped())
        .stdout(Stdio::piped())
        .stderr(Stdio::piped());
    #[cfg(unix)]
    {
        use std::os::unix::process::CommandExt;
        command.process_group(0);
    }
    command
}

pub(crate) fn isolate_auth_environment(command: &mut Command) {
    for key in ["CLAUDE_CODE_OAUTH_TOKEN", "CODEX_ACCESS_TOKEN", "OPENAI_API_KEY", "CODEX_API_KEY"] {
        command.env_remove(key);
    }
    for key in std::env::vars_os().map(|(key, _)| key).filter(|key| {
        let key = key.to_string_lossy();
        key.starts_with("ANTHROPIC_")
            || key.starts_with("CLAUDE_CODE_USE_")
            || matches!(
                key.as_ref(),
                "CLAUDE_CODE_OAUTH_TOKEN"
                    | "CODEX_ACCESS_TOKEN"
                    | "OPENAI_API_KEY"
                    | "CODEX_API_KEY"
            )
    }) {
        command.env_remove(key);
    }
}
impl Login {
    pub fn start(binary: &Path, provider: &str, method: &str, home: &Path) -> Result<Self, String> {
        // Get a reusable sign-in URL so Orbilap can open or copy the same pending link.
        let browser = provider == "codex" && method == "browser";
        let mut launch = command(binary, provider, method, home);
        if browser {
            // app-server owns PKCE/state/callback; Orbilap opens the URL in the default browser.
            launch = Command::new(binary);
            launch.args(["-c", "cli_auth_credentials_store=\"file\"", "app-server"])
                .env("CODEX_HOME", home).current_dir(home)
                .stdin(Stdio::piped()).stdout(Stdio::piped()).stderr(Stdio::null());
            isolate_auth_environment(&mut launch);
            #[cfg(unix)]
            {
                use std::os::unix::process::CommandExt;
                launch.process_group(0);
            }
        }
        let mut child = launch
            .spawn()
            .map_err(|_| "Cannot start sign-in. Check the CLI installation.")?;
        let output = Arc::new(Mutex::new(String::new()));
        fn drain(reader: impl Read + Send + 'static, output: Arc<Mutex<String>>) {
            std::thread::spawn(move || {
                let mut reader = reader.take(256 * 1024);
                let mut bytes = [0u8; 2048];
                while let Ok(count) = reader.read(&mut bytes) {
                    if count == 0 {
                        break;
                    }
                    if let Ok(mut text) = output.lock() {
                        if text.len() < 256 * 1024 {
                            text.push_str(&String::from_utf8_lossy(&bytes[..count]));
                        }
                    }
                }
            });
        }
        if let Some(reader) = child.stdout.take() {
            drain(reader, output.clone());
        }
        if let Some(reader) = child.stderr.take() {
            drain(reader, output.clone());
        }
        let mut login = Self {
            child,
            output,
            started: Instant::now(),
            provider: provider.into(),
            sent_enter: false,
            browser: browser.then(BrowserLogin::default),
        };
        if browser {
            login.send_rpc(serde_json::json!({"id":1,"method":"initialize","params":{"clientInfo":{"name":"orbilap","title":"Orbilap","version":env!("CARGO_PKG_VERSION")}}}))?;
        }
        Ok(login)
    }
    pub fn poll(&mut self) -> Progress {
        let text = self.output.lock().map(|s| s.clone()).unwrap_or_default();
        if self.browser.is_some() {
            return self.poll_browser(&text);
        }
        if !self.sent_enter && text.to_lowercase().contains("press enter to open") {
            if let Some(input) = &mut self.child.stdin {
                let _ = input.write_all(b"\r");
                let _ = input.flush();
            }
            self.sent_enter = true;
        }
        let mut progress = parse_instructions(&text, &self.provider);
        match self.child.try_wait() {
            Ok(Some(exit)) => {
                progress.status = if exit.success() {
                    "completed"
                } else {
                    "failed"
                }
                .into();
                if !exit.success() {
                    progress.error =
                        Some("Sign-in did not complete. Retry or choose another method.".into());
                }
            }
            Ok(None) if self.started.elapsed() < Duration::from_secs(600) => {}
            _ => {
                self.stop();
                progress.status = "failed".into();
                progress.error = Some("Sign-in timed out. Try again when ready.".into());
            }
        }
        progress
    }
    fn send_rpc(&mut self, message: serde_json::Value) -> Result<(), String> {
        let input = self.child.stdin.as_mut().ok_or("The sign-in process is no longer available.")?;
        writeln!(input, "{message}").and_then(|_| input.flush())
            .map_err(|_| "Cannot start browser sign-in. Update Codex CLI and try again.".into())
    }

    fn poll_browser(&mut self, text: &str) -> Progress {
        let browser = self.browser.as_mut().unwrap();
        browser.read(text);
        let request = browser.initialized && !browser.requested && browser.completed.is_none();
        if request { browser.requested = true; }
        if request && (self.send_rpc(serde_json::json!({"method":"initialized"})).is_err()
            || self.send_rpc(serde_json::json!({"id":2,"method":"account/login/start","params":{"type":"chatgpt"}})).is_err()) {
            self.browser.as_mut().unwrap().completed = Some(false);
        }
        let exited = !matches!(self.child.try_wait(), Ok(None));
        let browser = self.browser.as_mut().unwrap();
        if browser.completed.is_none() && (exited || self.started.elapsed() >= Duration::from_secs(600)) {
            browser.completed = Some(false);
        }
        let progress = browser.progress();
        if progress.status != "pending" { self.stop(); }
        progress
    }

    pub fn submit_code(&mut self, code: &str) -> Result<(), String> {
        if code.is_empty() || code.len() > 2048 || code.chars().any(char::is_control) {
            return Err("Enter the authorization code shown by the provider.".into());
        }
        let input = self
            .child
            .stdin
            .as_mut()
            .ok_or("This sign-in no longer accepts a code.")?;
        input
            .write_all(format!("{code}\r").as_bytes())
            .and_then(|_| input.flush())
            .map_err(|_| "Cannot send the code to the CLI.".into())
    }
    pub fn stop(&mut self) {
        if matches!(self.child.try_wait(), Ok(Some(_))) {
            return;
        }
        #[cfg(unix)]
        unsafe {
            libc::kill(-(self.child.id() as i32), libc::SIGTERM);
        }
        let _ = self.child.kill();
        let _ = self.child.wait();
    }
}
impl Drop for Login {
    fn drop(&mut self) {
        self.stop();
    }
}

pub(crate) fn allowed_login_url(raw: &str, provider: &str) -> bool {
    if raw.len() > 16384 || raw.chars().any(char::is_control) || raw.contains('\\') { return false; }
    let Ok(url) = reqwest::Url::parse(raw) else { return false; };
    let allowed = if provider == "codex" {
        matches!(url.host_str(), Some("auth.openai.com" | "auth0.openai.com" | "chatgpt.com"))
    } else {
        matches!(url.host_str(), Some("claude.ai" | "platform.claude.com" | "console.anthropic.com"))
    };
    allowed && url.scheme() == "https" && url.username().is_empty() && url.password().is_none() && url.port_or_known_default() == Some(443)
}

fn parse_instructions(text: &str, provider: &str) -> Progress {
    // Codex emits SGR colors even with piped output. Remove CSI sequences before
    // validating instructions so neither color prefixes nor resets enter IPC.
    let mut plain = String::with_capacity(text.len());
    let mut chars = text.chars().peekable();
    while let Some(ch) = chars.next() {
        if ch == '\u{1b}' && chars.peek() == Some(&'[') {
            chars.next();
            for part in chars.by_ref() {
                if ('\u{40}'..='\u{7e}').contains(&part) { break; }
            }
        } else {
            plain.push(ch);
        }
    }
    let mut progress = Progress {
        status: "pending".into(),
        ..Default::default()
    };
    // Never relay a CLI transcript, stderr, refresh token or arbitrary URL to the webview.
    for token in plain.split(|c: char| c.is_whitespace() || c == '\u{1b}' || c == '"') {
        let candidate = token.trim_matches(|c: char| matches!(c, ')' | ',' | '\'' | '>'));
        if allowed_login_url(candidate, provider) {
            progress.auth_url = Some(candidate.into());
        }
        let code = candidate.trim_matches(|c: char| !c.is_ascii_alphanumeric() && c != '-');
        if provider == "codex"
            && code.split_once('-').is_some_and(|(left, right)|
                (4..=5).contains(&left.len()) && (4..=5).contains(&right.len())
                    && !right.contains('-'))
            && code
                .chars()
                .all(|c| c.is_ascii_uppercase() || c.is_ascii_digit() || c == '-')
        {
            progress.user_code = Some(code.into());
        }
    }
    progress
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn colored_device_instructions_expose_clean_url_and_current_code_formats() {
        for code in ["ABCD-EFGH", "ABCD-EFGH2", "ABCD2-EFGH", "ABCD2-EFGH3"] {
            let text = format!("Open this link:\n   \x1b[94mhttps://auth.openai.com/codex/device\x1b[0m\nEnter this code:\n   \x1b[94m{code}\x1b[0m\n");
            let progress = parse_instructions(&text, "codex");
            assert_eq!(progress.auth_url.as_deref(), Some("https://auth.openai.com/codex/device"));
            assert_eq!(progress.user_code.as_deref(), Some(code));
        }
        for invalid in ["AB-CDEFGH", "ABCD--EFGH", "ABCD-efgh", "ABCDEF-GHIJK"] {
            assert!(parse_instructions(invalid, "codex").user_code.is_none());
        }
        assert!(parse_instructions("\x1b[94mhttps://evil.example/signin\x1b[0m", "codex").auth_url.is_none());
    }
    #[test]
    fn browser_protocol_requires_matching_login_and_only_exposes_an_approved_url() {
        let mut browser = BrowserLogin::default();
        let response = "{\"id\":2,\"result\":{\"type\":\"chatgpt\",\"loginId\":\"ours\",\"authUrl\":\"https://auth.openai.com/authorize?state=synthetic\",\"accessToken\":\"secret-token\"}}\n";
        let partial = &response[..response.len() - 1];
        assert!(browser.read(partial).auth_url.is_none());
        let progress = browser.read(response);
        assert_eq!(progress.auth_url.as_deref(), Some("https://auth.openai.com/authorize?state=synthetic"));
        assert!(!serde_json::to_string(&progress).unwrap().contains("secret-token"));
        let other = format!("{response}{{\"method\":\"account/login/completed\",\"params\":{{\"loginId\":\"other\",\"success\":true}}}}\n");
        assert_eq!(browser.read(&other).status, "pending");
        let ours = format!("{other}{{\"method\":\"account/login/completed\",\"params\":{{\"loginId\":\"ours\",\"success\":true}}}}\n");
        assert_eq!(browser.read(&ours).status, "completed");
        for url in ["https://evil.example/authorize", "https://auth.openai.com:8443/authorize", "http://auth.openai.com/authorize", "https://user@auth.openai.com/authorize"] {
            let mut rejected = BrowserLogin::default();
            let json = serde_json::json!({"id":2,"result":{"type":"chatgpt","loginId":"ours","authUrl":url}}).to_string() + "\n";
            let progress = rejected.read(&json);
            assert_eq!(progress.status, "failed");
            assert!(progress.auth_url.is_none());
        }
        let mut failed = BrowserLogin::default();
        let progress = failed.read("{\"id\":1,\"error\":{\"message\":\"secret-token\"}}\n");
        assert_eq!(progress.status, "failed");
        assert!(!progress.error.unwrap().contains("secret-token"));
    }

    #[cfg(unix)]
    #[test]
    fn browser_login_exposes_the_pending_url_and_keeps_credentials_cli_owned() {
        use std::os::unix::fs::PermissionsExt;
        let home = std::env::temp_dir().join(format!("orbilap-browser-login-{}", uuid::Uuid::new_v4()));
        std::fs::create_dir_all(&home).unwrap();
        let binary = home.join("fake-codex");
        std::fs::write(&binary, r#"#!/bin/sh
printf '%s\n' "$@" > launch.txt
read -r init
printf '%s\n' "$init" > requests.txt
printf '%s\n' '{"id":1,"result":{}}'
read -r initialized
read -r login
printf '%s\n' "$initialized" "$login" >> requests.txt
printf '%s\n' '{"id":2,"result":{"type":"chatgpt","loginId":"ours","authUrl":"https://auth.openai.com/authorize"}}'
read -r finish
printf '%s\n' '{"method":"account/login/completed","params":{"loginId":"ours","success":true}}'
exec sleep 60
"#).unwrap();
        std::fs::set_permissions(&binary, std::fs::Permissions::from_mode(0o700)).unwrap();
        // Exercise the entry point and wait for the URL that Orbilap opens or copies.
        let mut login = Login::start(&binary, "codex", "browser", &home).unwrap();
        let deadline = Instant::now() + Duration::from_secs(3);
        while login.poll().auth_url.is_none() && Instant::now() < deadline { std::thread::sleep(Duration::from_millis(10)); }
        assert_eq!(login.poll().auth_url.as_deref(), Some("https://auth.openai.com/authorize"));
        assert_eq!(std::fs::read_to_string(home.join("launch.txt")).unwrap().lines().last(), Some("app-server"));
        let requests = std::fs::read_to_string(home.join("requests.txt")).unwrap();
        assert!(requests.contains("initialize") && requests.contains("account/login/start"));
        login.child.stdin.as_mut().unwrap().write_all(b"finish\n").unwrap();
        while login.poll().status == "pending" && Instant::now() < deadline { std::thread::sleep(Duration::from_millis(10)); }
        assert_eq!(login.poll().status, "completed");
        assert!(login.child.try_wait().unwrap().is_some());
        drop(login);
        std::fs::remove_dir_all(home).unwrap();
    }
    #[test]
    fn only_provider_login_instructions_are_exposed() {
        let progress = parse_instructions("secret-token https://evil.example/signin https://auth.openai.com/codex/device ABCD-EFGH", "codex");
        let json = serde_json::to_string(&progress).unwrap();
        assert!(!json.contains("secret-token") && !json.contains("evil.example"));
        assert_eq!(progress.user_code.as_deref(), Some("ABCD-EFGH"));
        assert!(
            parse_instructions("https://auth.openai.com/phish", "claude")
                .auth_url
                .is_none()
        );
    }

    #[test]
    fn rejects_login_url_spoofing_and_unexpected_ports() {
        for url in [
            "http://auth.openai.com/authorize",
            "https://auth.openai.com.evil.example/authorize",
            "https://auth.openai.com@evil.example/authorize",
            "https://user:password@auth.openai.com/authorize",
            "https://auth.openai.com:8443/authorize",
            "javascript:alert(1)",
        ] {
            assert!(parse_instructions(url, "codex").auth_url.is_none());
        }
        assert!(parse_instructions("https://auth.openai.com:443/authorize", "codex").auth_url.is_some());
    }

    #[test]
    fn isolated_commands_remove_ambient_account_overrides() {
        let mut command = Command::new("codex");
        for key in ["CLAUDE_CODE_OAUTH_TOKEN", "CODEX_ACCESS_TOKEN", "OPENAI_API_KEY", "CODEX_API_KEY"] {
            command.env(key, "synthetic-key");
        }
        isolate_auth_environment(&mut command);
        assert!(command.get_envs().all(|(_, value)| value.is_none()));
    }
    #[test]
    fn claude_uses_real_pty_and_isolated_storage() {
        let cmd = command(
            Path::new("/bin/claude"),
            "claude",
            "browser",
            Path::new("/tmp/draft"),
        );
        assert_eq!(cmd.get_program(), "/usr/bin/script");
        assert!(cmd.get_args().any(|arg| arg == "--claudeai"));
        assert!(cmd.get_envs().any(|(key, value)| key == "CLAUDE_CONFIG_DIR"
            && value == Some(std::ffi::OsStr::new("/tmp/draft"))));
    }
    #[cfg(unix)]
    #[test]
    fn cancelled_cli_is_reaped_and_untrusted_output_never_enters_progress() {
        use std::os::unix::fs::PermissionsExt;
        let home = std::env::temp_dir().join(format!("orbilap-runner-{}", uuid::Uuid::new_v4()));
        std::fs::create_dir_all(&home).unwrap();
        let binary = home.join("fake-cli");
        std::fs::write(&binary,"#!/bin/sh\nprintf '%s\\n' 'secret-refresh-token' 'https://auth.openai.com/codex/device' 'ABCD-EFGH'\nexec sleep 60\n").unwrap();
        std::fs::set_permissions(&binary, std::fs::Permissions::from_mode(0o700)).unwrap();
        let mut login = Login::start(&binary, "codex", "device", &home).unwrap();
        let until = Instant::now() + Duration::from_secs(2);
        while login.poll().user_code.is_none() && Instant::now() < until {
            std::thread::sleep(Duration::from_millis(10));
        }
        let progress = login.poll();
        assert_eq!(progress.user_code.as_deref(), Some("ABCD-EFGH"));
        assert!(!serde_json::to_string(&progress)
            .unwrap()
            .contains("secret-refresh-token"));
        for code in ["", "code\ncommand", "code\rcommand", "code\0", &"a".repeat(2049)] {
            assert!(login.submit_code(code).is_err());
        }
        login.stop();
        assert!(login.child.try_wait().unwrap().is_some());
        drop(login);
        std::fs::remove_dir_all(home).unwrap();
    }

    #[cfg(target_os = "macos")]
    #[test]
    fn claude_pty_accepts_enter_and_forwards_authorization_code() {
        use std::os::unix::fs::PermissionsExt;
        let home = std::env::temp_dir().join(format!("orbilap-pty-{}", uuid::Uuid::new_v4()));
        std::fs::create_dir_all(&home).unwrap();
        let binary = home.join("fake-claude");
        std::fs::write(&binary,"#!/bin/sh\n[ -t 0 ] || exit 7\nprintf '%s\\n' 'Press Enter to open sign-in'\nread -r enter\nprintf '%s\\n' 'https://claude.ai/oauth/authorize?state=fake'\nread -r code\n[ \"$code\" = 'synthetic-code' ] || exit 8\nprintf verified > \"$CLAUDE_CONFIG_DIR/received\"\n").unwrap();
        std::fs::set_permissions(&binary, std::fs::Permissions::from_mode(0o700)).unwrap();
        let mut login = Login::start(&binary, "claude", "browser", &home).unwrap();
        let until = Instant::now() + Duration::from_secs(5);
        while login.poll().auth_url.is_none() && Instant::now() < until {
            std::thread::sleep(Duration::from_millis(10));
        }
        assert!(login.poll().auth_url.is_some());
        login.submit_code("synthetic-code").unwrap();
        while login.poll().status == "pending" && Instant::now() < until {
            std::thread::sleep(Duration::from_millis(10));
        }
        assert_eq!(login.poll().status, "completed");
        assert_eq!(
            std::fs::read_to_string(home.join("received")).unwrap(),
            "verified"
        );
        drop(login);
        std::fs::remove_dir_all(home).unwrap();
    }
}
