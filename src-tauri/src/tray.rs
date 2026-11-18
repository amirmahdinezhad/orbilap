//! Native menu-bar mark and usage metrics, tinted by macOS or enabled usage warnings.

use std::sync::{mpsc, Arc, Mutex};
use std::time::Duration;
use tauri::image::Image;
use tauri::{AppHandle, Emitter, Manager};

use crate::quota::{self, QuotaSet, QuotaWindow};
use crate::settings::{canonical_account_window, AppSettings, CodexAccountPreferences, MenuBarProvider, MenuBarWindow};

// The 46×36 canvas leaves room for the tray compositor and centers the mark.
static ICON: &[u8] = include_bytes!("../icons/tray-template.png");
pub const TEMPLATE_INK: [u8; 3] = [0; 3];
pub const DEFAULT_ACCENT: [u8; 3] = [28; 3];
const DARK_BAR_INK: [u8; 3] = [245; 3];
pub const MENU_BAR_TITLE: &str = if cfg!(all(debug_assertions, target_os = "macos")) { "DEV" } else { "" };
pub const MENU_BAR_NAME: &str = if cfg!(all(debug_assertions, target_os = "macos")) { "Orbilap Dev" } else { "Orbilap" };

/// Tint the original mark's RGB while preserving every alpha-mask pixel.
pub fn render(accent: [u8; 3]) -> Image<'static> {
    let image = Image::from_bytes(ICON).expect("bundled tray icon must decode");
    let mut rgba = image.rgba().to_vec();
    for pixel in rgba.chunks_exact_mut(4) {
        pixel[..3].copy_from_slice(&accent);
    }
    Image::new_owned(rgba, image.width(), image.height())
}

/// Native usage monitor; its timer keeps running when the webview is hidden.
pub struct MenuBarMonitor {
    state: Arc<Mutex<MenuBarState>>,
    wake: mpsc::SyncSender<()>,
}

struct MenuBarState {
    settings: AppSettings,
    quota: Option<QuotaSet>,
    profiles: Vec<ProfileUsage>,
    generation: u64,
    provider_updates: std::collections::BTreeMap<String, u64>,
}

impl MenuBarState {
    fn invalidate_provider(&mut self, provider: &str) {
        self.generation += 1;
        self.provider_updates.insert(provider.into(), self.generation);
    }
    fn invalidate_all(&mut self) {
        self.generation += 1;
        self.provider_updates.insert("*".into(), self.generation);
    }

    /// Keep fresh card data while accepting unrelated providers from the same probe.
    fn accept_collection(&mut self, generation: u64, quota: Option<QuotaSet>, profiles: Vec<ProfileUsage>) -> bool {
        if self.accept(generation, quota) { self.profiles = profiles; return true; }
        if self.provider_updates.get("*").is_some_and(|cutoff| *cutoff > generation) { return false; }
        let changed = |provider: &str| self.provider_updates.get(provider).is_some_and(|cutoff| *cutoff > generation);
        let mut merged: Vec<_> = profiles.into_iter().filter(|p| !changed(&p.provider)).collect();
        merged.extend(self.profiles.iter().filter(|p| changed(&p.provider)).cloned());
        self.profiles = merged;
        true
    }

    fn active_profile(&mut self, generation: u64, profile: Option<ProfileUsage>) -> bool {
        if generation != self.generation { return false; }
        let profile = profile.filter(|profile| menu_bar_account(&self.settings, profile));
        let previous = self.profiles.iter().find(|profile| profile.provider == "antigravity").cloned();
        if previous.as_ref().map(|profile| &profile.id) != profile.as_ref().map(|profile| &profile.id) {
            self.invalidate_provider("antigravity");
        }
        let profile = profile.map(|mut profile| {
            profile.quota = previous.as_ref().filter(|old| old.id == profile.id).and_then(|old| old.quota.clone());
            profile
        });
        self.profiles.retain(|profile| profile.provider != "antigravity");
        self.profiles.extend(profile);
        true
    }

    fn provider_changed(&mut self, provider: &str) {
        if self.settings.active_workspace().map_or(self.settings.menu_bar_provider.id() == provider, |w| w.shows_menu_bar_provider(provider)) {
            self.invalidate_provider(provider);
        }
        self.profiles.retain(|profile| profile.provider != provider);
        if self.settings.menu_bar_provider.id() == provider { self.quota = None; }
    }

    fn card_usage(&mut self, generation: u64, profile: ProfileUsage) -> bool {
        if generation != self.generation || !menu_bar_account(&self.settings, &profile) { return false; }
        self.invalidate_provider(&profile.provider); // Keep this provider's newer card result.
        self.profiles.retain(|old| old.provider != profile.provider);
        self.profiles.push(profile);
        true
    }

    fn update(&mut self, settings: AppSettings) -> bool {
        let identity_changed = self.settings.menu_bar_provider != settings.menu_bar_provider
            || self.settings.active_workspace_id != settings.active_workspace_id
            || self.settings.active_workspace().map(|w| (&w.account_ids, &w.claude_account_ids, &w.antigravity_account_ids, w.menu_bar_providers(), w.menu_bar_account_id(), &w.usage.active_accounts))
                != settings.active_workspace().map(|w| (&w.account_ids, &w.claude_account_ids, &w.antigravity_account_ids, w.menu_bar_providers(), w.menu_bar_account_id(), &w.usage.active_accounts));
        let source_changed = self.settings.menu_bar_provider != settings.menu_bar_provider
            || self.settings.workspaces != settings.workspaces
            || self.settings.active_workspace_id != settings.active_workspace_id
            || self.settings.codex_accounts != settings.codex_accounts
            || self.settings.codex_display_mode != settings.codex_display_mode
            || self.settings.menu_bar_enabled != settings.menu_bar_enabled
            || self.settings.multi_profile != settings.multi_profile
            || self.settings.auto_switch_enabled != settings.auto_switch_enabled;
        let refresh_changed = source_changed
            || self.settings.menu_bar_window != settings.menu_bar_window
            || self.settings.refresh_interval_secs != settings.refresh_interval_secs
            || self.settings.usage_appearance != settings.usage_appearance
            || self.settings.multi_profile != settings.multi_profile
            || self.settings.auto_switch_enabled != settings.auto_switch_enabled;
        if source_changed {
            self.invalidate_all();
            // Presentation changes repaint the current sample immediately. Only an
            // identity change can make that sample belong to the wrong account.
            if identity_changed { self.quota = None; self.profiles.clear(); }
        }
        self.settings = settings;
        refresh_changed
    }

    fn accept(&mut self, generation: u64, quota: Option<QuotaSet>) -> bool {
        if generation != self.generation {
            return false;
        }
        self.quota = quota;
        true
    }
}

impl MenuBarMonitor {
    pub fn active_antigravity(&self, app: &AppHandle, generation: u64, profile: Option<ProfileUsage>) {
        if self.state.lock().unwrap_or_else(|e| e.into_inner()).active_profile(generation, profile) {
            paint(app, self.state.clone());
        }
    }
    pub fn generation(&self) -> u64 {
        self.state.lock().unwrap_or_else(|e| e.into_inner()).generation
    }

    pub fn card_usage(&self, app: &AppHandle, generation: u64, id: &str, quota: QuotaSet) {
        let changed = {
            let mut state = self.state.lock().unwrap_or_else(|e| e.into_inner());
            let profile = state.profiles.iter().find(|profile| profile.provider == "antigravity" && profile.id == id).cloned();
            profile.is_some_and(|mut profile| { profile.quota = Some(quota); state.card_usage(generation, profile) })
        };
        if changed { paint(app, self.state.clone()); }
    }

    pub fn provider_changed(&self, app: &AppHandle, provider: &str) {
        self.state.lock().unwrap_or_else(|e| e.into_inner()).provider_changed(provider);
        paint(app, self.state.clone());
        self.refresh();
    }
    /// System appearance changes repaint the current usage without network reads.
    pub fn appearance_changed(&self, app: &AppHandle) { paint(app, self.state.clone()); }
    /// Discard old-account results, including a probe that is still in flight.
    pub fn account_changed(&self, app: &AppHandle) {
        {
            let mut state = self.state.lock().unwrap_or_else(|e| e.into_inner());
            state.invalidate_all();
            state.quota = None;
            state.profiles.clear();
        }
        paint(app, self.state.clone());
        self.refresh();
    }

    /// Apply saved preferences immediately and wake the selected-source probe.
    pub fn update(&self, app: &AppHandle, settings: AppSettings) {
        app.state::<crate::desktop_switch::DesktopSwitch>().cancel_unenrolled(&settings);
        let changed = self
            .state
            .lock()
            .unwrap_or_else(|e| e.into_inner())
            .update(settings);
        if changed {
            paint(app, self.state.clone());
            self.refresh();
        }
    }

    /// Coalesce refresh requests while a read-only probe is already running.
    pub fn refresh(&self) {
        let _ = self.wake.try_send(());
    }
}

#[cfg(debug_assertions)]
pub fn claude_preview_enabled() -> bool {
    std::env::var("ORBILAP_PREVIEW_CLAUDE").as_deref() == Ok("1")
}

/// Synthetic identities exist only in an explicitly enabled debug session.
#[cfg(debug_assertions)]
fn claude_preview() -> (AppSettings, Vec<ProfileUsage>) {
    let workspace = serde_json::from_value(serde_json::json!({
        "id":"preview", "name":"Demo preview", "accent":"#007aff",
        "accountIds":["demo-codex"], "claudeAccountIds":["demo-claude"],
        "usage":{"menuBarProviders":["codex","claude"], "showProviderLogos":true,
            "menuBarStyle":"percentages", "showAccountName":false,
            "accountWindows":{"demo-codex":["5-hour"],"demo-claude":["5-hour","weekly"]}}
    })).expect("valid bundled preview");
    let profiles = [
        ("codex", "demo-codex", "Codex demo", vec![("5-hour", 32.0)]),
        ("claude", "demo-claude", "Claude demo", vec![("5-hour", 28.0), ("weekly", 54.0)]),
    ].into_iter().map(|(provider, id, name, windows)| ProfileUsage {
        id: id.into(),
        name: name.into(),
        provider: provider.into(),
        active: true,
        quota: Some(QuotaSet {
            provider: provider.into(),
            error: None,
            as_of: None,
            reset_credits: None,
            windows: Some(windows.into_iter().map(|(window, percent)| QuotaWindow {
                window: window.into(), percent, status: None, resets_at: None,
            }).collect()),
        }),
    }).collect();
    let settings = AppSettings {
        workspaces: vec![workspace],
        active_workspace_id: Some("preview".into()),
        ..Default::default()
    };
    (settings, profiles)
}

/// Start once after the tray exists; no quota requests are made while disabled.
pub fn start_monitor(app: &AppHandle, settings: AppSettings) {
    let (wake, receiver) = mpsc::sync_channel(1);
    let state = Arc::new(Mutex::new(MenuBarState { provider_updates: Default::default(),
        settings,
        quota: None,
        profiles: Vec::new(),
        generation: 0,
    }));
    app.manage(MenuBarMonitor {
        state: state.clone(),
        wake,
    });
    // Explicit development preview: no credentials, account writes or background probes.
    #[cfg(debug_assertions)]
    if claude_preview_enabled() {
        let (settings, profiles) = claude_preview();
        {
            let mut preview = state.lock().unwrap_or_else(|e| e.into_inner());
            preview.settings = settings;
            preview.profiles = profiles;
        }
        paint(app, state.clone());
        return;
    }
    paint(app, state.clone());
    let app = app.clone();
    let cleanup_app = app.clone();
    // Subscription cleanup also runs with usage monitoring turned off.
    std::thread::spawn(move || loop {
        match crate::workspaces::purge_expired_accounts() {
            Ok(true) => {
                if let Ok(profiles) = crate::profiles::list() {
                    cleanup_app.state::<crate::desktop_switch::DesktopSwitch>().forget_missing_profile(&profiles);
                }
                let monitor = cleanup_app.state::<MenuBarMonitor>();
                monitor.update(&cleanup_app, crate::settings::read_settings(&crate::paths::settings_file()));
                monitor.account_changed(&cleanup_app);
                let _ = cleanup_app.emit("expired-accounts-removed", ());
            }
            Ok(false) => {}
            Err(error) => eprintln!("[orbilap] Cannot reconcile expired accounts: {error}"),
        }
        std::thread::sleep(Duration::from_secs(30));
    });
    std::thread::spawn(move || {
        let mut attempted_switches = std::collections::BTreeSet::new();
        let mut antigravity_attempts = std::collections::BTreeSet::new();
        loop {
            let (settings, generation) = {
                let state = state.lock().unwrap_or_else(|e| e.into_inner());
                (state.settings.clone(), state.generation)
            };
            attempted_switches.retain(|key: &String| {
                key.split_once(':').is_some_and(|(id, _)| settings.contains_codex_account(id))
            });
            if monitoring_enabled(&settings) {
                let primary = if settings.menu_bar_provider != MenuBarProvider::Codex && settings.menu_bar_enabled {
                    quota::provider_quota(settings.menu_bar_provider)
                } else {
                    None
                };
                let profiles = if settings.multi_profile.enabled
                    || settings.menu_bar_enabled
                    || settings.codex_menu_bar_enabled()
                    || codex_cycle_enabled(&settings)
                    || antigravity_cycle(&settings).is_some()
                {
                    collect_profiles(&settings)
                } else {
                    Vec::new()
                };
                let accepted = {
                    let mut state = state.lock().unwrap_or_else(|e| e.into_inner());
                    let display_profiles = profiles.iter().filter(|profile| profile.provider != "antigravity" || profile.active).cloned().collect();
                    state.accept_collection(generation, primary, display_profiles)
                };
                if accepted {
                    paint(&app, state.clone());
                    let now = time::OffsetDateTime::now_utc();
                    // Do not schedule a switch for settings superseded during collection.
                    if state.lock().unwrap_or_else(|e| e.into_inner()).generation == generation {
                        use tauri_plugin_notification::NotificationExt;
                        if codex_cycle_enabled(&settings) {
                            if let Some((active, target, period)) =
                                auto_switch_target(&profiles, &settings, now)
                            {
                                let key = format!("{}:{period}", active.id);
                                if attempted_switches.insert(key) {
                                    match app
                                        .state::<crate::desktop_switch::DesktopSwitch>()
                                        .schedule_automatic(app.clone(), &active.id, &target.id)
                                    {
                                        Ok(_) => {
                                            let _ = app.notification().builder().title("Orbilap · Switching profile").body(format!("{} reached its usage limit. Switching to {}. If a thread is running, Orbilap will ask before closing Codex.",active.name,target.name)).show();
                                        }
                                        Err(error) => {
                                            let _ = app
                                                .notification()
                                                .builder()
                                                .title("Orbilap · Auto-switch unavailable")
                                                .body(error)
                                                .show();
                                        }
                                    }
                                }
                            }
                        }
                    }
                    antigravity_attempts.retain(|(_, _, reset)| *reset > now);
                    if let Some(workspace) = antigravity_cycle(&settings) {
                        if let Some((source, target, limits, reset)) = antigravity_switch_target(&profiles, workspace, now) {
                            let key = (workspace.id.clone(), source.id.clone(), reset);
                            if antigravity_attempts.insert(key) {
                                run_antigravity_switch(&app, workspace, source, target, &limits, reset);
                            }
                        }
                    }
                }
            }
            let result = if monitoring_enabled(&settings) {
                receiver.recv_timeout(Duration::from_secs(settings.refresh_interval_secs.into()))
            } else {
                receiver
                    .recv()
                    .map_err(|_| mpsc::RecvTimeoutError::Disconnected)
            };
            if matches!(result, Err(mpsc::RecvTimeoutError::Disconnected)) {
                break;
            }
        }
    });
}

fn paint(app: &AppHandle, state: Arc<Mutex<MenuBarState>>) {
    let handle = app.clone();
    // Resolve the latest state on the main thread so queued paints cannot
    // restore an old provider's title after a settings change.
    let _ = app.run_on_main_thread(move || {
        let state = state.lock().unwrap_or_else(|e| e.into_inner());
        let now = time::OffsetDateTime::now_utc();
        let light_menu_bar = menu_bar_is_light(&handle);
        let (mut labels, mut icon_accent) = menu_bar_labels(&state.settings, &state.profiles, now, light_menu_bar);
        if state.settings.active_workspace().is_none() && state.settings.menu_bar_enabled && state.settings.menu_bar_provider != MenuBarProvider::Codex && !state.settings.multi_profile.enabled {
            let mut windows = Vec::new();
            if state.settings.usage_appearance.session_enabled {
                windows.push(state.settings.menu_bar_window);
            }
            if state.settings.usage_appearance.weekly_enabled
                && !windows.contains(&MenuBarWindow::Weekly)
            {
                windows.push(MenuBarWindow::Weekly);
            }
            for window in windows {
                let mut settings = state.settings.clone();
                settings.menu_bar_window = window;
                let title = usage_title(&settings, state.quota.as_ref(), now);
                labels.push(crate::tray_text::Label {
                    text: title,
                    provider: None, show_provider: false,
                    caption: None,
                    color: readable_warning_color(selected_color(&settings, state.quota.as_ref(), now), light_menu_bar),
                    segments: Vec::new(),
                    metrics: Vec::new(),
                });
            }
        }
        if state.settings.active_workspace().is_none() && state.settings.menu_bar_enabled && state.settings.menu_bar_provider != MenuBarProvider::Codex && state.settings.multi_profile.enabled {
            for profile in &state.profiles {
                if profile.provider == "codex" { continue; }
                if !state
                    .settings
                    .multi_profile
                    .selected_ids
                    .contains(&profile.id)
                {
                    continue;
                }
                let mut settings = state.settings.clone();
                settings.menu_bar_enabled = true;
                settings.menu_bar_provider = if profile.provider == "claude" {
                    crate::settings::MenuBarProvider::Claude
                } else {
                    crate::settings::MenuBarProvider::Codex
                };
                settings.menu_bar_window = MenuBarWindow::FiveHour;
                settings.usage_appearance.show_labels = state.settings.usage_appearance.show_labels;
                settings.usage_appearance.show_remaining =
                    state.settings.multi_profile.show_remaining;
                let mut text = usage_title(&settings, profile.quota.as_ref(), now);
                if state.settings.multi_profile.show_weekly {
                    settings.menu_bar_window = MenuBarWindow::Weekly;
                    let weekly = usage_title(&settings, profile.quota.as_ref(), now);
                    text.push_str(&format!("  {weekly}"));
                    settings.menu_bar_window = MenuBarWindow::FiveHour;
                }
                labels.push(crate::tray_text::Label {
                    provider: None, show_provider: false,
                    text,
                    caption: state
                        .settings
                        .multi_profile
                        .show_profile_label
                        .then(|| account_initials(&profile.name)),
                    color: readable_warning_color(selected_color(&settings, profile.quota.as_ref(), now), light_menu_bar),
                    segments: Vec::new(),
                    metrics: Vec::new(),
                });
            }
        }
        if let Some(tray) = handle.tray_by_id("main") {
            let tooltip = labels.iter().map(|label| format!("{}: {}", crate::tray_text::provider_name(label.provider.as_deref()), label.text)).collect::<Vec<_>>().join("\n");
            #[cfg(debug_assertions)]
            let tooltip = if claude_preview_enabled() { format!("Demo usage\n{tooltip}") } else { tooltip };
            let tooltip = if tooltip.is_empty() {
                MENU_BAR_NAME.to_owned()
            } else if MENU_BAR_TITLE.is_empty() {
                tooltip
            } else {
                format!("{MENU_BAR_NAME}\n{tooltip}")
            };
            let _ = tray.set_tooltip(Some(tooltip));
            let monochrome = if state.settings.multi_profile.enabled {
                state.settings.multi_profile.monochrome
            } else {
                state.settings.usage_appearance.monochrome
            };
            let fallback = labels
                .iter()
                .map(|v| if v.show_provider { format!("{} {}", crate::tray_text::provider_name(v.provider.as_deref()), v.text) } else { v.text.clone() })
                .collect::<Vec<_>>()
                .join("  ");
            let template = cfg!(target_os = "macos")
                && apply_menu_bar_ink(&mut labels, &mut icon_accent, light_menu_bar);
            if labels.is_empty() {
                let _ = tray.set_title(Some(MENU_BAR_TITLE));
                let _ = tray.set_icon_with_as_template(Some(render(icon_accent)), template);
            } else if let Some(image) = crate::tray_text::render(&labels, monochrome, icon_accent, state.settings.active_workspace().map(|w| w.usage.menu_bar_style).unwrap_or_default(), state.settings.active_workspace().is_none_or(|w| w.usage.show_app_logo), template) {
                let _ = tray.set_title(Some(MENU_BAR_TITLE));
                let _ = tray.set_icon_with_as_template(Some(image), template);
            } else {
                let neutral_icon = template || icon_accent == DEFAULT_ACCENT || icon_accent == DARK_BAR_INK;
                let fallback_template = cfg!(target_os = "macos") && neutral_icon;
                let ink = if fallback_template { TEMPLATE_INK } else { icon_accent };
                let _ = tray.set_icon_with_as_template(Some(render(ink)), fallback_template);
                let title = if MENU_BAR_TITLE.is_empty() {
                    fallback
                } else {
                    format!("{MENU_BAR_TITLE}  {fallback}")
                };
                let _ = tray.set_title(Some(title));
            }
        }
    });
}

fn menu_bar_labels(settings: &AppSettings, profiles: &[ProfileUsage], now: time::OffsetDateTime, light_menu_bar: bool) -> (Vec<crate::tray_text::Label>, [u8; 3]) {
    let mut labels = Vec::new();
    let mut icon_accent = DEFAULT_ACCENT;
    let mut warning_used = 0.0_f64;
    let thresholds = settings.menu_bar_warning_thresholds();
    if settings.codex_menu_bar_enabled() {
        let workspace = settings.active_workspace();
        let mut profiles: Vec<_> = profiles.iter().filter(|p| menu_bar_account(settings, p)).collect();
        profiles.sort_by_key(|p| match p.provider.as_str() { "codex" => 0, "claude" => 1, _ => 2 });
        for profile in profiles {
            let prefs = menu_bar_account_preferences(settings, &profile.id, profile.quota.as_ref());
            if !prefs.menu_bar_enabled || prefs.menu_bar_windows.is_empty() { continue; }
            let remaining = workspace.is_none_or(|w| w.usage.show_remaining);
            let mut label = account_label(profile, &prefs, &thresholds, remaining, now);
            if let Some((used, color)) = account_warning(profile, &prefs, &thresholds, now) {
                let color = readable_warning_color(color, light_menu_bar);
                if used > warning_used { icon_accent = color; warning_used = used; }
                tint_label(&mut label, color);
            }
            labels.push(label);
        }
    }
    if settings.active_workspace().is_some_and(|w| w.usage.show_provider_logos.unwrap_or(labels.len() > 1)) {
        for label in &mut labels { label.show_provider = true; }
    }
    (labels, icon_accent)
}

#[derive(Clone, serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ProfileUsage {
    pub id: String,
    pub name: String,
    pub active: bool,
    pub provider: String,
    pub quota: Option<QuotaSet>,
}

/// Apply workspace presentation without modifying saved account preferences.
fn menu_bar_account_preferences(settings: &AppSettings, id: &str, quota: Option<&QuotaSet>) -> CodexAccountPreferences {
    let mut prefs = settings.codex_accounts.get(id).cloned().unwrap_or_default();
    if let Some(workspace) = settings.active_workspace() {
        prefs.menu_bar_enabled = true;
        if let Some(windows) = workspace.usage.account_windows.get(id) {
            prefs.menu_bar_windows = windows.clone();
        } else if workspace.usage.default_menu_bar_limits && prefs.menu_bar_windows.is_empty() {
            if let Some(windows) = quota.filter(|q| q.error.is_none()).and_then(|q| q.windows.as_ref()) {
                prefs.menu_bar_windows = ["5-hour", "weekly"].into_iter()
                    .filter(|kind| windows.iter().any(|w| canonical_account_window(&w.window).as_deref() == Some(*kind)))
                    .map(str::to_owned)
                    .collect();
            }
        }
        prefs.warning_colors = workspace.usage.warning_colors;
        prefs.show_profile_label = workspace.usage.show_account_name.unwrap_or(prefs.show_profile_label);
    }
    prefs
}

/// Preserve provider-specific bucket names; Codex continues to use canonical main windows.
fn metric_window_key(provider: &str, window: &str) -> String {
    canonical_account_window(window).unwrap_or_else(|| if provider == "codex" { String::new() } else { window.to_owned() })
}

fn compact_cadence(window: &str) -> Option<&'static str> {
    match window.rsplit(" · ").next()?.to_ascii_lowercase().as_str() {
        "5-hour" | "5h" => Some("5h"),
        "weekly" => Some("1w"),
        "monthly" => Some("1mo"),
        _ => None,
    }
}

fn antigravity_model_order(window: &str) -> u8 {
    let family = window.split(" · ").next().unwrap_or(window).to_ascii_lowercase();
    if family.split_whitespace().any(|word| word == "carbon") { 0 }
    else if family.split_whitespace().any(|word| word == "argon") { 1 }
    else if family.starts_with("gemini") || compact_cadence(window).is_some() && !window.contains(" · ") { 2 }
    else { 3 }
}

/// Keep Antigravity's model identity visible even when its cadence is unique.
fn menu_bar_limit_label(provider: &str, kind: &str) -> Option<String> {
    if provider != "antigravity" {
        return Some(match kind.to_ascii_lowercase().as_str() {
            "5-hour" | "5h" => "5h", "weekly" => "1w", "monthly" => "1mo", _ => kind,
        }.to_owned());
    }
    let cadence = compact_cadence(kind);
    let family = kind.rsplit_once(" · ").map(|(family, _)| family)
        .unwrap_or(if cadence.is_some() { "Gemini" } else { kind });
    let model = family.strip_prefix("Gemini ").map(|name| {
        name.split_once(' ').filter(|(version, _)| version.chars().all(|c| c.is_ascii_digit() || c == '.'))
            .map_or(name, |(_, model)| model)
    }).unwrap_or(family);
    let model = match model.to_ascii_lowercase().as_str() {
        "carbon" => "Ca", "argon" => "Ar", "gemini" | "models" => "Ge", _ => model,
    };
    Some(cadence.map_or_else(|| model.to_owned(), |period| format!("{model} {period}")))
}

/// Resolve one warning hue from the selected, current limits for the whole account.
fn account_warning(
    profile: &ProfileUsage,
    prefs: &CodexAccountPreferences,
    thresholds: &[u8],
    now: time::OffsetDateTime,
) -> Option<(f64, [u8; 3])> {
    if !prefs.warning_colors { return None; }
    let used = profile.quota.as_ref().filter(|q| q.error.is_none())?.windows.as_ref()?.iter()
        .filter(|w| current_window(w, now) && prefs.menu_bar_windows.contains(&metric_window_key(&profile.provider, &w.window)))
        .map(|w| w.percent).max_by(f64::total_cmp)?;
    threshold_color(used, thresholds).map(|color| (used, color))
}

/// Warning tint includes initials, all metrics and window labels.
fn account_label(
    profile: &ProfileUsage,
    prefs: &CodexAccountPreferences,
    thresholds: &[u8],
    show_remaining: bool,
    now: time::OffsetDateTime,
) -> crate::tray_text::Label {
    let warning = account_warning(profile, prefs, thresholds, now).map(|(_, color)| color);
    let color = warning.unwrap_or(DEFAULT_ACCENT);
    let mut segments = Vec::new();
    let mut metrics = Vec::new();
    // Display order must not depend on the order limits were selected or saved.
    let mut windows: Vec<_> = prefs.menu_bar_windows.iter().collect();
    windows.sort_by_key(|kind| (if profile.provider == "antigravity" { antigravity_model_order(kind) } else { 0 }, match kind.rsplit(" · ").next().unwrap_or(kind).to_ascii_lowercase().as_str() {
        "5-hour" => 0,
        "weekly" => 1,
        "monthly" => 2,
        _ => 3,
    }));
    for (index, kind) in windows.into_iter().enumerate() {
        let window = profile.quota.as_ref().filter(|q| q.error.is_none())
            .and_then(|q| q.windows.as_ref())
            .and_then(|ws| ws.iter().find(|w| metric_window_key(&profile.provider, &w.window) == *kind && current_window(w, now)));
        let label = menu_bar_limit_label(&profile.provider, kind).filter(|_| prefs.show_labels);
        let value = window.map(|w| format!("{:.0}%", if show_remaining { remaining_percent(w.percent) } else { w.percent.clamp(0.0, 100.0).round() }))
            .unwrap_or_else(|| "—".into());
        let metric_color = color;
        let reset_fraction = window.and_then(|window| time_remaining_fraction(window, now));
        metrics.push(crate::tray_text::Metric {
            label: label.clone(),
            fraction: window.map(|w| (if show_remaining { 100.0 - w.percent } else { w.percent }).clamp(0.0, 100.0) / 100.0),
            color: metric_color,
            time_marker: reset_fraction.map(|left| if show_remaining { left } else { 1.0 - left }),
            reset_fraction,
        });
        let prefix = if index == 0 { "" } else { "  " };
        segments.push((if let Some(label) = label { format!("{prefix}{label} {value}") } else { format!("{prefix}{value}") }, metric_color));
    }
    crate::tray_text::Label {
        provider: Some(profile.provider.clone()), show_provider: false,
        text: segments.iter().map(|(text, _)| text.as_str()).collect::<String>(),
        segments,
        metrics,
        caption: prefs.show_profile_label.then(|| account_initials(&profile.name)),
        color,
    }
}

/// Match the Usage limits popup: known session/week durations only, never infer
/// a monthly duration or fabricate timing when the reset is absent or invalid.
fn time_remaining_fraction(window: &QuotaWindow, now: time::OffsetDateTime) -> Option<f64> {
    let duration = match window.window.rsplit(" · ").next()?.to_lowercase().as_str() {
        "5-hour" | "rolling" => 18_000_000.0,
        "weekly" => 604_800_000.0,
        _ => return None,
    };
    let reset = crate::timestamps::parse_rfc3339(window.resets_at.as_deref()?).ok()?;
    let left = (reset - now).whole_milliseconds() as f64;
    if !window.percent.is_finite() || left <= 0.0 || left > duration { return None; }
    Some(left / duration)
}

fn monitoring_enabled(settings: &AppSettings) -> bool {
    settings.menu_bar_enabled
        || settings.codex_menu_bar_enabled()
        || codex_cycle_enabled(settings)
        || antigravity_cycle(settings).is_some()
}

fn antigravity_cycle(settings: &AppSettings) -> Option<&crate::workspaces::Workspace> {
    settings.active_workspace().filter(|workspace| {
        workspace.usage.antigravity_auto_switch
            && workspace.usage.antigravity_switch_accounts.len() >= 2
    })
}

fn codex_cycle_enabled(settings: &AppSettings) -> bool {
    settings.active_workspace().is_none_or(|w| w.usage.auto_switch_enabled)
        && settings.codex_accounts.iter().filter(|(id, p)| settings.contains_codex_account(id) && p.auto_switch).count() >= 2
}

/// The menu bar follows the live Codex login only within the current workspace.
fn codex_menu_bar_account(settings: &AppSettings, id: &str, active: bool) -> bool {
    active && settings.codex_menu_bar_enabled()
        && settings.contains_codex_account(id)
        && settings.active_workspace().is_none_or(|w| w.shows_menu_bar_provider("codex"))
}

/// Saved preferences never establish a provider login or pin an inactive account.
fn menu_bar_account(settings: &AppSettings, profile: &ProfileUsage) -> bool {
    if profile.provider == "codex" {
        return codex_menu_bar_account(settings, &profile.id, profile.active);
    }
    profile.active && settings.active_workspace().is_some_and(|w| {
        w.shows_menu_bar_provider(&profile.provider) && match profile.provider.as_str() {
            "claude" => w.claude_account_ids.as_ref().is_none_or(|ids| ids.contains(&profile.id)),
            "antigravity" => w.antigravity_account_ids.contains(&profile.id),
            _ => false,
        }
    })
}

/// All account requests use their own saved login; none activate an account.
pub fn collect_profiles(settings: &AppSettings) -> Vec<ProfileUsage> {
    let data = crate::profiles::list().ok();
    let mut profiles: Vec<_> = data
        .map(|d| d.profiles)
        .unwrap_or_default()
        .into_iter()
        .filter(|p| {
            if !settings.contains_codex_account(&p.id) { return false; }
            let prefs = settings.codex_accounts.get(&p.id).cloned().unwrap_or_default();
            {
                (codex_cycle_enabled(settings) && prefs.auto_switch)
                    || (codex_menu_bar_account(settings, &p.id, p.active)
                        && settings.active_workspace().map_or(
                            prefs.menu_bar_enabled && !prefs.menu_bar_windows.is_empty(),
                            |workspace| workspace.usage.account_windows.get(&p.id).map_or(
                                workspace.usage.default_menu_bar_limits || !prefs.menu_bar_windows.is_empty(),
                                |windows| !windows.is_empty(),
                            ),
                        ))
            }
        })
        .collect();
    if let Some(workspace) = settings.active_workspace() {
        profiles.sort_by_key(|p| workspace.account_ids.iter().position(|id| id == &p.id));
    }
    let mut samples = std::thread::scope(|scope| {
        let jobs: Vec<_> = profiles
            .into_iter()
            .map(|p| {
                scope.spawn(move || ProfileUsage {
                    quota: if p.connected {
                        crate::profiles::quota_for(&p.id)
                    } else {
                        None
                    },
                    id: p.id,
                    name: p.name,
                    active: p.active,
                    provider: "codex".into(),
                })
            })
            .collect();
        jobs.into_iter()
            .filter_map(|j| j.join().ok())
            .collect::<Vec<_>>()
    });
    if settings.active_workspace().is_none_or(|w| w.shows_menu_bar_provider("claude")) {
    if let Ok(profiles) = crate::claude_profiles::list() {
        samples.extend(
            profiles
                .into_iter()
                .filter(|p| {
                    if let Some(w) = settings.active_workspace() {
                        w.claude_account_ids.as_ref().is_none_or(|ids| ids.contains(&p.profile.id))
                            && (w.shows_menu_bar_provider("claude"))
                    } else { settings.multi_profile.selected_ids.contains(&p.profile.id) }
                })
                .map(|p| ProfileUsage {
                    id: p.profile.id,
                    name: p.profile.name,
                    provider: "claude".into(),
                    active: p.active,
                    quota: p.quota,
                }),
        );
    }
    }
    let rotation = antigravity_cycle(settings);
    if let Some(workspace) = settings.active_workspace().filter(|w| rotation.is_some() || w.shows_menu_bar_provider("antigravity")) {
        if let Ok(accounts) = crate::antigravity::list() {
            let email = if accounts.is_empty() { None } else { crate::account_setup::current_google_email() };
            if let Some(active) = accounts.iter().find(|account| workspace.antigravity_account_ids.contains(&account.id)
                && account.email.as_deref().zip(email.as_deref()).is_some_and(|(saved, current)| saved.eq_ignore_ascii_case(current))) {
                let in_rotation = |id: &str| rotation.is_some_and(|w| w.usage.antigravity_switch_accounts.contains(id));
                let sample = |account: &crate::antigravity::Saved| ProfileUsage {
                    quota: crate::antigravity::card_quota(&account.id).ok(), active: account.id == active.id,
                    id: account.id.clone(), name: account.name.clone(), provider: "antigravity".into(),
                };
                if in_rotation(&active.id) || workspace.shows_menu_bar_provider("antigravity") {
                    let current = sample(active);
                    let cutoff = 100.0 - f64::from(workspace.usage.antigravity_switch_remaining);
                    let needs_backup = in_rotation(&active.id) && current.quota.as_ref()
                        .is_some_and(|quota| antigravity_switch_limits(quota, cutoff, time::OffsetDateTime::now_utc()).is_some());
                    let mut google = vec![current];
                    if needs_backup {
                        google.extend(std::thread::scope(|scope| {
                            let jobs: Vec<_> = accounts.iter().filter(|account| account.id != active.id
                                && workspace.antigravity_account_ids.contains(&account.id) && in_rotation(&account.id))
                                .map(|account| scope.spawn(|| sample(account))).collect();
                            jobs.into_iter().filter_map(|job| job.join().ok()).collect::<Vec<_>>()
                        }));
                        google.sort_by_key(|profile| workspace.antigravity_account_ids.iter().position(|id| id == &profile.id));
                    }
                    samples.extend(google);
                }
            }
        }
    }
    samples
}

/// Match panel initials: first/last letters, or two letters for a single name.
fn account_initials(name: &str) -> String {
    let words: Vec<_> = name.split_whitespace().filter(|part| part.chars().any(char::is_alphanumeric)).collect();
    let first = words.first().and_then(|word| word.chars().find(|c| c.is_alphanumeric()));
    let last = if words.len() > 1 {
        words.last().and_then(|word| word.chars().find(|c| c.is_alphanumeric()))
    } else {
        words.first().and_then(|word| word.chars().filter(|c| c.is_alphanumeric()).nth(1))
    };
    first.into_iter().chain(last).flat_map(char::to_uppercase).collect()
}

fn threshold_color(used: f64, thresholds: &[u8]) -> Option<[u8; 3]> {
    if !used.is_finite() { return None; }
    thresholds.iter().copied().filter(|level| used >= f64::from(*level)).max().map(|level| warning_color(f64::from(level)))
}

/// The status button can be light over a bright wallpaper even with dark app windows.
fn menu_bar_is_light(app: &AppHandle) -> bool {
    #[cfg(target_os = "macos")]
    if let Some(light) = app.tray_by_id("main").and_then(|tray| {
        tray.with_inner_tray_icon(|inner| {
            use objc2_app_kit::NSAppearanceCustomization;
            let item = inner.ns_status_item()?;
            let button = item.button(objc2::MainThreadMarker::new()?)?;
            Some(appearance_is_light(&button.effectiveAppearance()))
        }).ok().flatten()
    }) {
        return light;
    }
    app.get_webview_window("main").and_then(|window| window.theme().ok()) == Some(tauri::Theme::Light)
}

#[cfg(target_os = "macos")]
fn appearance_is_light(appearance: &objc2_app_kit::NSAppearance) -> bool {
    use objc2_app_kit::{NSAppearanceNameAqua, NSAppearanceNameDarkAqua};
    use objc2_foundation::NSArray;
    // Best-match resolution includes vibrancy and accessibility appearances.
    unsafe {
        appearance.bestMatchFromAppearancesWithNames(&NSArray::from_slice(&[
            NSAppearanceNameAqua, NSAppearanceNameDarkAqua,
        ])).is_some_and(|name| &*name == NSAppearanceNameAqua)
    }
}

/// Use a dark gold on light menu bars; retain bright yellow on dark menu bars.
fn readable_warning_color(color: [u8; 3], light: bool) -> [u8; 3] {
    if light && color == [255, 214, 10] { [138, 83, 0] } else { color }
}

fn tint_label(label: &mut crate::tray_text::Label, color: [u8; 3]) {
    label.color = color;
    for (_, metric_color) in &mut label.segments { *metric_color = color; }
    for metric in &mut label.metrics { metric.color = color; }
}

/// Let AppKit recolor neutral items even when only the wallpaper changes.
/// Colored warning images use the status button's current appearance for neutral ink.
fn apply_menu_bar_ink(labels: &mut [crate::tray_text::Label], accent: &mut [u8; 3], light: bool) -> bool {
    let template = *accent == DEFAULT_ACCENT && labels.iter().all(|label| {
        label.color == DEFAULT_ACCENT
            && label.segments.iter().all(|(_, color)| *color == DEFAULT_ACCENT)
            && label.metrics.iter().all(|metric| metric.color == DEFAULT_ACCENT)
    });
    let ink = if template { TEMPLATE_INK } else if light { DEFAULT_ACCENT } else { DARK_BAR_INK };
    let adapt = |color: &mut [u8; 3]| {
        if *color == DEFAULT_ACCENT { *color = ink; }
    };
    adapt(accent);
    for label in labels {
        adapt(&mut label.color);
        for (_, color) in &mut label.segments { adapt(color); }
        for metric in &mut label.metrics { adapt(&mut metric.color); }
    }
    template
}

fn warning_color(used: f64) -> [u8; 3] {
    if used >= 95.0 { [255, 69, 58] } else if used >= 90.0 { [255, 159, 10] } else if used >= 75.0 { [255, 214, 10] } else { [48, 184, 107] }
}

/// Never switch on missing, stale, expired or model-specific data.
fn auto_switch_target<'a>(
    profiles: &'a [ProfileUsage],
    settings: &AppSettings,
    now: time::OffsetDateTime,
) -> Option<(&'a ProfileUsage, &'a ProfileUsage, String)> {
    let active_index = profiles
        .iter()
        .position(|p| p.active && p.provider == "codex")?;
    let active = &profiles[active_index];
    if !settings.contains_codex_account(&active.id) || !settings.codex_accounts.get(&active.id).is_some_and(|p| p.auto_switch) { return None; }
    let data = active.quota.as_ref().filter(|q| q.error.is_none())?;
    let window = data.windows.as_ref()?.iter().find(|w| {
        canonical_account_window(&w.window).is_some() && current_window(w, now)
            && w.percent >= 100.0 - f64::from(settings.active_workspace().map_or(2, |w| w.usage.auto_switch_remaining)) && w.resets_at.as_deref()
                .and_then(|v| crate::timestamps::parse_rfc3339(v).ok()).is_some_and(|reset| reset > now)
    })?;
    let period = window.resets_at.clone()?;
    for offset in 1..profiles.len() {
        let candidate = &profiles[(active_index + offset) % profiles.len()];
        if candidate.provider != "codex" || !settings.contains_codex_account(&candidate.id) || !settings.codex_accounts.get(&candidate.id).is_some_and(|p| p.auto_switch) {
            continue;
        }
        let Some(data) = candidate.quota.as_ref() else {
            continue;
        };
        if data.error.is_some() { continue; }
        if data.windows.iter().flatten().any(|w| canonical_account_window(&w.window).is_some() && !current_window(w, now)) { continue; }
        let windows: Vec<_> = data.windows.iter().flatten()
            .filter(|w| canonical_account_window(&w.window).is_some() && current_window(w, now)).collect();
        let known = &settings.codex_accounts[&candidate.id].known_windows;
        if !windows.is_empty() && windows.iter().all(|w| w.percent < 100.0 - f64::from(settings.active_workspace().map_or(2, |w| w.usage.auto_switch_remaining)))
            && known.iter().all(|kind| windows.iter().any(|w| canonical_account_window(&w.window).as_ref() == Some(kind))) {
            return Some((active, candidate, period));
        }
    }
    None
}

fn antigravity_windows(quota: &QuotaSet) -> Option<&[QuotaWindow]> {
    if quota.provider != "antigravity" || quota.error.is_some() { return None; }
    quota.windows.as_deref()
}

fn antigravity_has_capacity(
    quota: &QuotaSet, limits: &[&str], cutoff: f64, now: time::OffsetDateTime,
) -> bool {
    antigravity_windows(quota).is_some_and(|windows| {
        limits.iter().all(|limit| windows.iter().any(|window| &window.window == limit))
            && windows.iter().filter(|window| is_gemini_limit(&window.window))
                .all(|window| current_window(window, now) && (0.0..cutoff).contains(&window.percent))
    })
}

fn is_gemini_limit(label: &str) -> bool {
    label == "Gemini" || label.starts_with("Gemini ")
}

fn antigravity_switch_limits(
    quota: &QuotaSet, cutoff: f64, now: time::OffsetDateTime,
) -> Option<(Vec<&str>, time::OffsetDateTime)> {
    let measured = antigravity_windows(quota)?;
    let depleted: Vec<_> = measured.iter().filter(|window| {
        is_gemini_limit(&window.window) && current_window(window, now) && (cutoff..=100.0).contains(&window.percent)
    }).collect();
    let reset = depleted.iter().filter_map(|window| {
        crate::timestamps::parse_rfc3339(window.resets_at.as_deref()?).ok().filter(|reset| *reset > now)
    }).max()?;
    // Preserve capacity for other limits in every affected model family, such
    // as a weekly limit when the five-hour limit is the one that triggered.
    let family = |label: &str| label.rsplit_once(" · ").map_or(label, |(family, _)| family).to_owned();
    let families: std::collections::BTreeSet<_> = depleted.iter().map(|w| family(&w.window)).collect();
    let limits: Vec<_> = measured.iter().filter(|w| families.contains(&family(&w.window)))
        .map(|window| window.window.as_str()).collect();
    Some((limits, reset))
}

fn antigravity_switch_target<'a>(
    profiles: &'a [ProfileUsage], workspace: &crate::workspaces::Workspace, now: time::OffsetDateTime,
) -> Option<(&'a ProfileUsage, &'a ProfileUsage, Vec<&'a str>, time::OffsetDateTime)> {
    let enrolled = |profile: &ProfileUsage| {
        profile.provider == "antigravity"
            && workspace.antigravity_account_ids.contains(&profile.id)
            && workspace.usage.antigravity_switch_accounts.contains(&profile.id)
    };
    let index = profiles.iter().position(|p| p.active && enrolled(p))?;
    let source = &profiles[index];
    let cutoff = 100.0 - f64::from(workspace.usage.antigravity_switch_remaining);
    let (limits, reset) = antigravity_switch_limits(source.quota.as_ref()?, cutoff, now)?;
    let target = (1..profiles.len()).map(|offset| &profiles[(index + offset) % profiles.len()])
        .find(|candidate| !candidate.active && enrolled(candidate)
            && candidate.quota.as_ref().is_some_and(|quota| antigravity_has_capacity(quota, &limits, cutoff, now)))?;
    Some((source, target, limits, reset))
}

fn run_antigravity_switch(
    app: &AppHandle, workspace: &crate::workspaces::Workspace, source: &ProfileUsage, target: &ProfileUsage,
    limits: &[&str], reset: time::OffsetDateTime,
) {
    use tauri_plugin_notification::NotificationExt;
    let mut changed = false;
    let result = (|| {
        let email = crate::antigravity::list()?.into_iter().find(|account| account.id == source.id)
            .and_then(|account| account.email).ok_or("The active Antigravity account is unavailable.")?;
        let cutoff = 100.0 - f64::from(workspace.usage.antigravity_switch_remaining);
        crate::antigravity::activate_with(&target.id, true, |login, quota| {
            if !crate::account_setup::current_google_email().is_some_and(|active| active.eq_ignore_ascii_case(&email)) {
                return Err("The active Antigravity login changed. Auto-switch was skipped.".into());
            }
            let (saved, ()) = crate::settings::try_update_settings(&crate::paths::settings_file(), |settings| {
                let current = antigravity_cycle(settings).filter(|current| current.id == workspace.id
                    && current.usage.antigravity_switch_remaining == workspace.usage.antigravity_switch_remaining)
                    .ok_or("Antigravity auto-switch settings changed.")?;
                if [&source.id, &target.id].iter().any(|id| !current.antigravity_account_ids.contains(id)
                    || !current.usage.antigravity_switch_accounts.contains(*id)) {
                    return Err("Antigravity rotation accounts changed.".into());
                }
                let now = time::OffsetDateTime::now_utc();
                if now >= reset || !antigravity_has_capacity(&quota, limits, cutoff, now) {
                    return Err("Antigravity quota changed. Auto-switch was skipped.".into());
                }
                crate::antigravity::write_shared_login(login)?;
                changed = true;
                crate::workspaces::record_account_switch(settings, "antigravity", &target.id);
                Ok(())
            })?;
            Ok(saved)
        })
    })();
    let monitor = app.state::<MenuBarMonitor>();
    if let Ok(saved) = &result { monitor.update(app, saved.clone()); }
    if changed {
        monitor.provider_changed(app, "antigravity");
        let _ = app.emit("antigravity-account-switched", ());
    }
    let (title, body) = match result {
        Ok(_) => ("Orbilap · Antigravity account switched", format!("Switched from {} to {}. Reopen any running Antigravity or AGY session to use this account.", source.name, target.name)),
        Err(_) if changed => ("Orbilap · Antigravity account switched", "The login changed, but workspace preferences could not be saved. Reopen any running Antigravity or AGY session to use the new account.".into()),
        Err(error) => ("Orbilap · Antigravity auto-switch unavailable", error),
    };
    let _ = app.notification().builder().title(title).body(body).show();
}

fn selected_color(
    settings: &AppSettings,
    data: Option<&QuotaSet>,
    now: time::OffsetDateTime,
) -> [u8; 3] {
    let Some(data) = data else {
        return DEFAULT_ACCENT;
    };
    let window = data.windows.as_ref().and_then(|ws| {
        ws.iter()
            .filter(|w| {
                current_window(w, now)
                    && window_kind(&w.window).is_some_and(|kind| {
                        settings.menu_bar_window == MenuBarWindow::Auto
                            || kind == settings.menu_bar_window
                    })
            })
            .max_by(|a, b| a.percent.total_cmp(&b.percent))
    });
    let Some(window) = window.filter(|_| data.error.is_none()) else {
        return DEFAULT_ACCENT;
    };
    let used = window.percent;
    if used >= 95.0 {
        [255, 69, 58]
    } else if used >= 90.0 {
        [255, 159, 10]
    } else if used >= 75.0 {
        [255, 214, 10]
    } else {
        DEFAULT_ACCENT
    }
}

fn window_kind(window: &str) -> Option<MenuBarWindow> {
    match window.to_ascii_lowercase().as_str() {
        "rolling" | "5-hour" => Some(MenuBarWindow::FiveHour),
        "weekly" => Some(MenuBarWindow::Weekly),
        "monthly" => Some(MenuBarWindow::Monthly),
        _ => None,
    }
}

fn window_label(window: MenuBarWindow) -> &'static str {
    match window {
        MenuBarWindow::Auto => "",
        MenuBarWindow::FiveHour => "5h",
        MenuBarWindow::Weekly => "1w",
        MenuBarWindow::Monthly => "1mo",
    }
}

fn current_window(window: &QuotaWindow, now: time::OffsetDateTime) -> bool {
    window.percent.is_finite()
        && !window
            .resets_at
            .as_deref()
            .and_then(|iso| crate::timestamps::parse_rfc3339(iso).ok())
            .is_some_and(|reset| reset <= now)
}

/// Match Codex's Math.round(remaining): formatting alone rounds ties to even.
fn remaining_percent(used: f64) -> f64 {
    (100.0 - used).clamp(0.0, 100.0).round()
}

/// Always show remaining capacity for Codex, regardless of popup wording.
fn usage_title(
    settings: &AppSettings,
    quota: Option<&QuotaSet>,
    now: time::OffsetDateTime,
) -> String {
    if !settings.menu_bar_enabled {
        return String::new();
    }
    let provider = settings.menu_bar_provider;
    let quota = quota.filter(|q| q.provider == provider.id());
    let selected = quota
        .filter(|q| q.error.is_none())
        .and_then(|q| q.windows.as_ref())
        .and_then(|windows| {
            windows
                .iter()
                .filter(|w| current_window(w, now))
                .filter(|w| {
                    window_kind(&w.window).is_some_and(|kind| {
                        settings.menu_bar_window == MenuBarWindow::Auto
                            || kind == settings.menu_bar_window
                    })
                })
                .max_by(|a, b| a.percent.total_cmp(&b.percent))
        });
    let Some(window) = selected else {
        let short = window_label(settings.menu_bar_window);
        return if short.is_empty() || !settings.usage_appearance.show_labels {
            "—".into()
        } else {
            format!("{short} —")
        };
    };
    let short = window_label(window_kind(&window.window).expect("filtered supported window"));
    let value = if provider == MenuBarProvider::Codex || settings.usage_appearance.show_remaining {
        100.0 - window.percent
    } else {
        window.percent
    };
    let remaining = if provider == MenuBarProvider::Codex {
        remaining_percent(window.percent)
    } else {
        (value.clamp(0.0, 100.0) * 10.0).round() / 10.0
    };
    let percent = if remaining.fract() == 0.0 {
        format!("{remaining:.0}")
    } else {
        format!("{remaining:.1}")
    };
    if settings.usage_appearance.show_labels {
        format!("{short} {percent}%")
    } else {
        format!("{percent}%")
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::settings::MenuBarProvider;

    #[test]
    fn fresh_card_readings_do_not_discard_other_providers_from_an_inflight_probe() {
        let workspace = serde_json::from_value(serde_json::json!({"id":"studio","name":"Studio","accent":"#007aff","accountIds":["cx"],"antigravityAccountIds":["ag"],"usage":{"menuBarProviders":["codex","antigravity"]}})).unwrap();
        let settings = AppSettings { workspaces: vec![workspace], active_workspace_id: Some("studio".into()), ..Default::default() };
        let profile = |provider: &str, id: &str, used: f64| ProfileUsage { id: id.into(), name: id.into(), provider: provider.into(), active: true, quota: Some(quota(&[("weekly",used)])) };
        let fresh = profile("antigravity","ag",42.0);
        let mut state = MenuBarState { provider_updates: Default::default(), settings, quota: None, profiles: vec![], generation: 0 };
        assert!(state.card_usage(0,fresh));
        assert!(state.accept_collection(0,None,vec![profile("codex","cx",20.0),profile("antigravity","ag",10.0)]));
        assert_eq!(state.profiles.len(),2);
        assert_eq!(state.profiles.iter().find(|p| p.provider == "antigravity").unwrap().quota.as_ref().unwrap().windows.as_ref().unwrap()[0].percent,42.0);
        state.provider_changed("codex");
        assert!(state.accept_collection(0,None,vec![profile("codex","cx",99.0)]));
        assert!(state.profiles.iter().all(|p| p.provider != "codex"));
        state.invalidate_all();
        assert!(!state.accept_collection(0,None,vec![]));
    }

    #[test]
    fn multiple_provider_limits_follow_active_members_in_stable_groups() {
        let workspace = serde_json::from_value(serde_json::json!({
            "id":"studio", "name":"Studio", "accent":"#007aff", "accountIds":["cx","backup"],
            "claudeAccountIds":["cl"], "antigravityAccountIds":["ag"],
            "usage":{"menuBarProviders":["antigravity","claude","codex"],"accountWindows":{"cx":["weekly"],"cl":["5-hour"],"ag":["Gemini 4 Carbon · Weekly"]}}
        })).unwrap();
        let mut settings = AppSettings { workspaces: vec![workspace], active_workspace_id: Some("studio".into()), ..Default::default() };
        let profile = |provider: &str, id: &str| ProfileUsage { id: id.into(), name: id.into(), provider: provider.into(), active: true, quota: None };
        let profiles = vec![profile("antigravity","ag"), profile("claude","cl"), profile("codex","cx"), ProfileUsage { active: false, ..profile("codex","backup") }, profile("claude","outside")];
        let now = time::OffsetDateTime::now_utc();
        let (labels, _) = menu_bar_labels(&settings, &profiles, now, false);
        assert_eq!(labels.iter().filter_map(|l| l.provider.as_deref()).collect::<Vec<_>>(), ["codex","claude","antigravity"]);
        assert!(labels.iter().all(|l| l.show_provider));
        settings.workspaces[0].usage.show_provider_logos = Some(false);
        assert!(menu_bar_labels(&settings, &profiles, now, false).0.iter().all(|l| !l.show_provider));
        settings.workspaces[0].usage.show_provider_logos = None;
        assert!(labels.iter().all(|l| l.text.contains('—')), "unknown usage stays distinct from zero");
        assert!(labels[2].text.contains("Ca 1w"));
        for style in [crate::settings::MenuBarStyle::Percentages, crate::settings::MenuBarStyle::Progress, crate::settings::MenuBarStyle::ResetTimeline] {
            assert!(crate::tray_text::render(&labels, true, DEFAULT_ACCENT, style, true, false).is_some());
        }
        settings.workspaces[0].usage.menu_bar_providers = Some(vec!["claude".into()]);
        let (labels, _) = menu_bar_labels(&settings, &profiles, now, true);
        assert_eq!(labels.len(), 1); assert!(!labels[0].show_provider);
        settings.workspaces[0].usage.show_provider_logos = Some(true);
        assert!(menu_bar_labels(&settings, &profiles, now, true).0[0].show_provider);
        settings.workspaces[0].usage.menu_bar_providers = Some(vec![]);
        assert!(menu_bar_labels(&settings, &profiles, now, true).0.is_empty());
        settings.workspaces[0].usage.menu_bar_providers = Some(vec!["codex".into(),"claude".into()]);
        settings.workspaces[0].usage.menu_bar_enabled = false;
        assert!(menu_bar_labels(&settings, &profiles, now, false).0.is_empty());
    }

    #[test]
    fn reset_fraction_uses_known_windows_and_rejects_unreliable_resets() {
        let now = time::OffsetDateTime::now_utc();
        for (kind, duration) in [("5-hour", 18_000_000), ("rolling", 18_000_000), ("Weekly", 604_800_000)] {
            let mut window = quota(&[(kind, 30.0)]).windows.unwrap().remove(0);
            window.resets_at = Some(crate::timestamps::format_rfc3339(now + time::Duration::milliseconds(duration / 4)));
            assert_eq!(time_remaining_fraction(&window, now), Some(0.25));
            window.resets_at = Some(crate::timestamps::format_rfc3339(now + time::Duration::milliseconds(duration + 1)));
            assert_eq!(time_remaining_fraction(&window, now), None);
            window.resets_at = Some(crate::timestamps::format_rfc3339(now)); assert_eq!(time_remaining_fraction(&window, now), None);
            window.resets_at = Some("invalid".into()); assert_eq!(time_remaining_fraction(&window, now), None);
            window.resets_at = None; assert_eq!(time_remaining_fraction(&window, now), None);
        }
        let monthly = quota(&[("monthly", 30.0)]).windows.unwrap().remove(0);
        assert_eq!(time_remaining_fraction(&monthly, now), None);
    }

    #[test]
    #[cfg(target_os = "macos")]
    fn native_menu_bar_appearance_resolves_light_dark_and_accessibility_variants() {
        use objc2_app_kit::{NSAppearance, NSAppearanceNameAqua, NSAppearanceNameDarkAqua,
            NSAppearanceNameVibrantLight, NSAppearanceNameVibrantDark,
            NSAppearanceNameAccessibilityHighContrastAqua, NSAppearanceNameAccessibilityHighContrastDarkAqua};
        unsafe {
            for (name, light) in [
                (NSAppearanceNameAqua, true), (NSAppearanceNameDarkAqua, false),
                (NSAppearanceNameVibrantLight, true), (NSAppearanceNameVibrantDark, false),
                (NSAppearanceNameAccessibilityHighContrastAqua, true),
                (NSAppearanceNameAccessibilityHighContrastDarkAqua, false),
            ] {
                let appearance = NSAppearance::appearanceNamed(name).expect("macOS appearance must exist");
                assert_eq!(appearance_is_light(&appearance), light, "{name}");
            }
        }
    }

    #[test]
    fn yellow_warning_has_readable_light_and_dark_variants_and_one_shared_tint() {
        let luminance = |color: [u8; 3]| {
            let linear = |channel: u8| { let value = f64::from(channel) / 255.0; if value <= 0.04045 { value / 12.92 } else { ((value + 0.055) / 1.055).powf(2.4) } };
            0.2126 * linear(color[0]) + 0.7152 * linear(color[1]) + 0.0722 * linear(color[2])
        };
        for (light, background) in [(true, [225, 225, 225]), (false, [65, 65, 65])] {
            let color = readable_warning_color(warning_color(75.0), light);
            let (a, b) = (luminance(color), luminance(background));
            assert!((a.max(b) + 0.05) / (a.min(b) + 0.05) >= 4.5);
            let profile = ProfileUsage { id: "emma".into(), name: "Emma Brooks".into(), active: true, provider: "codex".into(), quota: Some(quota(&[("weekly", 80.0)])) };
            let prefs = CodexAccountPreferences { warning_colors: true, menu_bar_windows: vec!["weekly".into()], ..Default::default() };
            let mut label = account_label(&profile, &prefs, &[75, 90, 95], true, time::OffsetDateTime::now_utc());
            tint_label(&mut label, color);
            assert_eq!(label.color, color); assert!(label.segments.iter().all(|(_, c)| *c == color)); assert!(label.metrics.iter().all(|m| m.color == color));
            if let Ok(path) = std::env::var("ORBILAP_TEST_WARNING_PALETTE") {
                for (style_name, style) in [("percentages", crate::settings::MenuBarStyle::Percentages), ("progress", crate::settings::MenuBarStyle::Progress)] {
                    let image = crate::tray_text::render(&[label.clone()], true, color, style, true, false).unwrap();
                    let name = format!("{path}-{}-{style_name}", if light { "light" } else { "dark" });
                    std::fs::write(format!("{name}.rgba"), image.rgba()).unwrap();
                    std::fs::write(format!("{name}.json"), format!("[{},{}]", image.width(), image.height())).unwrap();
                }
            }
        }
        assert_eq!(readable_warning_color(warning_color(95.0), true), warning_color(95.0));
    }

    #[test]
    fn legacy_provider_colors_do_not_override_the_shared_accent_or_warnings() {
        let mut settings = AppSettings { menu_bar_provider: MenuBarProvider::Claude, ..Default::default() };
        settings.provider_accents.insert("claude".into(), "#7c6cf0".into());
        assert_eq!(selected_color(&settings, Some(&quota(&[("5-hour", 20.0)])), time::OffsetDateTime::now_utc()), DEFAULT_ACCENT);
        assert_eq!(selected_color(&settings, Some(&quota(&[("5-hour", 96.0)])), time::OffsetDateTime::now_utc()), [255, 69, 58]);
    }

    #[test]
    fn every_accent_preserves_the_original_transparent_mark() {
        let original = Image::from_bytes(ICON).unwrap();
        for accent in [DEFAULT_ACCENT, [47, 158, 110], [194, 106, 43], [124, 108, 240]] {
            let image = render(accent);
            assert_eq!((image.width(), image.height()), (original.width(), original.height()));
            for (pixel, source) in image.rgba().chunks_exact(4).zip(original.rgba().chunks_exact(4)) {
                assert_eq!(&pixel[..3], &accent);
                assert_eq!(pixel[3], source[3]);
            }
        }
    }

    fn settings(window: MenuBarWindow) -> AppSettings {
        AppSettings {
            menu_bar_enabled: true,
            menu_bar_window: window,
            ..Default::default()
        }
    }

    fn quota(windows: &[(&str, f64)]) -> QuotaSet {
        QuotaSet {
            provider: "codex".into(),
            error: None,
            reset_credits: None, as_of: None,
            windows: Some(
                windows
                    .iter()
                    .map(|(window, percent)| QuotaWindow {
                        window: (*window).into(),
                        percent: *percent,
                        resets_at: None,
                        status: None,
                    })
                    .collect(),
            ),
        }
    }

    #[test]
    fn antigravity_card_updates_tray_without_waiting_for_another_probe() {
        let workspace = serde_json::from_value(serde_json::json!({"id":"studio","name":"Studio","accent":"#007aff","accountIds":[],"antigravityAccountIds":["google"],"usage":{"menuBarEnabled":true,"menuBarProvider":"antigravity"}})).unwrap();
        let settings = AppSettings { active_workspace_id: Some("studio".into()), workspaces: vec![workspace], ..Default::default() };
        let mut reading = quota(&[("Gemini 4 Carbon · Weekly", 20.0)]);
        reading.provider = "antigravity".into();
        let profile = ProfileUsage { id:"google".into(), name:"Google".into(), provider:"antigravity".into(), active:true, quota:Some(reading) };
        let mut state = MenuBarState { provider_updates: Default::default(), settings, quota:None, profiles:vec![profile.clone()], generation:7 };
        let mut identity = profile.clone(); identity.quota = None;
        assert!(state.active_profile(7, Some(identity)));
        assert_eq!(state.generation, 7);
        assert!(state.profiles[0].quota.is_some(), "Reloading the same account hid its existing limits");
        state.provider_changed("codex");
        assert_eq!(state.profiles.len(), 1, "Codex refresh erased Antigravity's visible limits");
        assert_eq!(state.generation, 7, "Codex refresh invalidated the in-flight Antigravity card");
        let mut fresh = profile.clone();
        fresh.quota.as_mut().unwrap().windows.as_mut().unwrap()[0].percent = 42.0;
        assert!(state.card_usage(7, fresh));
        assert_eq!(state.profiles[0].quota.as_ref().unwrap().windows.as_ref().unwrap()[0].percent, 42.0);
        assert!(!state.accept(7, None), "A slower tray request overwrote the fresh card");
        let mut inactive = profile.clone(); inactive.active = false;
        assert!(!state.card_usage(8, inactive));
        let mut foreign = profile.clone(); foreign.id = "other-workspace".into();
        assert!(!state.card_usage(8, foreign));
        state.provider_changed("antigravity");
        assert!(state.profiles.is_empty());
        assert!(!state.card_usage(8, profile), "A superseded card result was accepted");
        assert!(state.active_profile(9, None));
        assert!(state.profiles.is_empty(), "A signed-out account retained visible usage");
    }

    #[test]
    fn default_menu_bar_limits_follow_reported_support_and_respect_opt_out() {
        let mut app: AppSettings = serde_json::from_value(serde_json::json!({
            "activeWorkspaceId": "studio",
            "workspaces": [{
                "id": "studio", "name": "Studio", "accent": "#007aff", "accountIds": ["one"],
                "usage": { "defaultMenuBarLimits": true }
            }]
        })).unwrap();
        let both = quota(&[("rolling", 23.5), ("Weekly", 81.0), ("monthly", 50.0)]);
        let weekly = quota(&[("weekly", 81.0)]);
        assert_eq!(menu_bar_account_preferences(&app, "one", Some(&both)).menu_bar_windows, ["5-hour", "weekly"]);
        assert_eq!(menu_bar_account_preferences(&app, "one", Some(&weekly)).menu_bar_windows, ["weekly"]);
        assert!(menu_bar_account_preferences(&app, "one", None).menu_bar_windows.is_empty());

        app.workspaces[0].usage.account_windows.insert("one".into(), vec![]);
        assert!(menu_bar_account_preferences(&app, "one", Some(&both)).menu_bar_windows.is_empty());
    }

    #[test]
    fn selected_windows_show_remaining_and_normalize_provider_labels() {
        let data = quota(&[("rolling", 23.5), ("Weekly", 81.0), ("monthly", 50.0)]);
        for (window, expected) in [
            (MenuBarWindow::FiveHour, "5h 77%"),
            (MenuBarWindow::Weekly, "1w 19%"),
            (MenuBarWindow::Monthly, "1mo 50%"),
        ] {
            assert_eq!(
                usage_title(&settings(window), Some(&data), time::OffsetDateTime::now_utc()),
                expected
            );
        }
    }

    #[test]
    fn auto_selects_the_tightest_supported_limit() {
        let data = quota(&[
            ("5-hour", 20.0),
            ("Weekly", 91.0),
            ("monthly", 70.0),
            ("gpt-reserve", 100.0),
            ("Opus weekly", 99.0),
        ]);
        assert_eq!(
            usage_title(
                &settings(MenuBarWindow::Auto),
                Some(&data),
                time::OffsetDateTime::now_utc()
            ),
            "1w 9%"
        );
    }

    #[test]
    fn missing_windows_and_errors_never_fall_back_to_another_limit() {
        let mut data = quota(&[("5-hour", 12.0)]);
        let app = settings(MenuBarWindow::Monthly);
        assert_eq!(
            usage_title(&app, Some(&data), time::OffsetDateTime::now_utc()),
            "1mo —"
        );
        data.error = Some("session expired".into());
        let title = usage_title(
            &settings(MenuBarWindow::FiveHour),
            Some(&data),
            time::OffsetDateTime::now_utc(),
        );
        assert_eq!(title, "5h —");
        data.error = None;
        data.provider = "claude".into();
        assert_eq!(
            usage_title(
                &settings(MenuBarWindow::FiveHour),
                Some(&data),
                time::OffsetDateTime::now_utc()
            ),
            "5h —"
        );
    }

    #[test]
    fn invalid_percentages_are_unavailable_and_capacity_is_clamped() {
        for (used, expected) in [
            (-10.0, "5h 100%"),
            (120.0, "5h 0%"),
            (f64::NAN, "5h —"),
            (f64::INFINITY, "5h —"),
        ] {
            let data = quota(&[("5-hour", used)]);
            assert_eq!(
                usage_title(
                    &settings(MenuBarWindow::FiveHour),
                    Some(&data),
                    time::OffsetDateTime::now_utc()
                ),
                expected
            );
        }
    }

    #[test]
    fn elapsed_resets_are_unavailable() {
        let now = time::OffsetDateTime::now_utc();
        let mut data = quota(&[("5-hour", 30.0), ("Weekly", 20.0)]);
        data.windows.as_mut().unwrap()[0].resets_at =
            Some(crate::timestamps::format_rfc3339(now - time::Duration::seconds(1)));
        assert_eq!(
            usage_title(&settings(MenuBarWindow::FiveHour), Some(&data), now),
            "5h —"
        );
        let title = usage_title(&settings(MenuBarWindow::Auto), Some(&data), now);
        assert_eq!(title, "1w 80%");
    }

    #[test]
    fn disabling_clears_the_title_and_ignores_popup_wording() {
        let data = quota(&[("5-hour", 20.0)]);
        assert_eq!(
            usage_title(&AppSettings::default(), Some(&data), time::OffsetDateTime::now_utc()),
            ""
        );
        let mut app = settings(MenuBarWindow::FiveHour);
        for remaining_mode in [true, false] {
            app.usage_show_remaining = remaining_mode;
            assert_eq!(
                usage_title(&app, Some(&data), time::OffsetDateTime::now_utc()),
                "5h 80%"
            );
        }
    }

    #[test]
    fn provider_changes_discard_in_flight_results_and_window_changes_use_cache() {
        let mut state = MenuBarState { provider_updates: Default::default(),
            settings: settings(MenuBarWindow::FiveHour),
            quota: Some(quota(&[("5-hour", 20.0), ("Weekly", 70.0)])),
            profiles: Vec::new(),
            generation: 0,
        };
        state.update(settings(MenuBarWindow::Weekly));
        assert_eq!(state.generation, 0);
        assert_eq!(
            usage_title(&state.settings, state.quota.as_ref(), time::OffsetDateTime::now_utc()),
            "1w 30%"
        );
        let mut next = settings(MenuBarWindow::Weekly);
        next.menu_bar_provider = MenuBarProvider::Claude;
        state.update(next);
        assert!(state.quota.is_none());
        assert!(!state.accept(0, Some(quota(&[("Weekly", 90.0)]))));
        assert!(state.quota.is_none());
        assert!(state.accept(1, None));
    }

    #[test]
    fn percentage_wording_and_labels_are_independent_of_popup_preferences() {
        let data = quota(&[("5-hour", 23.5)]);
        let mut app = settings(MenuBarWindow::FiveHour);
        app.usage_appearance.show_labels = false;
        app.usage_appearance.show_remaining = false;
        let title = usage_title(&app, Some(&data), time::OffsetDateTime::now_utc());
        assert_eq!(title, "77%");
        app.usage_appearance.show_remaining = true;
        assert_eq!(
            usage_title(&app, Some(&data), time::OffsetDateTime::now_utc()),
            "77%"
        );
    }

    #[test]
    fn auto_switch_skips_unavailable_exhausted_and_unrelated_accounts() {
        let now = time::OffsetDateTime::now_utc();
        let profile = |id: &str, active: bool, used: f64, weekly: f64| {
            let mut quota = quota(&[("5-hour", used), ("Weekly", weekly)]);
            quota.windows.as_mut().unwrap()[0].resets_at =
                Some(crate::timestamps::format_rfc3339(now + time::Duration::hours(2)));
            ProfileUsage {
                id: id.into(),
                name: id.into(),
                active,
                provider: "codex".into(),
                quota: Some(quota),
            }
        };
        let mut samples = vec![
            profile("work", true, 100.0, 20.0),
            profile("limited", false, 10.0, 100.0),
            profile("available", false, 25.0, 50.0),
        ];
        let mut prefs = AppSettings::default();
        for sample in &samples { prefs.codex_accounts.insert(sample.id.clone(), CodexAccountPreferences { auto_switch: true, ..Default::default() }); }
        let (_, target, _) = auto_switch_target(&samples, &prefs, now).expect("available account");
        assert_eq!(target.id, "available");
        samples[2].quota.as_mut().unwrap().error = Some("expired login".into());
        assert!(auto_switch_target(&samples, &prefs, now).is_none());
        samples[1].provider = "claude".into();
        assert!(auto_switch_target(&samples, &prefs, now).is_none());
        samples[0].quota.as_mut().unwrap().windows.as_mut().unwrap()[0].percent = 99.0;
        assert!(auto_switch_target(&samples, &prefs, now).is_none());
    }

    #[test]
    fn antigravity_rotation_requires_matching_quota_and_workspace_enrollment() {
        let now = time::OffsetDateTime::now_utc();
        let reset = crate::timestamps::format_rfc3339(now + time::Duration::hours(1));
        let workspace: crate::workspaces::Workspace = serde_json::from_value(serde_json::json!({
            "id":"studio", "name":"Studio", "accent":"#007aff", "accountIds":[],
            "antigravityAccountIds":["active","wrong-model","limited","backup"],
            "usage":{"menuBarEnabled":false,"antigravityAutoSwitch":true,
                "antigravitySwitchAccounts":["active","wrong-model","limited","backup","outside"]}
        })).unwrap();
        let settings = AppSettings { active_workspace_id: Some(workspace.id.clone()),
            workspaces: vec![workspace.clone()], ..Default::default() };
        assert!(monitoring_enabled(&settings));
        let sample = |id: &str, active, values: &[(&str, f64)]| {
            let mut usage = quota(values);
            usage.provider = "antigravity".into();
            if active { usage.windows.as_mut().unwrap()[0].resets_at = Some(reset.clone()); }
            ProfileUsage { id: id.into(), name: id.into(), active, provider: "antigravity".into(), quota: Some(usage) }
        };
        let five_hour = "Gemini 4 Carbon · 5-hour";
        let weekly = "Gemini 4 Carbon · Weekly";
        let mut profiles = vec![
            sample("active", true, &[(five_hour, 98.0), (weekly, 40.0)]),
            sample("wrong-model", false, &[("Gemini 4 Argon · 5-hour", 20.0)]),
            sample("limited", false, &[(five_hour, 20.0), (weekly, 99.0)]),
            sample("outside", false, &[(five_hour, 20.0), (weekly, 30.0)]),
            sample("backup", false, &[(five_hour, 20.0), (weekly, 30.0)]),
        ];
        assert_eq!(antigravity_switch_target(&profiles, &workspace, now).unwrap().1.id, "backup");
        assert!(antigravity_switch_target(&profiles, &workspace, now + time::Duration::hours(2)).is_none());
        profiles.pop();
        assert!(antigravity_switch_target(&profiles, &workspace, now).is_none());
    }

    #[test]
    fn menu_bar_follows_only_the_live_codex_member() {
        let mut settings = AppSettings::default();
        settings.active_workspace_id = Some("studio".into());
        settings.workspaces.push(serde_json::from_value(serde_json::json!({
            "id":"studio", "name":"Studio", "accent":"#007aff",
            "accountIds":["live", "backup"],
            "usage":{"menuBarAccountId":"backup", "activeAccounts":{"codex":"backup"}}
        })).unwrap());
        assert!(codex_menu_bar_account(&settings, "live", true));
        assert!(!codex_menu_bar_account(&settings, "backup", false));
        assert!(!codex_menu_bar_account(&settings, "outside", true));
        // An account switch follows the new login despite stale saved selections.
        assert!(!codex_menu_bar_account(&settings, "live", false));
        assert!(codex_menu_bar_account(&settings, "backup", true));
        settings.workspaces[0].usage.menu_bar_enabled = false;
        assert!(!codex_menu_bar_account(&settings, "live", true));
        settings.active_workspace_id = None;
        settings.menu_bar_enabled = true;
        settings.codex_display_mode = crate::settings::CodexDisplayMode::Selected;
        assert!(codex_menu_bar_account(&settings, "live", true));
        assert!(!codex_menu_bar_account(&settings, "backup", false));
    }

    #[test]
    fn codex_low_remaining_percentage_rounds_up_at_half_points() {
        let now = time::OffsetDateTime::now_utc();
        let prefs = CodexAccountPreferences {
            menu_bar_windows: vec!["5-hour".into()],
            ..Default::default()
        };
        let profile = ProfileUsage {
            id: "personal".into(), name: "Personal".into(), active: true,
            provider: "codex".into(), quota: Some(quota(&[("5-hour", 93.5)])),
        };
        assert_eq!(account_label(&profile, &prefs, &[], true, now).text, "5h 7%");
    }

    #[test]
    fn legacy_workspace_accent_does_not_recolor_cached_metrics_or_icon() {
        assert_eq!(DEFAULT_ACCENT, [28, 28, 28], "default menu-bar ink must match dark home cards");
        let mut app = AppSettings::default();
        app.active_workspace_id = Some("studio".into());
        app.codex_accounts.insert("emma".into(), CodexAccountPreferences { color:"#007aff".into(), ..Default::default() });
        app.workspaces.push(serde_json::from_value(serde_json::json!({"id":"studio","name":"Studio","accent":"#007aff","accountIds":["emma"],"usage":{"accountWindows":{"emma":["weekly"]},"showAccountName":true}})).unwrap());
        let profile = ProfileUsage {id:"emma".into(),name:"Emma Brooks".into(),active:true,provider:"codex".into(),quota:Some(quota(&[("weekly",20.0)]))};
        let mut state = MenuBarState { provider_updates: Default::default(),settings:app.clone(),quota:None,profiles:vec![profile],generation:0};
        app.workspaces[0].accent = "#7c6cf0".into();
        assert!(state.update(app));
        assert_eq!(state.profiles.len(),1,"changing legacy workspace metadata keeps the sample");
        let prefs = menu_bar_account_preferences(&state.settings, "emma", None);
        let label = account_label(&state.profiles[0],&prefs,state.settings.menu_bar_warning_thresholds(),true,time::OffsetDateTime::now_utc());
        assert_eq!(label.color,DEFAULT_ACCENT,"metrics and logo retain card-matched charcoal without a Near limit warning");
        assert!(label.segments.iter().all(|(_,color)| *color==DEFAULT_ACCENT));
        assert!(label.metrics.iter().all(|metric| metric.color==DEFAULT_ACCENT));
        for style in [crate::settings::MenuBarStyle::Percentages,crate::settings::MenuBarStyle::Progress] {
            for monochrome in [true,false] {
                let image = crate::tray_text::render(&[label.clone()],monochrome,DEFAULT_ACCENT,style, true, false).unwrap();
                for logo in [true,false] {
                    assert!(image.rgba().chunks_exact(4).enumerate().any(|(index,p)| p[..3]==DEFAULT_ACCENT && p[3]>240 && if logo { index as u32 % image.width()<46 } else { index as u32 % image.width()>=52 }));
                }
            }
        }
        assert_eq!(state.settings.codex_accounts["emma"].color,"#007aff","account card colors remain independently saved");
        // The workspace override must not hide warning colors, for any provider.
        state.settings.workspaces[0].usage.warning_colors = true;
        for provider in ["codex","claude","antigravity"] {
            let prefs = menu_bar_account_preferences(&state.settings, "emma", None);
            let profile = ProfileUsage {provider:provider.into(),quota:Some(quota(&[("weekly",96.0)])),..state.profiles[0].clone()};
            let label = account_label(&profile,&prefs,state.settings.menu_bar_warning_thresholds(),true,time::OffsetDateTime::now_utc());
            assert_eq!(label.color,[255,69,58]);
            assert!(label.metrics.iter().all(|metric| metric.color==[255,69,58]));
        }
        state.settings.active_workspace_id = None;
        assert_eq!(menu_bar_account_preferences(&state.settings, "emma", None).color,"#007aff");
    }

    #[test]
    fn neutral_menu_bar_ink_uses_a_template_and_mixed_warnings_keep_their_color() {
        let label = crate::tray_text::Label {
            text: "5h —".into(),
            provider: Some("codex".into()),
            show_provider: true,
            caption: Some("AC".into()),
            color: DEFAULT_ACCENT,
            segments: vec![("5h —".into(), DEFAULT_ACCENT)],
            metrics: vec![crate::tray_text::Metric {
                label: None, fraction: None, time_marker: None,
                reset_fraction: None, color: DEFAULT_ACCENT,
            }],
        };
        let warning = warning_color(96.0);
        for light in [true, false] {
            for has_warning in [false, true] {
                let mut labels = vec![label.clone(), label.clone()];
                let mut accent = if has_warning { warning } else { DEFAULT_ACCENT };
                if has_warning { tint_label(&mut labels[1], warning); }

                assert_eq!(apply_menu_bar_ink(&mut labels, &mut accent, light), !has_warning);
                let neutral = if !has_warning { TEMPLATE_INK } else if light { DEFAULT_ACCENT } else { DARK_BAR_INK };
                assert_eq!(accent, if has_warning { warning } else { TEMPLATE_INK });
                assert_eq!(labels[0].color, neutral);
                assert_eq!(labels[0].segments[0].1, neutral);
                assert_eq!(labels[0].metrics[0].color, neutral);
                assert_eq!(labels[1].color, if has_warning { warning } else { neutral });
            }
        }
        let mut accent = DEFAULT_ACCENT;
        assert!(apply_menu_bar_ink(&mut [], &mut accent, false));
        assert_eq!(accent, TEMPLATE_INK);
    }

    #[test]
    fn enabling_workspace_warning_colors_repaints_cached_usage_immediately() {
        let mut app = AppSettings::default();
        let workspace: crate::workspaces::Workspace = serde_json::from_value(serde_json::json!({
            "id":"studio", "name":"Studio", "accent":"#007aff", "accountIds":["emma"],
            "claudeAccountIds":[], "usage":{"accountWindows":{"emma":["weekly"]}}
        })).unwrap();
        app.active_workspace_id = Some(workspace.id.clone());
        app.workspaces.push(workspace);
        let mut state = MenuBarState { provider_updates: Default::default(), settings: app.clone(), quota: None,
            profiles: vec![ProfileUsage { id: "emma".into(), name: "Emma Brooks".into(), active: true,
                provider: "codex".into(), quota: Some(quota(&[("weekly", 96.0)])) }], generation: 0 };
        app.workspaces[0].usage.warning_colors = true;
        assert!(state.update(app));
        assert_eq!(state.profiles.len(), 1, "enabling colors must preserve the sample needed for the immediate repaint");
        let prefs = CodexAccountPreferences { menu_bar_windows: vec!["weekly".into()], warning_colors: true, ..Default::default() };
        let label = account_label(&state.profiles[0], &prefs, &[75, 90, 95], true, time::OffsetDateTime::now_utc());
        assert_eq!(label.segments[0].1, [255, 69, 58]);
    }

    #[test]
    fn saved_color_levels_repaint_cached_metrics_and_icon_together() {
        let mut app = AppSettings::default();
        app.active_workspace_id = Some("studio".into());
        app.workspaces.push(serde_json::from_value(serde_json::json!({"id":"studio","name":"Studio","accent":"#007aff","accountIds":["emma"],"usage":{"warningColors":true,"warningThresholds":[75,90]}})).unwrap());
        let profile = ProfileUsage {id:"emma".into(),name:"Emma Brooks".into(),active:true,provider:"codex".into(),quota:Some(quota(&[("weekly",96.0)]))};
        let mut state = MenuBarState { provider_updates: Default::default(),settings:app.clone(),quota:None,profiles:vec![profile],generation:0};
        let prefs = CodexAccountPreferences {menu_bar_windows:vec!["weekly".into()],warning_colors:true,..Default::default()};
        let now = time::OffsetDateTime::now_utc();
        let levels = state.settings.menu_bar_warning_thresholds();
        assert_eq!(account_warning(&state.profiles[0],&prefs,levels,now).unwrap().1,[255,159,10]);
        for style in [crate::settings::MenuBarStyle::Percentages,crate::settings::MenuBarStyle::Progress] {
            let label = account_label(&state.profiles[0],&prefs,levels,true,now);
            assert_eq!(label.metrics[0].color,[255,159,10]);
            let image = crate::tray_text::render(&[label],true,[255,159,10],style, true, false).unwrap();
            assert!(image.rgba().chunks_exact(4).any(|p| p[..3]==[255,159,10] && p[3]>240));
        }
        app.workspaces[0].usage.warning_thresholds = Some(vec![]);
        assert!(state.update(app));
        assert_eq!(state.profiles.len(),1);
        assert!(account_warning(&state.profiles[0],&prefs,state.settings.menu_bar_warning_thresholds(),now).is_none());
    }

    #[test]
    fn workspace_thresholds_color_both_metrics_and_icon_and_names_use_initials() {
        let profile = ProfileUsage { id: "emma".into(), name: "Emma Louise Brooks".into(), active: true,
            provider: "codex".into(), quota: Some(quota(&[("weekly", 96.0)])) };
        let mut prefs = CodexAccountPreferences { menu_bar_windows: vec!["weekly".into()], warning_colors: true, ..Default::default() };
        let thresholds = [75, 90]; // Disabled critical level falls back to orange.
        let label = account_label(&profile, &prefs, &thresholds, true, time::OffsetDateTime::now_utc());
        let orange = [255, 159, 10];
        assert_eq!(label.caption.as_deref(), Some("EB"));
        assert_eq!(label.segments[0].1, orange);
        let image = crate::tray_text::render(&[label], true, threshold_color(96.0, &thresholds).unwrap(), crate::settings::MenuBarStyle::Percentages, true, false).unwrap();
        for logo in [true, false] {
            assert!(image.rgba().chunks_exact(4).enumerate().any(|(index,pixel)| {
                let x = index as u32 % image.width();
                pixel[..3] == orange && pixel[3] > 240 && if logo { x < 46 } else { x >= 52 }
            }));
        }
        prefs.show_profile_label = false;
        assert!(account_label(&profile, &prefs, &thresholds, true, time::OffsetDateTime::now_utc()).caption.is_none());
        assert_eq!(threshold_color(96.0, &[]), None);
        assert_eq!(account_initials("  امیر محمدی "), "ام");
        assert_eq!(account_initials("Emma"), "EM");
        assert_eq!(account_initials("Jo"), "JO");
        assert_eq!(account_initials("  👨‍💻 علی  "), "عل");
        assert_eq!(account_initials("🚀QZR"), "QZ");
        assert_eq!(account_initials("𐐨𐐩"), "𐐀𐐁");
        assert_eq!(account_initials("J"), "J");
        assert_eq!(account_initials("👨‍💻"), "");
        assert_eq!(account_initials(""), "");
    }

    #[test]
    fn menu_bar_shows_five_hour_before_weekly_regardless_of_selection_order() {
        let now = time::OffsetDateTime::now_utc();
        for provider in ["codex", "claude", "antigravity"] {
            let profile = ProfileUsage { id: "emma".into(), name: "Emma Brooks".into(), active: true,
                provider: provider.into(), quota: Some(quota(&[("weekly", 16.0), ("5-hour", 0.0)])) };
            let mut prefs = CodexAccountPreferences { menu_bar_windows: vec!["weekly".into(), "5-hour".into()], ..Default::default() };
            let label = account_label(&profile, &prefs, &[], true, now);
            assert_eq!(label.text, if provider == "antigravity" { "Ge 5h 100%  Ge 1w 84%" } else { "5h 100%  1w 84%" });
            assert_eq!(label.metrics[0].label.as_deref(), Some(if provider == "antigravity" { "Ge 5h" } else { "5h" }));
            assert_eq!(label.metrics[0].fraction, Some(1.0));
            assert_eq!(label.metrics[1].label.as_deref(), Some(if provider == "antigravity" { "Ge 1w" } else { "1w" }));
            assert_eq!(label.metrics[1].fraction, Some(0.84));
            prefs.show_labels = false;
            assert_eq!(account_label(&profile, &prefs, &[], false, now).text, "0%  16%");
            assert_eq!(prefs.menu_bar_windows, ["weekly", "5-hour"]);
        }
    }

    #[test]
    fn progress_metrics_follow_selected_limits_and_capacity_direction() {
        let now = time::OffsetDateTime::now_utc();
        let profile = ProfileUsage { id: "emma".into(), name: "Emma Brooks".into(), active: true, provider: "codex".into(), quota: Some(quota(&[("5-hour", 30.0), ("weekly", 96.0), ("monthly", 50.0)])) };
        let prefs = CodexAccountPreferences { menu_bar_windows: vec!["5-hour".into(), "weekly".into(), "15m".into()], warning_colors: true, ..Default::default() };
        let remaining = account_label(&profile, &prefs, &[75, 90, 95], true, now);
        assert_eq!(remaining.metrics.len(), 3);
        assert_eq!(remaining.metrics[0].fraction, Some(0.7));
        assert_eq!(remaining.metrics[1].fraction, Some(0.04));
        assert_eq!(remaining.metrics[1].color, [255, 69, 58]);
        assert_eq!(remaining.metrics[2].fraction, None);
        let used = account_label(&profile, &prefs, &[75, 90, 95], false, now);
        assert_eq!(used.metrics[0].fraction, Some(0.3));
        assert_eq!(used.metrics[1].fraction, Some(0.96));
    }

    #[test]
    fn limit_warning_tints_every_menu_bar_element_in_both_styles() {
        let now = time::OffsetDateTime::now_utc();
        let profile = ProfileUsage { id: "emma".into(), name: "Emma Brooks".into(), active: true,
            provider: "codex".into(), quota: Some(quota(&[("5-hour", 30.0), ("weekly", 96.0)])) };
        let prefs = CodexAccountPreferences { color: "#7c6cf0".into(), menu_bar_windows: vec!["5-hour".into(), "weekly".into(), "15m".into()], warning_colors: true, ..Default::default() };
        let label = account_label(&profile, &prefs, &[75, 90, 95], true, now);
        let red = [255, 69, 58];
        assert_eq!(label.color, red, "initials and window labels must share the warning color");
        assert!(label.segments.iter().all(|(_, color)| *color == red));
        assert!(label.metrics.iter().all(|metric| metric.color == red));
        let (_, icon_color) = account_warning(&profile, &prefs, &[75, 90, 95], now).unwrap();
        for style in [crate::settings::MenuBarStyle::Percentages, crate::settings::MenuBarStyle::Progress] {
            let image = crate::tray_text::render(&[label.clone()], true, icon_color, style, true, false).unwrap();
            assert!(image.rgba().chunks_exact(4).filter(|pixel| pixel[3] == 255).all(|pixel| pixel[..3] == red), "every visible element must share the same warning hue");
        }
    }

    #[test]
    fn uniform_warning_follows_enabled_levels_and_restores_identity_on_recovery() {
        let now = time::OffsetDateTime::now_utc();
        let mut profile = ProfileUsage { id: "emma".into(), name: "Emma Brooks".into(), active: true,
            provider: "codex".into(), quota: Some(quota(&[("5-hour", 80.0), ("weekly", 96.0), ("monthly", 100.0)])) };
        let mut prefs = CodexAccountPreferences { color: "#7c6cf0".into(), menu_bar_windows: vec!["5-hour".into(), "weekly".into()], warning_colors: true, ..Default::default() };
        assert_eq!(account_warning(&profile, &prefs, &[75, 90], now), Some((96.0, [255, 159, 10])));
        profile.quota.as_mut().unwrap().windows.as_mut().unwrap()[1].resets_at = Some(crate::timestamps::format_rfc3339(now - time::Duration::seconds(1)));
        assert_eq!(account_warning(&profile, &prefs, &[75, 90, 95], now), Some((80.0, [255, 214, 10])), "expired and unselected limits cannot escalate the tint");
        profile.quota.as_mut().unwrap().windows.as_mut().unwrap()[0].percent = 20.0;
        assert_eq!(account_warning(&profile, &prefs, &[75, 90, 95], now), None);
        assert_eq!(account_label(&profile, &prefs, &[75, 90, 95], true, now).color, DEFAULT_ACCENT);
        profile.quota.as_mut().unwrap().windows.as_mut().unwrap()[0].percent = 100.0;
        assert_eq!(account_warning(&profile, &prefs, &[], now), None);
        prefs.warning_colors = false;
        assert_eq!(account_warning(&profile, &prefs, &[75, 90, 95], now), None);
        prefs.warning_colors = true;
        profile.quota.as_mut().unwrap().error = Some("Unavailable".into());
        assert_eq!(account_warning(&profile, &prefs, &[75, 90, 95], now), None);
    }

    #[test]
    fn account_warning_colors_are_uniform_and_keep_unavailable_selections() {
        let now = time::OffsetDateTime::now_utc();
        let mut prefs = CodexAccountPreferences {
            color: "#7c6cf0".into(),
            menu_bar_windows: vec!["5-hour".into(), "weekly".into(), "15m".into()],
            warning_colors: true,
            ..Default::default()
        };
        let mut profile = ProfileUsage { id: "work".into(), name: "Work".into(), active: true, provider: "codex".into(), quota: Some(quota(&[("5-hour", 30.0), ("Weekly", 96.0)])) };
        let label = account_label(&profile, &prefs, &[75, 90, 95], true, now);
        assert_eq!(label.text, "5h 70%  1w 4%  15m —");
        assert_eq!(label.segments[0].1, [255, 69, 58]);
        assert_eq!(label.segments[1].1, [255, 69, 58]);
        assert_eq!(label.segments[2].1, [255, 69, 58]);
        assert_eq!(account_label(&profile, &prefs, &[], true, now).segments[1].1, DEFAULT_ACCENT);
        prefs.warning_colors = false;
        assert_eq!(account_label(&profile, &prefs, &[75, 90, 95], true, now).segments[1].1, DEFAULT_ACCENT);
        profile.quota.as_mut().unwrap().error = Some("Unavailable".into());
        assert_eq!(account_label(&profile, &prefs, &[75, 90, 95], true, now).text, "5h —  1w —  15m —");
    }

    #[test]
    fn switch_cycle_requires_explicit_source_and_target_membership_and_supports_weekly_only() {
        let now = time::OffsetDateTime::now_utc();
        let sample = |id: &str, active: bool, used: f64| {
            let mut q = quota(&[("Weekly", used)]);
            q.windows.as_mut().unwrap()[0].resets_at = Some(crate::timestamps::format_rfc3339(now + time::Duration::days(2)));
            ProfileUsage { id: id.into(), name: id.into(), active, provider: "codex".into(), quota: Some(q) }
        };
        let samples = vec![sample("first", true, 100.0), sample("excluded", false, 0.0), sample("second", false, 20.0)];
        let mut settings = AppSettings::default();
        settings.codex_accounts.insert("first".into(), CodexAccountPreferences { auto_switch: true, ..Default::default() });
        settings.codex_accounts.insert("second".into(), CodexAccountPreferences { auto_switch: true, ..Default::default() });
        assert_eq!(auto_switch_target(&samples, &settings, now).unwrap().1.id, "second");
        settings.codex_accounts.get_mut("second").unwrap().auto_switch = false;
        assert!(auto_switch_target(&samples, &settings, now).is_none());
        settings.codex_accounts.get_mut("second").unwrap().auto_switch = true;
        settings.codex_accounts.get_mut("first").unwrap().auto_switch = false;
        assert!(auto_switch_target(&samples, &settings, now).is_none());
        settings.codex_accounts.get_mut("first").unwrap().auto_switch = true;
        settings.codex_accounts.get_mut("second").unwrap().known_windows = vec!["weekly".into(), "5-hour".into()];
        assert!(auto_switch_target(&samples, &settings, now).is_none());
    }

    #[test]
    fn named_provider_buckets_keep_their_own_limit_and_warning_color() {
        let now = time::OffsetDateTime::now_utc();
        let profile = ProfileUsage { id: "google".into(), name: "Google work".into(), provider: "antigravity".into(), active: false, quota: Some(quota(&[("Gemini Pro", 96.0), ("Gemini Flash", 20.0)])) };
        let prefs = CodexAccountPreferences { menu_bar_windows: vec!["Gemini Pro".into()], warning_colors: true, ..Default::default() };
        let label = account_label(&profile, &prefs, &[75, 90, 95], true, now);
        assert_eq!(label.text, "Pro 4%");
        assert_eq!(label.metrics[0].label.as_deref(), Some("Pro"));
        assert_eq!(label.segments[0].1, [255, 69, 58]);
        assert_eq!(warning_color(75.0), [255, 214, 10]);
        assert_eq!(warning_color(90.0), [255, 159, 10]);
    }

    #[test]
    fn menu_bar_follows_each_providers_live_member_and_ignores_saved_targets() {
        for provider in ["codex", "claude", "antigravity"] {
            let workspace = serde_json::from_value(serde_json::json!({
                "id":"studio", "name":"Studio", "accent":"#007aff",
                "accountIds":["saved", "live"], "claudeAccountIds":["saved", "live"], "antigravityAccountIds":["saved", "live"],
                "usage":{"menuBarEnabled":true, "menuBarProvider":provider, "menuBarAccountId":"saved", "activeAccounts":{provider:"saved"}}
            })).unwrap();
            let settings = AppSettings { active_workspace_id: Some("studio".into()), workspaces: vec![workspace], ..Default::default() };
            let profile = ProfileUsage { id: "live".into(), name: "Live".into(), provider: provider.into(), active: true, quota: None };
            assert!(menu_bar_account(&settings, &profile));
            assert!(!menu_bar_account(&settings, &ProfileUsage { id: "saved".into(), active: false, ..profile.clone() }));
            assert!(!menu_bar_account(&settings, &ProfileUsage { id: "outsider".into(), ..profile.clone() }));
            assert!(!menu_bar_account(&settings, &ProfileUsage { active: false, ..profile }));
        }
    }

    #[test]
    fn model_specific_metrics_keep_values_order_and_reset_timing() {
        let now = time::OffsetDateTime::now_utc();
        let mut data = quota(&[("Gemini 4 Argon · Weekly", 75.0), ("Gemini 4 Carbon · 5-hour", 20.0), ("Gemini · Weekly", 99.0)]);
        let windows = data.windows.as_mut().unwrap();
        windows[0].resets_at = Some(crate::timestamps::format_rfc3339(now + time::Duration::days(2)));
        windows[1].resets_at = Some(crate::timestamps::format_rfc3339(now + time::Duration::hours(1)));
        let profile = ProfileUsage { id: "google".into(), name: "Google".into(), provider: "antigravity".into(), active: true, quota: Some(data) };
        let prefs = CodexAccountPreferences { menu_bar_windows: vec!["Gemini 4 Argon · Weekly".into(), "Gemini 4 Carbon · 5-hour".into()], warning_colors: true, ..Default::default() };
        let label = account_label(&profile, &prefs, &[75, 90, 95], true, now);
        assert_eq!(label.text, "Ca 5h 80%  Ar 1w 25%");
        assert_eq!(label.metrics[0].label.as_deref(), Some("Ca 5h"));
        assert_eq!(label.metrics[1].label.as_deref(), Some("Ar 1w"));
        assert_eq!(label.color, warning_color(75.0));
        assert_eq!(label.metrics[0].fraction, Some(0.8));
        assert_eq!(label.metrics[1].fraction, Some(0.25));
        assert_eq!(label.metrics[0].reset_fraction, Some(0.2));
        assert_eq!(label.metrics[1].reset_fraction, Some(2.0 / 7.0));
    }

    #[test]
    fn matching_model_periods_have_short_distinct_labels_even_when_usage_is_unavailable() {
        let now = time::OffsetDateTime::now_utc();
        let mut profile = ProfileUsage { id: "google".into(), name: "Google".into(), provider: "antigravity".into(), active: true,
            quota: Some(quota(&[("Gemini 4 Carbon · 5-hour", 1.0), ("Gemini 4 Argon · Weekly", 15.0), ("Gemini 4 Carbon · Weekly", 1.0)])) };
        let mut prefs = CodexAccountPreferences { menu_bar_windows: vec!["Gemini 4 Carbon · 5-hour".into(), "Gemini 4 Argon · Weekly".into(), "Gemini 4 Carbon · Weekly".into()], ..Default::default() };
        let label = account_label(&profile, &prefs, &[], true, now);
        assert_eq!(label.text, "Ca 5h 99%  Ca 1w 99%  Ar 1w 85%");
        assert_eq!(label.metrics.iter().map(|metric| metric.label.as_deref()).collect::<Vec<_>>(), [Some("Ca 5h"), Some("Ca 1w"), Some("Ar 1w")]);
        profile.quota = None;
        assert_eq!(account_label(&profile, &prefs, &[], true, now).text, "Ca 5h —  Ca 1w —  Ar 1w —");
        prefs.menu_bar_windows.pop();
        assert_eq!(account_label(&profile, &prefs, &[], true, now).text, "Ca 5h —  Ar 1w —");
        let selected: Vec<String> = vec!["Gemini · Weekly".into(), "Gemini 4 Argon · Weekly".into()];
        assert_eq!(menu_bar_limit_label("antigravity", &selected[0]).as_deref(), Some("Ge 1w"));
        let selected: Vec<String> = vec!["Gemini 4 Carbon · Reported quota".into(), "Gemini 4 Argon · Reported quota".into()];
        assert_eq!(menu_bar_limit_label("antigravity", &selected[0]).as_deref(), Some("Ca"));
        assert_eq!(menu_bar_limit_label("antigravity", &selected[1]).as_deref(), Some("Ar"));
        assert_eq!(menu_bar_limit_label("antigravity", "Gemini · 5-hour").as_deref(), Some("Ge 5h"));
        assert_eq!(menu_bar_limit_label("antigravity", "weekly").as_deref(), Some("Ge 1w"));
    }

    #[test]
    fn antigravity_orders_carbon_argon_then_shared_gemini_before_sorting_periods() {
        let profile = ProfileUsage { id: "google".into(), name: "Google".into(), provider: "antigravity".into(), active: true,
            quota: Some(quota(&[("Gemini · 5-hour", 1.0), ("Gemini 4 Argon · Weekly", 15.0), ("Gemini 4 Carbon · Weekly", 1.0)])) };
        let mut prefs = CodexAccountPreferences { menu_bar_windows: vec!["Gemini · 5-hour".into(), "Gemini 4 Argon · Weekly".into(), "Gemini 4 Carbon · Weekly".into()], ..Default::default() };
        for _ in 0..2 {
            let label = account_label(&profile, &prefs, &[], true, time::OffsetDateTime::now_utc());
            assert_eq!(label.text, "Ca 1w 99%  Ar 1w 85%  Ge 5h 99%");
            assert_eq!(label.metrics.iter().map(|metric| metric.label.as_deref()).collect::<Vec<_>>(), [Some("Ca 1w"), Some("Ar 1w"), Some("Ge 5h")]);
            prefs.menu_bar_windows.reverse();
        }
    }

    #[test]
    fn switch_threshold_uses_remaining_capacity_and_rejects_targets_inside_threshold() {
        let now = time::OffsetDateTime::now_utc();
        let quota = |used| QuotaSet { provider: "codex".into(), windows: Some(vec![crate::quota::QuotaWindow { window: "weekly".into(), percent: used, resets_at: Some(crate::timestamps::format_rfc3339(now + time::Duration::hours(1))), status: None }]), error: None, reset_credits: None, as_of: None };
        let mut samples = vec![ProfileUsage { id: "first".into(), name: "First".into(), active: true, provider: "codex".into(), quota: Some(quota(97.9)) }, ProfileUsage { id: "second".into(), name: "Second".into(), active: false, provider: "codex".into(), quota: Some(quota(10.0)) }];
        let mut settings = AppSettings::default();
        for id in ["first", "second"] { settings.codex_accounts.insert(id.into(), CodexAccountPreferences { auto_switch: true, ..Default::default() }); }
        assert!(auto_switch_target(&samples, &settings, now).is_none());
        samples[0].quota = Some(quota(98.0));
        assert_eq!(auto_switch_target(&samples, &settings, now).unwrap().1.id, "second");
        samples[1].quota = Some(quota(98.0));
        assert!(auto_switch_target(&samples, &settings, now).is_none());
    }

    #[test]
    fn cycles_monitor_without_the_menu_bar_and_legacy_flags_do_not_enroll_accounts() {
        let mut app = AppSettings { auto_switch_enabled: true, ..Default::default() };
        assert!(!monitoring_enabled(&app));
        for id in ["first", "second"] { app.codex_accounts.insert(id.into(), CodexAccountPreferences { auto_switch: true, ..Default::default() }); }
        assert!(monitoring_enabled(&app));
        app.codex_accounts.remove("second");
        assert!(!monitoring_enabled(&app));
    }

    #[test]
    fn workspace_policy_never_enrolls_accounts_from_another_workspace() {
        let mut app = AppSettings { workspace_version: 1, active_workspace_id: Some("studio".into()), ..Default::default() };
        app.workspaces = vec![crate::workspaces::Workspace {
            id: "studio".into(), name: "Studio".into(), accent: "#7c6cf0".into(),
            account_ids: vec!["first".into(), "second".into()], provider_ids: None, claude_account_ids: None, antigravity_account_ids: vec![], account_preferences: None, usage: Default::default(),
        }];
        for id in ["first", "second", "outside"] {
            app.codex_accounts.insert(id.into(), CodexAccountPreferences { auto_switch: true, ..Default::default() });
        }
        app.workspaces[0].usage.menu_bar_enabled = false;
        assert!(!monitoring_enabled(&app));
        app.workspaces[0].usage.auto_switch_enabled = true;
        assert!(codex_cycle_enabled(&app));
        assert!(!app.contains_codex_account("outside"));
        app.workspaces[0].account_ids.pop();
        assert!(!codex_cycle_enabled(&app));
        app.workspaces[0].usage.menu_bar_enabled = true;
        assert!(app.codex_menu_bar_enabled());
        assert!(!app.menu_bar_enabled);
    }

    #[test]
    fn template_is_a_transparent_glyph_instead_of_an_opaque_tile() {
        let icon = render(DEFAULT_ACCENT);
        assert_eq!((icon.width(), icon.height()), (46, 36));
        let pixels: Vec<_> = icon.rgba().chunks_exact(4).collect();
        assert_eq!(pixels[0][3], 0);
        assert_eq!(pixels[pixels.len() - 1][3], 0);
        let visible = pixels.iter().filter(|pixel| pixel[3] > 128).count();
        assert!(visible > pixels.len() / 10, "logo must remain visible");
        assert!(
            visible < pixels.len() / 2,
            "background must stay transparent"
        );
    }
}
