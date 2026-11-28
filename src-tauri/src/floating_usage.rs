//! Read-only floating surface; all quota data comes from the existing native monitor.
use serde::{Deserialize, Serialize};
use std::sync::{Mutex, atomic::{AtomicBool, Ordering}};
use tauri::{AppHandle, Emitter, Manager, LogicalSize, PhysicalPosition, WebviewUrl, WebviewWindowBuilder};
use crate::{settings::AppSettings, tray::ProfileUsage};

pub const LABEL: &str = "floating-usage";
#[derive(Debug, Clone, Copy, Default, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "kebab-case")]
pub enum DisplayMode { #[default] #[serde(other)] Badge }
impl DisplayMode {
    pub fn size(self) -> (f64, f64) {
        match self { Self::Badge => (72.0, 72.0) }
    }
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", default)]
pub struct Preferences { pub enabled: bool, pub provider: String, pub mode: DisplayMode, pub providers: Option<Vec<String>>, pub windows: std::collections::BTreeMap<String,String> }
impl Default for Preferences {
    fn default() -> Self { Self { enabled: false, provider: "codex".into(), mode: DisplayMode::Badge, providers: None, windows: Default::default() } }
}
impl Preferences {
    pub fn ids(&self) -> Vec<String> {
        self.providers.clone().unwrap_or_else(|| vec![self.provider.clone()])
    }
    pub fn normalize(&mut self) {
        self.windows.retain(|provider, window| matches!(provider.as_str(), "codex" | "claude" | "antigravity") && !window.trim().is_empty() && window.len() <= 256 && !window.chars().any(char::is_control));
        if let Some(ids) = &mut self.providers { ids.retain(|id| matches!(id.as_str(), "codex" | "claude" | "antigravity")); let saved=ids.clone(); *ids=["codex","claude","antigravity"].into_iter().filter(|id|saved.iter().any(|saved|saved==id)).map(str::to_owned).collect(); }
        if !matches!(self.provider.as_str(), "codex" | "claude" | "antigravity") { self.provider = "codex".into(); }
    }
}

#[derive(Debug, Clone, Default, PartialEq, Serialize, Deserialize)]
pub struct Position { pub x: i32, pub y: i32 }
#[derive(Debug, Clone, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Limit { pub label: String, pub used: Option<f64>, pub resets_at: Option<String>, pub warning_color: Option<String> }
#[derive(Debug, Clone, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Snapshot {
    pub mode: DisplayMode,
    pub items: Vec<Snapshot>,
    pub provider: String, pub account_id: Option<String>, pub account_name: Option<String>,
    pub workspace_id: Option<String>, pub workspace_name: Option<String>,
    pub show_remaining: bool, pub limits: Vec<Limit>, pub message: Option<String>,
}
impl Default for Snapshot {
    fn default() -> Self {
        Self { items: vec![], mode: DisplayMode::Badge, provider: "codex".into(), account_id: None, account_name: None, workspace_id: None,
            workspace_name: None, show_remaining: true, limits: vec![], message: Some("Checking active account…".into()) }
    }
}

pub fn selected(settings: &AppSettings, profile: &ProfileUsage) -> bool {
    settings.floating_usage.enabled && settings.floating_usage.ids().contains(&profile.provider) && profile.active
        && settings.active_workspace().is_some_and(|w| match profile.provider.as_str() {
            "codex" => w.account_ids.contains(&profile.id),
            "claude" => w.claude_account_ids.as_ref().is_none_or(|ids| ids.contains(&profile.id)),
            "antigravity" => w.antigravity_account_ids.contains(&profile.id),
            _ => false,
        })
}
pub fn provider_enabled(settings: &AppSettings, provider: &str) -> bool {
    settings.floating_usage.enabled && settings.floating_usage.ids().iter().any(|id| id == provider) && settings.active_workspace().is_some()
}
fn single_snapshot(settings: &AppSettings, profiles: &[ProfileUsage], now: time::OffsetDateTime) -> Snapshot {
    let workspace = settings.active_workspace();
    let mut out = Snapshot { mode: settings.floating_usage.mode, provider: settings.floating_usage.provider.clone(),
        workspace_id: workspace.map(|w| w.id.clone()), workspace_name: workspace.map(|w| w.name.clone()),
        show_remaining: workspace.is_none_or(|w| w.usage.show_remaining), ..Default::default() };
    let Some(profile) = profiles.iter().find(|p| selected(settings, p)) else {
        out.message = Some(if workspace.is_some() { "No active account in this workspace" } else { "Choose a workspace in Orbilap" }.into());
        return out;
    };
    out.account_id = Some(profile.id.clone()); out.account_name = Some(profile.name.clone());
    let prefs = crate::tray::menu_bar_account_preferences(settings, &profile.id, profile.quota.as_ref(), profile.plan.as_deref());
    let windows = profile.quota.as_ref().filter(|q| q.error.is_none()).and_then(|q| q.windows.as_ref());
    let keys = settings.floating_usage.windows.get(&profile.provider).map(|key| vec![key.clone()])
        .unwrap_or_else(|| crate::tray::ordered_window_keys(&profile.provider, &prefs.menu_bar_windows).into_iter().take(1).collect());
    out.limits = keys.into_iter().map(|key| {
        let window = windows.and_then(|windows| windows.iter().find(|w| crate::tray::metric_window_key(&profile.provider, &w.window) == key
            && crate::tray::current_window(w, now) && (0.0..=100.0).contains(&w.percent)));
        let warning_color = window.filter(|_| prefs.warning_colors)
            .and_then(|w| crate::tray::threshold_color(w.percent, settings.menu_bar_warning_thresholds()))
            .map(|[r,g,b]| format!("#{r:02x}{g:02x}{b:02x}"));
        Limit { label: key, used: window.map(|w| w.percent), resets_at: window.and_then(|w| w.resets_at.clone()), warning_color }
    }).collect();
    out.message = if out.limits.is_empty() { Some("Choose a limit in Settings → Display → Floating".into()) }
        else if out.limits.iter().all(|limit| limit.used.is_none()) { Some("Usage unavailable".into()) } else { None };
    out
}

pub fn snapshot(settings: &AppSettings, profiles: &[ProfileUsage], now: time::OffsetDateTime) -> Snapshot {
    let ids = settings.floating_usage.ids();
    let items: Vec<_> = ids.into_iter().map(|id| {
        let mut selected = settings.clone(); selected.floating_usage.provider = id.clone();
        selected.floating_usage.providers = Some(vec![id]); single_snapshot(&selected, profiles, now)
    }).filter(|item| item.account_id.is_some()).collect();
    let mut result = items.first().cloned().unwrap_or_default();
    result.items = items; result
}

#[derive(Debug, Clone, Default, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct LimitOptions { pub workspace_id: Option<String>, pub services: Vec<ServiceOptions> }
#[derive(Debug, Clone, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ServiceOptions { pub provider: String, pub account_id: String, pub windows: Vec<String>, pub selected: Option<String> }

/// Settings-only projection of the existing monitor cache; never probes credentials.
pub fn limit_options(settings: &AppSettings, profiles: &[ProfileUsage]) -> LimitOptions {
    let mut eligible = settings.clone(); eligible.floating_usage.enabled = true;
    eligible.floating_usage.providers = Some(vec!["codex".into(),"claude".into(),"antigravity".into()]);
    let services = profiles.iter().filter(|p| selected(&eligible,p)).map(|p| {
        let prefs = crate::tray::menu_bar_account_preferences(settings,&p.id,p.quota.as_ref(),p.plan.as_deref());
        let chosen = settings.floating_usage.windows.get(&p.provider).cloned()
            .or_else(|| crate::tray::ordered_window_keys(&p.provider,&prefs.menu_bar_windows).first().cloned());
        let mut keys: Vec<String> = p.quota.as_ref().filter(|q|q.error.is_none()).and_then(|q|q.windows.as_ref()).into_iter().flatten()
            .filter(|w| w.percent.is_finite() && (0.0..=100.0).contains(&w.percent))
            .map(|w|crate::tray::metric_window_key(&p.provider,&w.window)).collect();
        if let Some(key)=&chosen { keys.push(key.clone()); }
        keys.sort(); keys.dedup();
        let windows=crate::tray::ordered_window_keys(&p.provider,&keys);
        ServiceOptions {provider:p.provider.clone(),account_id:p.id.clone(),windows,selected:chosen}
    }).collect();
    LimitOptions { workspace_id:settings.active_workspace().map(|w|w.id.clone()), services }
}

#[tauri::command]
pub fn floating_usage_limit_options(window: tauri::WebviewWindow) -> Result<LimitOptions,String> {
    if window.label() != "main" { return Err("Settings surface only.".into()); }
    Ok(window.state::<crate::tray::MenuBarMonitor>().floating_limit_options())
}

#[derive(Default)]
pub struct FloatingUsage {
    sample: Mutex<Snapshot>,
    options: Mutex<LimitOptions>,
    pending_position: Mutex<Option<Position>>,
    ready: AtomicBool,
}
impl FloatingUsage {
    pub fn sample(&self) -> Snapshot { self.sample.lock().unwrap_or_else(|e| e.into_inner()).clone() }
}

/// Reject every main-app/account command from the read-only secondary webview.
pub fn ipc_allowed(window: &str, command: &str) -> bool {
    window == "main" || window == LABEL && matches!(command, "floating_usage_snapshot" | "floating_usage_action" | "floating_usage_drag")
}

#[derive(Debug, Clone, Copy)]
pub struct Bounds { pub x: i32, pub y: i32, pub width: u32, pub height: u32 }
/// Preserve a fully visible saved position; otherwise clamp to the nearest working area.
pub fn safe_position(position: Position, size: (u32, u32), monitors: &[Bounds]) -> Position {
    let fits = |m: &Bounds| position.x >= m.x && position.y >= m.y
        && i64::from(position.x) + i64::from(size.0) <= i64::from(m.x) + i64::from(m.width)
        && i64::from(position.y) + i64::from(size.1) <= i64::from(m.y) + i64::from(m.height);
    if monitors.iter().any(fits) { return position; }
    let Some(m) = monitors.iter().min_by_key(|m| {
        let dx = i64::from(position.x) - i64::from(m.x); let dy = i64::from(position.y) - i64::from(m.y);
        i128::from(dx).pow(2) + i128::from(dy).pow(2)
    }) else { return position; };
    Position {
        x: i64::from(position.x).clamp(i64::from(m.x), (i64::from(m.x) + i64::from(m.width) - i64::from(size.0)).max(i64::from(m.x))) as i32,
        y: i64::from(position.y).clamp(i64::from(m.y), (i64::from(m.y) + i64::from(m.height) - i64::from(size.1)).max(i64::from(m.y))) as i32,
    }
}
fn position_path() -> std::path::PathBuf { crate::paths::app_data_dir().join("floating-position.json") }
fn show_without_focus(window: &tauri::WebviewWindow) -> Result<(), String> {
    if window.is_visible().unwrap_or(false) { return Ok(()); }
    #[cfg(target_os = "macos")]
    {
        let raw = window.ns_window().map_err(|_| "Cannot show floating usage.")?;
        let native = unsafe { &*raw.cast::<objc2_app_kit::NSWindow>() };
        // Tauri's normal show uses makeKeyAndOrderFront. A passive HUD must not do that.
        native.orderFrontRegardless();
        Ok(())
    }
    #[cfg(not(target_os = "macos"))]
    window.show().map_err(|_| "Cannot show floating usage.".into())
}
fn recover(window: &tauri::WebviewWindow) {
    let (Ok(monitors), Ok(pos), Ok(size)) = (window.available_monitors(), window.outer_position(), window.outer_size()) else { return; };
    let monitors: Vec<_> = monitors.iter().map(|m| {
        let area = m.work_area(); Bounds { x: area.position.x, y: area.position.y, width: area.size.width, height: area.size.height }
    }).collect();
    let next = safe_position(Position { x: pos.x, y: pos.y }, (size.width, size.height), &monitors);
    if next.x != pos.x || next.y != pos.y { let _ = window.set_position(PhysicalPosition::new(next.x, next.y)); }
}
fn orb_size(_count:usize)->(f64,f64) { DisplayMode::Badge.size() }
fn resize(window: &tauri::WebviewWindow, count: usize) {
    let (width, height) = orb_size(count);
    if let (Ok(size), Ok(scale)) = (window.inner_size(), window.scale_factor()) {
        let size = size.to_logical::<f64>(scale);
        if (size.width - width).abs() < 0.5 && (size.height - height).abs() < 0.5 { return; }
    }
    let _ = window.set_size(LogicalSize::new(width, height));
}

pub fn publish(app: &AppHandle, settings: &AppSettings, profiles: &[ProfileUsage], now: time::OffsetDateTime) {
    let service = app.state::<FloatingUsage>();
    let next = snapshot(settings, profiles, now);
    let options = limit_options(settings,profiles);
    {
        let mut cached=service.options.lock().unwrap_or_else(|e|e.into_inner());
        if *cached != options { *cached=options.clone(); let _=app.emit_to("main","floating-limit-options-updated",options); }
    }
    let changed = {
        let mut current = service.sample.lock().unwrap_or_else(|e| e.into_inner());
        let changed = *current != next; *current = next.clone(); changed
    };
    if !settings.floating_usage.enabled || next.items.is_empty() {
        if let Some(window) = app.get_webview_window(LABEL) { let _ = window.hide(); }
        return;
    }
    if app.get_webview_window(LABEL).is_none() {
        service.ready.store(false, Ordering::SeqCst);
        let (width, height) = orb_size(settings.floating_usage.ids().len());
        let result = WebviewWindowBuilder::new(app, LABEL, WebviewUrl::App("index.html#floating".into()))
            .title("Orbilap · Floating usage").inner_size(width, height).resizable(false)
            .decorations(false).transparent(true).shadow(false).always_on_top(true)
            .visible_on_all_workspaces(true).skip_taskbar(true).focused(false).focusable(false)
            .accept_first_mouse(true).visible(false)
            .on_navigation(|url| matches!(url.scheme(), "tauri" | "http" | "https")
                && matches!(url.host_str(), Some("localhost" | "tauri.localhost"))
                && matches!(url.path(), "/" | "/index.html"))
            .build();
        if let Ok(window) = result {
            #[cfg(target_os = "macos")]
            if let Ok(raw) = window.ns_window() {
                let native = unsafe { &*raw.cast::<objc2_app_kit::NSWindow>() };
                let behavior = native.collectionBehavior() & !(objc2_app_kit::NSWindowCollectionBehavior::FullScreenPrimary
                    | objc2_app_kit::NSWindowCollectionBehavior::FullScreenNone | objc2_app_kit::NSWindowCollectionBehavior::MoveToActiveSpace);
                native.setCollectionBehavior(behavior
                    | objc2_app_kit::NSWindowCollectionBehavior::CanJoinAllSpaces
                    | objc2_app_kit::NSWindowCollectionBehavior::FullScreenAuxiliary);
            }
            let saved = crate::paths::read_json(&position_path()).and_then(|v| serde_json::from_value::<Position>(v).ok());
            if let Some(saved) = saved { let _ = window.set_position(PhysicalPosition::new(saved.x, saved.y)); }
            else if let Ok(Some(m)) = window.primary_monitor() {
                let area = m.work_area(); let scale = m.scale_factor();
                let _ = window.set_position(PhysicalPosition::new(area.position.x + area.size.width as i32 - (width * scale) as i32 - 24,
                    area.position.y + 24));
            }
            recover(&window);
        }
    }
    if let Some(window) = app.get_webview_window(LABEL) {
        resize(&window, settings.floating_usage.ids().len());
        if changed { let _ = app.emit_to(LABEL, "floating-usage-updated", &next); }
        if service.ready.load(Ordering::SeqCst) { recover(&window); let _ = show_without_focus(&window); }
    }
}

#[tauri::command]
pub fn floating_usage_snapshot(window: tauri::WebviewWindow) -> Result<Snapshot, String> {
    if window.label() != LABEL { return Err("Floating surface only.".into()); }
    Ok(window.state::<FloatingUsage>().sample())
}

/// Keep native drag initiation on the IPC/main thread while mouse-down is current.
#[tauri::command]
pub fn floating_usage_drag(window: tauri::WebviewWindow) -> Result<(), String> {
    if window.label() != LABEL { return Err("Floating surface only.".into()); }
    window.start_dragging().map_err(|_| "Cannot move floating usage.".into())
}

#[derive(Deserialize)]
#[serde(rename_all = "kebab-case")]
pub enum Action { Ready, Open, Hide }
#[tauri::command]
pub async fn floating_usage_action(window: tauri::WebviewWindow, action: Action, provider: Option<String>) -> Result<(), String> {
    if window.label() != LABEL { return Err("Floating surface only.".into()); }
    let app = window.app_handle().clone();
    match action {
        Action::Ready => {
            window.state::<FloatingUsage>().ready.store(true, Ordering::SeqCst);
            let preview = cfg!(debug_assertions) && std::env::var("ORBILAP_PREVIEW_FLOATING").as_deref() == Ok("1");
            if preview || crate::settings::read_settings(&crate::paths::settings_file()).floating_usage.enabled {
                let handle = app.clone();
                app.run_on_main_thread(move || {
                    if let Some(window) = handle.get_webview_window(LABEL).filter(|_| !handle.state::<FloatingUsage>().sample().items.is_empty()) { recover(&window); let _ = show_without_focus(&window); }
                }).map_err(|_| "Cannot show floating usage.")?;
            }
        }
        Action::Open => {
            let mut sample = window.state::<FloatingUsage>().sample();
            if let Some(provider) = provider { sample = sample.items.iter().find(|item| item.provider == provider).cloned().ok_or("Service is not selected.")?; }
            crate::show_panel(&app);
            let _ = app.emit_to("main", "floating-usage-open", sample);
        }
        Action::Hide => {
            let (settings, ()) = tauri::async_runtime::spawn_blocking(|| crate::settings::update_settings(&crate::paths::settings_file(), |settings| {
                settings.floating_usage.enabled = false; Ok(())
            })).await.map_err(|_| "Cannot save floating usage.")??;
            window.hide().map_err(|_| "Cannot hide floating usage.")?;
            app.state::<crate::tray::MenuBarMonitor>().update(&app, settings);
            let _ = app.emit_to("main", "floating-usage-hidden", ());
        }
    }
    Ok(())
}

pub fn moved(window: &tauri::Window, position: &tauri::PhysicalPosition<i32>) {
    if window.label() == LABEL {
        *window.state::<FloatingUsage>().pending_position.lock().unwrap_or_else(|e| e.into_inner()) = Some(Position { x: position.x, y: position.y });
    }
}
pub fn start_recovery(app: AppHandle) {
    std::thread::spawn(move || loop {
        std::thread::sleep(std::time::Duration::from_secs(2));
        flush_position(&app);
        let handle = app.clone();
        if app.run_on_main_thread(move || {
            if let Some(window) = handle.get_webview_window(LABEL).filter(|w| w.is_visible().unwrap_or(false)) { recover(&window); }
        }).is_err() { break; }
    });
}
pub fn flush_position(app: &AppHandle) {
    let service = app.state::<FloatingUsage>();
    let pending = service.pending_position.lock().unwrap_or_else(|e| e.into_inner()).take();
    if let Some(position) = pending {
        if let Ok(value) = serde_json::to_value(position) { let _ = crate::profiles::write_private(&position_path(), &value); }
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::quota::{QuotaSet, QuotaWindow};
    fn fixture() -> (AppSettings, ProfileUsage) {
        let settings: AppSettings = serde_json::from_value(serde_json::json!({
            "floatingUsage":{"enabled":true,"provider":"codex"},"activeWorkspaceId":"work",
            "workspaces":[{"id":"work","name":"Work","accent":"#007aff","accountIds":["one"],
                "usage":{"menuBarEnabled":false,"accountWindows":{"one":["weekly","5-hour"]}}}]
        })).unwrap();
        let profile = ProfileUsage { id:"one".into(), name:"Personal".into(), provider:"codex".into(), active:true, plan:Some("plus".into()),
            quota: Some(QuotaSet { provider:"codex".into(), windows: Some(vec![QuotaWindow { window:"5-hour".into(), percent:99.9, resets_at:None, status:None }]),
                error:None, as_of:None, reset_credits:None }) };
        (settings, profile)
    }
    #[test]
    fn fixed_orb_sizes_fit_one_or_multiple_services() {
        assert_eq!(orb_size(1),(72.0,72.0));
        assert_eq!(orb_size(2),(72.0,72.0));
        assert_eq!(orb_size(3),(72.0,72.0));
        assert!(!ipc_allowed(LABEL,"floating_usage_expand"));
    }
    #[test]
    fn multiple_services_are_canonical_and_keep_independent_readings() {
        let (mut settings, profile)=fixture();
        settings.floating_usage.providers=Some(vec!["claude".into(),"codex".into(),"claude".into(),"invalid".into()]);
        settings.floating_usage.normalize();
        assert_eq!(settings.floating_usage.ids(),vec!["codex","claude"]);
        let mut claude=profile.clone(); claude.provider="claude".into();
        let sample=snapshot(&settings,&[profile,claude],time::OffsetDateTime::now_utc());
        assert_eq!(sample.items.len(),2); assert_eq!(sample.items[0].provider,"codex");
        assert_eq!(sample.items[1].provider,"claude");
        assert!(sample.items.iter().all(|s|s.items.is_empty()));
        settings.floating_usage.providers=Some(vec![]);
        assert!(!provider_enabled(&settings,"codex"));
        assert!(snapshot(&settings,&[],time::OffsetDateTime::now_utc()).items.is_empty());
    }
    #[test]
    fn no_active_workspace_account_means_no_provider_segment() {
        let (mut settings, mut profile) = fixture(); let now=time::OffsetDateTime::now_utc();
        settings.floating_usage.providers=Some(vec!["codex".into(),"claude".into()]);
        assert_eq!(snapshot(&settings,&[profile.clone()],now).items.len(),1);
        profile.active=false;
        assert!(snapshot(&settings,&[profile.clone()],now).items.is_empty());
        profile.active=true;settings.workspaces[0].account_ids.clear();
        assert!(snapshot(&settings,&[profile],now).items.is_empty());
        assert_eq!(settings.floating_usage.ids(),vec!["codex","claude"]);
    }
    #[test]
    fn uses_same_limits_and_live_account_even_when_tray_provider_is_off() {
        let (settings, profile) = fixture();
        let sample = snapshot(&settings, &[profile], time::OffsetDateTime::now_utc());
        assert_eq!(sample.account_id.as_deref(), Some("one"));
        assert_eq!(sample.limits.iter().map(|l| l.label.as_str()).collect::<Vec<_>>(), ["5-hour"]);
        assert_eq!(sample.limits[0].used, Some(99.9));
    }
    #[test]
    fn floating_warning_uses_fixed_red_and_each_current_limit() {
        let (mut settings, mut profile) = fixture(); let now = time::OffsetDateTime::now_utc();
        assert!(snapshot(&settings, &[profile.clone()], now).limits[0].warning_color.is_none());
        settings.workspaces[0].usage.warning_colors = true;
        assert_eq!(snapshot(&settings, &[profile.clone()], now).limits[0].warning_color.as_deref(), Some("#ff453a"));
        profile.quota.as_mut().unwrap().windows.as_mut().unwrap()[0].percent = 80.0;
        assert!(snapshot(&settings, &[profile.clone()], now).limits[0].warning_color.is_none());
        settings.workspaces[0].usage.warning_thresholds = Some(vec![90]);
        assert!(snapshot(&settings, &[profile.clone()], now).limits[0].warning_color.is_none());
        settings.workspaces[0].usage.warning_thresholds = Some(vec![]);
        profile.quota.as_mut().unwrap().windows.as_mut().unwrap()[0].percent = 85.0;
        assert!(snapshot(&settings, &[profile.clone()], now).limits[0].warning_color.is_none());
        profile.quota.as_mut().unwrap().windows.as_mut().unwrap()[0].percent = 85.001;
        let sample = snapshot(&settings, &[profile.clone()], now);
        assert!(sample.limits.iter().all(|l|l.used.is_some()));
        assert_eq!(serde_json::to_value(&sample).unwrap()["limits"][0]["warningColor"], "#ff453a");
        profile.quota.as_mut().unwrap().windows.as_mut().unwrap()[0].resets_at = Some("2020-01-01T00:00:00Z".into());
        assert!(snapshot(&settings, &[profile], now).limits[0].warning_color.is_none());
    }
    #[test]
    fn floating_window_choice_is_independent_and_options_use_only_the_cache() {
        let (mut settings, mut profile)=fixture();let now=time::OffsetDateTime::now_utc();
        settings.workspaces[0].usage.account_windows.insert("one".into(),vec!["5-hour".into()]);
        profile.quota.as_mut().unwrap().windows.as_mut().unwrap().push(crate::quota::QuotaWindow{window:"weekly".into(),percent:42.0,resets_at:None,status:None});
        settings.floating_usage.windows.insert("codex".into(),"weekly".into());
        let value=snapshot(&settings,&[profile.clone()],now);
        assert_eq!(value.limits.len(),1);assert_eq!(value.limits[0].label,"weekly");assert_eq!(value.limits[0].used,Some(42.0));
        assert_eq!(settings.workspaces[0].usage.account_windows["one"],vec!["5-hour"]);
        let options=limit_options(&settings,&[profile.clone()]);
        assert_eq!(options.services[0].windows,vec!["5-hour","weekly"]);assert_eq!(options.services[0].selected.as_deref(),Some("weekly"));
        profile.quota.as_mut().unwrap().error=Some("private error".into());
        assert!(snapshot(&settings,&[profile.clone()],now).limits[0].used.is_none());
        let options=limit_options(&settings,&[profile]);assert_eq!(options.services[0].windows,vec!["weekly"]);
        assert!(!serde_json::to_string(&options).unwrap().contains("private error"));
        settings.floating_usage.windows.insert("hostile".into(),"weekly".into());settings.floating_usage.windows.insert("claude".into(),"\n".into());
        settings.floating_usage.normalize();assert_eq!(settings.floating_usage.windows.len(),1);
        let saved=serde_json::to_string(&settings.floating_usage).unwrap();
        assert_eq!(serde_json::from_str::<Preferences>(&saved).unwrap(),settings.floating_usage);
        assert!(!ipc_allowed(LABEL,"floating_usage_limit_options"));
    }
    #[test]
    fn hides_wrong_inactive_or_other_workspace_identity_and_errors_never_become_capacity() {
        let (mut settings, mut profile) = fixture(); let now = time::OffsetDateTime::now_utc();
        profile.active = false;
        assert!(snapshot(&settings, &[profile.clone()], now).account_id.is_none());
        profile.active = true; profile.id = "outsider".into();
        assert!(snapshot(&settings, &[profile.clone()], now).account_id.is_none());
        profile.id = "one".into(); profile.quota.as_mut().unwrap().error = Some("private provider failure".into());
        let sample = snapshot(&settings, &[profile.clone()], now);
        assert!(sample.limits.iter().all(|l| l.used.is_none()));
        assert!(!serde_json::to_string(&sample).unwrap().contains("private provider failure"));
        settings.floating_usage.provider = "claude".into();
        assert!(snapshot(&settings, &[profile], now).account_id.is_none());
    }
    #[test]
    fn expired_limits_are_unknown_and_an_explicit_empty_selection_is_respected() {
        let (mut settings, mut profile) = fixture(); let now = time::OffsetDateTime::now_utc();
        profile.quota.as_mut().unwrap().windows.as_mut().unwrap()[0].resets_at = Some("2020-01-01T00:00:00Z".into());
        assert!(snapshot(&settings, &[profile.clone()], now).limits.iter().all(|l| l.used.is_none()));
        settings.workspaces[0].usage.account_windows.insert("one".into(), vec![]);
        assert!(snapshot(&settings, &[profile], now).limits.is_empty());
    }
    #[test]
    fn permissions_keep_account_commands_out_of_the_floating_window() {
        for command in ["get_state", "set_app_settings", "consume_codex_reset", "activate_codex_profile", "quit_app"] {
            assert!(!ipc_allowed(LABEL, command)); assert!(ipc_allowed("main", command));
        }
        assert!(ipc_allowed(LABEL, "floating_usage_snapshot"));
        assert!(ipc_allowed(LABEL, "floating_usage_action"));
        assert!(ipc_allowed(LABEL, "floating_usage_drag"));
        assert!(!ipc_allowed("untrusted", "floating_usage_action"));
    }
    #[test]
    fn offscreen_recovery_handles_removed_displays_negative_coordinates_and_small_workareas() {
        let monitors = [Bounds { x:-1920,y:0,width:1920,height:1080 }, Bounds { x:0,y:30,width:1440,height:870 }];
        assert_eq!(safe_position(Position { x:-1800,y:50 }, (320,158), &monitors), Position { x:-1800,y:50 });
        let moved = safe_position(Position { x:2400,y:200 }, (320,158), &monitors);
        assert_eq!(moved, Position { x:1120,y:200 });
        assert_eq!(safe_position(Position { x:0,y:-999 }, (320,158), &monitors), Position { x:0,y:30 });
        assert_eq!(safe_position(Position { x:20,y:20 }, (640,316), &[Bounds{x:0,y:0,width:400,height:200}]), Position{x:0,y:0});
    }
    #[test]
    fn invalid_provider_normalizes_and_disabling_retains_selected_provider() {
        let mut prefs = Preferences { enabled:true, provider:"hostile".into(), ..Default::default() }; prefs.normalize(); assert_eq!(prefs.provider,"codex");
        prefs.provider = "antigravity".into(); prefs.enabled = false; prefs.normalize(); assert_eq!(prefs.provider,"antigravity");
    }
    #[test]
    fn display_preferences_migrate_roundtrip_and_resize_without_replacing_usage() {
        let old: Preferences = serde_json::from_str(r#"{"enabled":true,"provider":"claude"}"#).unwrap();
        assert_eq!(old.mode, DisplayMode::Badge);
        let unknown: Preferences = serde_json::from_str(r#"{"mode":"future"}"#).unwrap();
        assert_eq!(unknown.mode, DisplayMode::Badge);
        for legacy in ["full", "compact"] {
            let prefs: Preferences = serde_json::from_value(serde_json::json!({"mode":legacy})).unwrap();
            assert_eq!(prefs.mode, DisplayMode::Badge);
        }
        let (mut settings, profile) = fixture();
        for mode in [DisplayMode::Badge, DisplayMode::Badge] {
            settings.floating_usage.mode = mode;
            let restored: Preferences = serde_json::from_value(serde_json::to_value(&settings.floating_usage).unwrap()).unwrap();
            assert_eq!(restored.mode, mode);
            let sample = snapshot(&settings, &[profile.clone()], time::OffsetDateTime::now_utc());
            assert_eq!(sample.mode, mode); assert_eq!(sample.limits[0].used, Some(99.9));
        }
        assert_eq!(DisplayMode::Badge.size(), (72.0,72.0));
        let area = [Bounds{x:0,y:0,width:800,height:600}];
        // Enlarging a mini near an edge must recover the full card onto the screen.
        assert_eq!(safe_position(Position{x:604,y:548},(320,158),&area),Position{x:480,y:442});
    }
}
