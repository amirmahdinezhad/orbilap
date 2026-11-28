//! One opt-in application shortcut. Registration stays native, even with the panel hidden.
use serde::{Deserialize, Serialize};
use std::sync::{Mutex, atomic::{AtomicBool, AtomicI32, AtomicU32, Ordering}};
use tauri::{AppHandle, Emitter, Manager};
use tauri_plugin_global_shortcut::{Code, GlobalShortcutExt, Modifiers, Shortcut, ShortcutState};

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", default)]
pub struct Preferences {
    pub enabled: bool,
    pub accelerator: String,
}
impl Default for Preferences {
    fn default() -> Self { Self { enabled: false, accelerator: "super+shift+KeyO".into() } }
}

pub fn validate(value: &str) -> Result<Shortcut, String> {
    if value.len() > 100 { return Err("Choose a shorter keyboard shortcut.".into()); }
    let shortcut: Shortcut = value.parse().map_err(|_| "Choose a valid key combination.".to_string())?;
    if !shortcut.mods.intersects(Modifiers::SUPER | Modifiers::CONTROL | Modifiers::ALT)
        || matches!(shortcut.key, Code::Escape | Code::Tab)
    { return Err("Use Command, Control or Option with a key other than Escape or Tab.".into()); }
    // Match the recorder's supported physical keys; do not register modifiers as keys.
    let code = shortcut.key.to_string();
    if !(code.starts_with("Key") || code.starts_with("Digit")
        || code.strip_prefix('F').and_then(|n| n.parse::<u8>().ok()).is_some_and(|n| (1..=24).contains(&n))
        || matches!(shortcut.key, Code::Space | Code::Enter | Code::Backspace | Code::Delete
            | Code::ArrowUp | Code::ArrowDown | Code::ArrowLeft | Code::ArrowRight
            | Code::Home | Code::End | Code::PageUp | Code::PageDown | Code::Minus | Code::Equal
            | Code::BracketLeft | Code::BracketRight | Code::Backslash | Code::Semicolon
            | Code::Quote | Code::Comma | Code::Period | Code::Slash | Code::Backquote))
    { return Err("Choose a letter, number, function key or navigation key.".into()); }
    Ok(shortcut)
}

trait Registry {
    fn register(&self, shortcut: Shortcut) -> Result<(), String>;
    fn unregister(&self, shortcut: Shortcut) -> Result<(), String>;
}
impl Registry for AppHandle {
    fn register(&self, shortcut: Shortcut) -> Result<(), String> {
        self.global_shortcut().register(shortcut)
            .map_err(|_| "This shortcut is unavailable. Choose another combination.".into())
    }
    fn unregister(&self, shortcut: Shortcut) -> Result<(), String> {
        self.global_shortcut().unregister(shortcut)
            .map_err(|_| "Cannot release the previous shortcut. Try again.".into())
    }
}

#[derive(Default)]
struct Registration { active: Option<Shortcut>, error: Option<String> }
impl Registration {
    // Reserve the new key before releasing the old one; a conflict preserves the working key.
    fn replace(&mut self, registry: &impl Registry, next: Option<Shortcut>) -> Result<(), String> {
        if self.active == next { self.error = None; return Ok(()); }
        if let Some(next) = next { registry.register(next)?; }
        if let Some(old) = self.active {
            if let Err(error) = registry.unregister(old) {
                if let Some(next) = next { let _ = registry.unregister(next); }
                return Err(error);
            }
        }
        self.active = next;
        self.error = None;
        Ok(())
    }
    fn save(&mut self, registry: &impl Registry, path: &std::path::Path, patch: serde_json::Value) -> Result<crate::settings::AppSettings, String> {
        let previous = self.active;
        let result = crate::settings::update_settings(path, |settings| {
            crate::settings::merge_global(settings, &patch)?;
            if patch.get("panelShortcut").is_some() {
                let shortcut = validate(&settings.panel_shortcut.accelerator)?;
                settings.panel_shortcut.accelerator = shortcut.into_string();
                self.replace(registry, settings.panel_shortcut.enabled.then_some(shortcut))?;
            }
            Ok(())
        });
        if result.is_err() && self.active != previous && self.replace(registry, previous).is_err() {
            self.error = Some("Shortcut registration changed, but settings could not be saved. Choose the shortcut again.".into());
        }
        result.map(|(settings, ())| settings)
    }
}

#[derive(Default)]
pub struct PanelShortcut {
    registration: Mutex<Registration>,
    active_id: AtomicU32,
    pub recording: AtomicBool,
    pressed: AtomicBool,
    previous_app: AtomicI32,
}
impl PanelShortcut {
    fn accepts(&self, id: u32, state: ShortcutState) -> bool {
        if self.active_id.load(Ordering::SeqCst) != id { return false; }
        if state == ShortcutState::Released { self.pressed.store(false, Ordering::SeqCst); return false; }
        !self.pressed.swap(true, Ordering::SeqCst)
    }
    fn publish(&self, registration: &Registration) {
        self.active_id.store(registration.active.map_or(0, |key| key.id()), Ordering::SeqCst);
        self.pressed.store(false, Ordering::SeqCst);
    }
    pub fn error(&self) -> Option<String> {
        self.registration.lock().unwrap_or_else(|e| e.into_inner()).error.clone()
    }
    pub fn start(&self, app: &AppHandle, preferences: &Preferences) {
        let mut current = self.registration.lock().unwrap_or_else(|e| e.into_inner());
        let result = if preferences.enabled {
            validate(&preferences.accelerator).and_then(|key| current.replace(app, Some(key)))
        } else { Ok(()) };
        current.error = result.err();
        self.publish(&current);
    }
    pub fn update(&self, app: &AppHandle, patch: serde_json::Value) -> Result<crate::settings::AppSettings, String> {
        let mut current = self.registration.lock().unwrap_or_else(|e| e.into_inner());
        let result = current.save(app, &crate::paths::settings_file(), patch);
        self.publish(&current);
        result
    }
}

pub fn handle(app: &AppHandle, shortcut: &Shortcut, state: ShortcutState) {
    let service = app.state::<PanelShortcut>();
    if !service.accepts(shortcut.id(), state) { return; }
    let accelerator = shortcut.into_string();
    let id = shortcut.id();
    let handle = app.clone();
    let _ = app.run_on_main_thread(move || {
        let service = handle.state::<PanelShortcut>();
        if service.active_id.load(Ordering::SeqCst) != id { return; }
        if service.recording.load(Ordering::SeqCst) {
            let _ = handle.emit_to("main", "panel-shortcut-recorded", accelerator);
        } else if let Some(window) = handle.get_webview_window("main") {
            if window.is_visible().unwrap_or(false) && window.is_focused().unwrap_or(false) {
                // React preserves mounted forms/dialogs and busy flows before allowing hide.
                let _ = handle.emit_to("main", "panel-shortcut-dismiss", ());
            } else {
                #[cfg(target_os = "macos")]
                if objc2::MainThreadMarker::new().is_some() {
                    if let Some(previous) = objc2_app_kit::NSWorkspace::sharedWorkspace().frontmostApplication() {
                        let pid = previous.processIdentifier();
                        if pid != std::process::id() as i32 { service.previous_app.store(pid, Ordering::SeqCst); }
                    }
                }
                crate::show_panel(&handle);
            }
        }
    });
}

pub fn hide(app: &AppHandle) {
    if app.state::<crate::PanelFileImport>().0.load(Ordering::SeqCst) { return; }
    #[cfg(target_os = "macos")]
    if let Some(mtm) = objc2::MainThreadMarker::new() {
        if objc2_app_kit::NSApplication::sharedApplication(mtm).modalWindow().is_some() { return; }
    }
    let Some(window) = app.get_webview_window("main") else { return; };
    if !window.is_focused().unwrap_or(false) { return; }
    let _ = window.hide();
    #[cfg(target_os = "macos")]
    {
        let pid = app.state::<PanelShortcut>().previous_app.swap(0, Ordering::SeqCst);
        if let Some(previous) = objc2_app_kit::NSRunningApplication::runningApplicationWithProcessIdentifier(pid) {
            #[allow(deprecated)]
            previous.activateWithOptions(objc2_app_kit::NSApplicationActivationOptions::ActivateIgnoringOtherApps);
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::cell::RefCell;
    #[derive(Default)]
    struct Fake { keys: RefCell<Vec<Shortcut>>, conflict: Option<Shortcut> }
    impl Registry for Fake {
        fn register(&self, key: Shortcut) -> Result<(), String> {
            if self.conflict == Some(key) { return Err("conflict".into()); }
            self.keys.borrow_mut().push(key); Ok(())
        }
        fn unregister(&self, key: Shortcut) -> Result<(), String> {
            self.keys.borrow_mut().retain(|k| *k != key); Ok(())
        }
    }
    #[test]
    fn held_keys_toggle_once_and_disabled_or_superseded_keys_are_ignored() {
        let service = PanelShortcut::default();
        service.active_id.store(42, Ordering::SeqCst);
        assert!(service.accepts(42, ShortcutState::Pressed));
        assert!(!service.accepts(42, ShortcutState::Pressed));
        assert!(!service.accepts(42, ShortcutState::Released));
        assert!(service.accepts(42, ShortcutState::Pressed));
        service.active_id.store(0, Ordering::SeqCst);
        assert!(!service.accepts(42, ShortcutState::Pressed));
        service.active_id.store(43, Ordering::SeqCst);
        assert!(!service.accepts(42, ShortcutState::Pressed));
    }
    #[test]
    fn conflicts_preserve_old_registration_and_disable_releases_it() {
        let old = validate("Super+Shift+KeyO").unwrap();
        let next = validate("Control+Alt+KeyP").unwrap();
        let registry = Fake { conflict: Some(next), ..Default::default() };
        let mut current = Registration::default();
        current.replace(&registry, Some(old)).unwrap();
        assert!(current.replace(&registry, Some(next)).is_err());
        assert_eq!(current.active, Some(old));
        assert_eq!(*registry.keys.borrow(), [old]);
        current.replace(&registry, None).unwrap();
        assert!(registry.keys.borrow().is_empty());
    }
    #[test]
    fn replacement_and_failed_persistence_rollback_leave_one_key() {
        let registry = Fake::default();
        let mut current = Registration::default();
        let old = validate("Super+Shift+KeyO").unwrap();
        let next = validate("Control+Alt+KeyP").unwrap();
        current.replace(&registry, Some(old)).unwrap();
        current.replace(&registry, Some(next)).unwrap();
        assert_eq!(*registry.keys.borrow(), [next]);
        current.replace(&registry, Some(old)).unwrap();
        assert_eq!(*registry.keys.borrow(), [old]);
    }
    #[test]
    fn actual_settings_write_failure_rolls_back_registration() {
        let registry = Fake::default();
        let mut current = Registration::default();
        let old = validate("Super+Shift+KeyO").unwrap();
        current.replace(&registry, Some(old)).unwrap();
        let dir = std::env::temp_dir().join(format!("orbilap-shortcut-rollback-{}", uuid::Uuid::new_v4()));
        std::fs::create_dir_all(&dir).unwrap();
        let not_a_directory = dir.join("file");
        std::fs::write(&not_a_directory, "synthetic").unwrap();
        let patch = serde_json::json!({"panelShortcut":{"enabled":true,"accelerator":"Control+Alt+KeyP"}});
        assert!(current.save(&registry, &not_a_directory.join("settings.json"), patch).is_err());
        assert_eq!(current.active, Some(old));
        assert_eq!(*registry.keys.borrow(), [old]);
        std::fs::remove_dir_all(dir).unwrap();
    }
    #[test]
    fn actual_conflict_preserves_persisted_preferences_and_unrelated_settings() {
        let old = validate("Super+Shift+KeyO").unwrap();
        let next = validate("Control+Alt+KeyP").unwrap();
        let registry = Fake { conflict: Some(next), ..Default::default() };
        let mut current = Registration::default();
        let dir = std::env::temp_dir().join(format!("orbilap-shortcut-conflict-{}", uuid::Uuid::new_v4()));
        std::fs::create_dir_all(&dir).unwrap();
        let path = dir.join("settings.json");
        current.save(&registry, &path, serde_json::json!({"panelShortcut":{"enabled":true,"accelerator":old.into_string()},"refreshIntervalSecs":120})).unwrap();
        let before = std::fs::read(&path).unwrap();
        assert!(current.save(&registry, &path, serde_json::json!({"panelShortcut":{"enabled":true,"accelerator":next.into_string()}})).is_err());
        assert_eq!(std::fs::read(&path).unwrap(), before);
        current.save(&registry, &path, serde_json::json!({"usageShowRemaining":false})).unwrap();
        assert_eq!(current.active, Some(old));
        let saved = crate::settings::read_settings(&path);
        assert_eq!(saved.refresh_interval_secs, 120);
        assert!(saved.panel_shortcut.enabled);
        assert!(!saved.usage_show_remaining);
        std::fs::remove_dir_all(dir).unwrap();
    }
    #[test]
    fn reject_plain_or_navigation_only_keys_and_accept_recordable_combinations() {
        for value in ["KeyO", "Shift+KeyO", "Super+Tab", "Control+Escape", "Super+Shift", "Super+KeyO+KeyP"] {
            assert!(validate(value).is_err(), "{value}");
        }
        for value in ["Super+Shift+KeyO", "Control+Alt+Space", "Alt+F12", "Control+Digit1", "Super+Slash"] {
            assert!(validate(value).is_ok(), "{value}");
        }
    }
}
