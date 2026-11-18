import { DisclosureSummary } from "./ui/disclosure-summary";
import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { Button } from "./ui/button";
import { Switch } from "./ui/switch";
import { Tabs, TabsContent, TabsList, TabsTrigger, segmentStyle } from "./ui/tabs";
import { ToggleGroup, ToggleGroupItem } from "./ui/toggle-group";
import { Progress } from "./ui/progress";
import {
  check,
  type DownloadEvent,
  type Update,
} from "@tauri-apps/plugin-updater";
import { relaunch } from "@tauri-apps/plugin-process";
import { getVersion } from "@tauri-apps/api/app";
import { prettyError, quitApp, setAppSettings, setSettings } from "../api";
import { DEFAULT_APP_SETTINGS, type AppSettings, type AppState, type CodexProfilesState, type ClaudeProfile } from "../types";
import {
  applyDisplayPrefs,
  DEFAULT_DISPLAY_PREFS,
  loadDisplayPrefs,
  resetDisplayPrefs,
  saveDisplayPrefs,
  type DisplayPrefs,
  type ThemeMode,
} from "../displayPrefs";
import { AppModal } from "./AppModal";
import type { ToastKind } from "./Toast";
import { AppLogo } from "../logos";
import { DownloadIcon, LogoutIcon, RefreshIcon, ResetIcon, SearchIcon, SpinnerIcon } from "../icons";
import { WorkspaceSettings } from "./WorkspaceSettings";

/** localStorage key remembering the version the user asked to skip. */
export const SKIPPED_UPDATE_KEY = "orbilap.skippedUpdateVersion";

function skippedVersion(): string | null {
  try {
    return localStorage.getItem(SKIPPED_UPDATE_KEY);
  } catch {
    return null;
  }
}

function setSkippedVersion(version: string | null) {
  try {
    if (version === null) localStorage.removeItem(SKIPPED_UPDATE_KEY);
    else localStorage.setItem(SKIPPED_UPDATE_KEY, version);
  } catch {
    // Private mode etc: skipping just won't persist.
  }
}

interface SettingsModalProps {
  open: boolean;
  onClose: () => void;
  state: AppState | null;
  profiles?: CodexProfilesState | null;
  claudeAccounts?: ClaudeProfile[];
  onChanged: (s: AppState) => void;
  notify: (message: string, kind?: ToastKind) => void;
  /** Frontend-only display prefs, lifted to App so the list reacts instantly. */
  display?: DisplayPrefs;
  onDisplayChanged?: (d: DisplayPrefs) => void;
}

type SettingsTab = "general" | "usage" | "menu-bar" | "updates";
const SETTINGS_TABS: { id: SettingsTab; label: string }[] = [
  { id: "general", label: "General" },
  { id: "usage", label: "Usage" },
  { id: "menu-bar", label: "Menu bar" },
  { id: "updates", label: "Updates" },
];

/**
 * One settings entry for app preferences, updates and the active workspace.
 * General owns the single reset action; Updates shows one primary action
 * for the current phase, while keeping download and restart separate.
 */
export function SettingsModal({
  open,
  onClose,
  state,
  profiles = null,
  claudeAccounts,
  onChanged,
  notify,
  display: displayProp,
  onDisplayChanged,
}: SettingsModalProps) {
  const app = state?.app;
  const workspace = app?.workspaces?.find((item) => item.id === app.activeWorkspaceId);
  const tabs = SETTINGS_TABS.filter(({ id }) => workspace || id === "general" || id === "updates");
  const [workspaceBusy, setWorkspaceBusy] = useState(false);
  const [busy, setBusy] = useState(false);
  const [phase, setPhase] = useState<UpdatePhase>({ kind: "idle" });
  const [currentVersion, setCurrentVersion] = useState<string | null>(null);
  const [tab, setTab] = useState<SettingsTab>("general");
  const saving = busy || workspaceBusy;
  const updateBusy = useRef(false);
  const lastAttempt = useRef(0);
  const [keyboardNavigation, setKeyboardNavigation] = useState(false);
  const [displayState, setDisplayState] = useState<DisplayPrefs>(
    () => displayProp ?? loadDisplayPrefs(),
  );

  useLayoutEffect(() => {
    const body = document.getElementById("settings-body");
    if (body) body.scrollTop = 0;
  }, [tab]);

  const display = displayProp ?? displayState;
  const setDisplay = useCallback(
    (next: DisplayPrefs) => {
      saveDisplayPrefs(next);
      setDisplayState(next);
      onDisplayChanged?.(next);
    },
    [onDisplayChanged],
  );

  // Instant preview even when the modal owns its own state (tests/stories).
  useEffect(() => {
    applyDisplayPrefs(display);
  }, [display]);

  useEffect(() => {
    if (!open) return;
    setTab("general");
    getVersion()
      .then((v) => setCurrentVersion(v))
      .catch(() => setCurrentVersion(null));
  }, [open]);

  const updatePrefs = useCallback(
    async (partial: Partial<AppSettings>) => {
      if (saving) return false;
      setBusy(true);
      try {
        onChanged(await setAppSettings(partial));
        return true;
      } catch (e) {
        notify(prettyError(e), "err");
        return false;
      } finally {
        setBusy(false);
      }
    },
    [saving, notify, onChanged],
  );

  const toggleLogin = useCallback(
    async (next: boolean) => {
      if (saving) return;
      setBusy(true);
      try {
        onChanged(await setSettings(next));
      } catch (e) {
        notify(prettyError(e), "err");
      } finally {
        setBusy(false);
      }
    },
    [saving, notify, onChanged],
  );

  const checkNow = useCallback((automatic = false) => {
    if (updateBusy.current) return;
    updateBusy.current = true;
    lastAttempt.current = Date.now();
    setPhase({ kind: "checking" });
    if (!automatic) notify("Checking for updates…");
    void check().then(async (found) => {
      try { localStorage.setItem("orbilap.lastUpdateCheck", new Date().toISOString()); } catch { /* Optional history. */ }
      if (!found || (automatic && found.version === skippedVersion())) {
        setPhase({ kind: "current" });
        if (!automatic) notify("You're on the latest version.", "ok");
        return;
      }
      setPhase({ kind: "available", update: found });
      notify(`Version ${found.version} is available`, "ok");
      if (automatic) {
        setPhase({ kind: "downloading", progress: null });
        await downloadUpdate(found, (progress) => setPhase({ kind: "downloading", progress }));
        setPhase({ kind: "downloaded", update: found });
        notify(`Version ${found.version} downloaded`, "ok");
      }
    }).catch((e) => {
      const message = prettyError(e); setPhase({ kind: "failed" }); notify(message, "err");
    }).finally(() => { updateBusy.current = false; });
  }, [notify]);

  // This component remains mounted while Settings and the tray are closed.
  useEffect(() => {
    if (!display.checkUpdatesOnLaunch) return;
    const dailyCheck = () => {
      if (updateBusy.current || phase.kind === "available" || phase.kind === "downloaded" || phase.kind === "installing") return;
      let checked = 0;
      try { checked = Date.parse(localStorage.getItem("orbilap.lastUpdateCheck") ?? "") || 0; } catch { /* Optional history. */ }
      if (Date.now() - Math.max(checked, lastAttempt.current) >= 86_400_000) checkNow(true);
    };
    dailyCheck(); const timer = window.setInterval(dailyCheck, 60_000);
    return () => window.clearInterval(timer);
  }, [display.checkUpdatesOnLaunch, checkNow, phase.kind]);

  const skipVersion = useCallback(
    (version: string) => {
      setSkippedVersion(version);
      setPhase({ kind: "current" });
      notify(`Version ${version} skipped`, "ok");
    },
    [notify],
  );

  const downloadOnly = useCallback((update: Update) => {
    if (updateBusy.current) return;
    updateBusy.current = true; setPhase({ kind: "downloading", progress: null });
    notify("Downloading update…");
    void downloadUpdate(update, (progress) => setPhase({ kind: "downloading", progress }))
      .then(() => { setPhase({ kind: "downloaded", update }); notify(`Version ${update.version} downloaded`, "ok"); })
      .catch((e) => { const message = prettyError(e); setPhase({ kind: "failed" }); notify(message, "err"); })
      .finally(() => { updateBusy.current = false; });
  }, [notify]);

  const installAndRelaunch = useCallback((update: Update) => {
    if (updateBusy.current) return;
    updateBusy.current = true; setPhase({ kind: "installing" });
    notify("Installing update…");
    void update.install().then(() => relaunch())
      .catch((e) => { const message = prettyError(e); setPhase({ kind: "failed" }); notify(message, "err"); })
      .finally(() => { updateBusy.current = false; });
  }, [notify]);

  const resetAll = useCallback(() => {
    // Reset global preferences without replacing workspace membership or policies.
    void updatePrefs({ refreshIntervalSecs: DEFAULT_APP_SETTINGS.refreshIntervalSecs,
      usageShowRemaining: DEFAULT_APP_SETTINGS.usageShowRemaining }).then((saved) => {
      if (!saved) return;
      setDisplay(resetDisplayPrefs()); setDisplayState({ ...DEFAULT_DISPLAY_PREFS });
      notify("Settings reset to defaults", "ok");
    });
  }, [notify, setDisplay, updatePrefs]);

  return (
    <Tabs
      value={tab}
      onValueChange={(value) => {
        const next = value as SettingsTab;
        setTab(next);
      }}
      className="settings-tabs-root"
    >
      <AppModal
        open={open}
        onClose={onClose}
        title="Settings"
        busy={saving}
        cardClass={`settings-card workspace-settings-card ${keyboardNavigation ? "is-keyboard" : "is-pointer"}`}
        bodyId="settings-body"
        navigation={
          app && state ? (
            <TabsList
              className="settings-tabs ios-segments"
              aria-label="Settings sections"
              style={segmentStyle(
                tabs.length,
                tabs.findIndex((item) => item.id === tab),
                keyboardNavigation,
              )}
              onPointerDownCapture={() => setKeyboardNavigation(false)}
              onKeyDownCapture={() => setKeyboardNavigation(true)}
            >
              {tabs.map(({ id, label }) => (
                <TabsTrigger key={id} value={id} className="settings-tab" disabled={saving}>
                  {label}
                </TabsTrigger>
              ))}
            </TabsList>
          ) : null
        }
      >
        {!app || !state ? (
          <p className="m-empty">Loading settings…</p>
        ) : (
          <div
            className={`settings-body${keyboardNavigation ? " no-motion" : ""}`}
            onPointerDownCapture={() => setKeyboardNavigation(false)}
            onKeyDownCapture={() => setKeyboardNavigation(true)}
          >
            {workspace ? <WorkspaceSettings key={workspace.id} open={open} workspace={workspace} state={state} profiles={profiles} claudeAccounts={claudeAccounts} onChanged={onChanged} onBusyChange={setWorkspaceBusy} /> : null}
            <TabsContent value="general" className="settings-panel settings-general">
              <section
                className="settings-section settings-group"
                aria-label="App behavior"
              >
                <Row name="Launch at login">
                  <Toggle
                    label="Launch at login"
                    disabled={saving}
                    selected={state.settings.openAtLogin}
                    onChange={(v) => void toggleLogin(v)}
                  />
                </Row>
                <Row name="Refresh on focus">
                  <Toggle
                    label="Refresh on focus"
                    disabled={saving}
                    selected={display.refreshOnFocus}
                    onChange={(v) =>
                      setDisplay({ ...display, refreshOnFocus: v })
                    }
                  />
                </Row>
              </section>
              <section className="settings-section settings-choice" aria-labelledby="refresh-interval-label">
                <div className="settings-choice-heading">
                  <h3 id="refresh-interval-label">Refresh interval</h3>
                  <p id="refresh-interval-help" className="setting-note">
                    Refreshes account usage while the panel is open.
                  </p>
                </div>
                <RefreshInterval
                  value={app.refreshIntervalSecs}
                  disabled={saving}
                  onCommit={(value) =>
                    void updatePrefs({ refreshIntervalSecs: value })
                  }
                />
              </section>
              <section className="settings-section settings-choice" aria-labelledby="theme-label">
                <h3 id="theme-label">Theme</h3>
                <ToggleGroup
                  type="single"
                  disabled={saving}
                  className="segmented ios-segments theme-segments"
                  style={segmentStyle(
                    3,
                    ["dark", "light", "system"].indexOf(display.theme),
                  )}
                  aria-label="Color theme"
                  value={display.theme}
                  onValueChange={(mode) => {
                    if (mode)
                      setDisplay({ ...display, theme: mode as ThemeMode });
                  }}
                >
                  {(["dark", "light", "system"] as ThemeMode[]).map(
                    (mode) => (
                      <ToggleGroupItem
                        key={mode}
                        value={mode}
                        className="segment"
                      >
                        {mode === "dark"
                          ? "Dark"
                          : mode === "light"
                            ? "Light"
                            : "System"}
                      </ToggleGroupItem>
                    ),
                  )}
                </ToggleGroup>
              </section>
              <section className="settings-section settings-choice" aria-labelledby="deadline-display-label">
                <h3 id="deadline-display-label">Deadline display</h3>
                <ToggleGroup type="single" disabled={saving} className="segmented ios-segments theme-segments"
                  aria-labelledby="deadline-display-label" value={display.deadlineDisplay}
                  style={segmentStyle(2, display.deadlineDisplay === "date" ? 1 : 0, keyboardNavigation)}
                  onValueChange={value => { if (value === "remaining" || value === "date") setDisplay({ ...display, deadlineDisplay: value }); }}>
                  <ToggleGroupItem value="remaining" className="segment">Time remaining</ToggleGroupItem>
                  <ToggleGroupItem value="date" className="segment">Date &amp; time</ToggleGroupItem>
                </ToggleGroup>
              </section>
              <section className="settings-section settings-choice" aria-labelledby="time-format-label">
                <h3 id="time-format-label">Clock format</h3>
                <ToggleGroup type="single" disabled={saving} className="segmented ios-segments theme-segments"
                  aria-labelledby="time-format-label" value={display.timeFormat}
                  style={segmentStyle(2, display.timeFormat === "12h" ? 1 : 0, keyboardNavigation)}
                  onValueChange={value => { if (value === "24h" || value === "12h") setDisplay({ ...display, timeFormat: value }); }}>
                  <ToggleGroupItem value="24h" className="segment">24-hour</ToggleGroupItem>
                  <ToggleGroupItem value="12h" className="segment">AM/PM</ToggleGroupItem>
                </ToggleGroup>
              </section>
              <div className="settings-footer">
                <Button
                  type="button"
                  variant="secondary"
                  className="reset-settings"
                  disabled={saving}
                  onClick={resetAll}
                ><ResetIcon size={16} />
                  Reset to defaults
                </Button>
                <Button variant="destructive" className="settings-quit" disabled={saving} onClick={() => void quitApp().catch(error => notify(prettyError(error), "err"))}>
                  <LogoutIcon size={18} />Quit Orbilap
                </Button>
              </div>
            </TabsContent>

            <TabsContent value="updates" className="settings-panel">
              <section className="settings-section">
                <UpdateRows
                  phase={phase}
                  currentVersion={currentVersion}
                  onCheck={() => checkNow()}
                  onSkip={skipVersion}
                  onDownload={downloadOnly}
                  onInstallRelaunch={installAndRelaunch}
                />
              </section>
              <section className="settings-section settings-group">
                <Row name="Automatic updates">
                  <Toggle
                    label="Automatic updates"
                    selected={display.checkUpdatesOnLaunch}
                    onChange={(v) =>
                      setDisplay({ ...display, checkUpdatesOnLaunch: v })
                    }
                  />
                </Row>
              </section>
            </TabsContent>
          </div>
        )}
      </AppModal>
    </Tabs>
  );
}

/** Shared progress accounting for manual and automatic downloads. */
async function downloadUpdate(update: Update, onProgress: (progress: number | null) => void) {
  let total = 0, done = 0;
  await update.download((event: DownloadEvent) => {
    if (event.event === "Started") { total = event.data.contentLength ?? 0; done = 0; }
    if (event.event === "Progress") done += event.data.chunkLength;
    onProgress(total > 0 ? Math.min(1, done / total) : null);
  });
}

type UpdatePhase =
  | { kind: "idle" }
  | { kind: "checking" }
  | { kind: "current" }
  | { kind: "available"; update: Update }
  | { kind: "downloading"; progress: number | null }
  | { kind: "downloaded"; update: Update }
  | { kind: "installing" }
  | { kind: "failed" };

function UpdateRows({
  phase,
  currentVersion,
  onCheck,
  onSkip,
  onDownload,
  onInstallRelaunch,
}: {
  phase: UpdatePhase;
  currentVersion: string | null;
  onCheck: () => void;
  onSkip: (version: string) => void;
  onDownload: (update: Update) => void;
  onInstallRelaunch: (update: Update) => void;
}) {
  return (
    <div className="update-card">
      <div className="update-brand">
        <AppLogo />
        <div>
          <h3>Orbilap</h3>
          <p>Switch AI accounts in seconds and see usage at a glance.</p>
          <p>
            Version <span>{currentVersion ?? "…"}</span>
          </p>
        </div>
      </div>
      {(phase.kind === "available" || phase.kind === "downloaded") && phase.update.body ? (
        <details className="update-release-notes">
          <DisclosureSummary>What's new</DisclosureSummary>
          <p className="setting-note release-notes">{phase.update.body}</p>
        </details>
      ) : null}
      {phase.kind === "downloading" ? (
        <>
          <Progress
            aria-label="Download progress"
            className={`update-progress${phase.progress === null ? " indeterminate" : ""}`}
            value={
              phase.progress === null
                ? undefined
                : Math.round(phase.progress * 100)
            }
          />
        </>
      ) : phase.kind === "available" ? (
        <div className="action-row update-choice-actions">
          <Button onClick={() => onSkip(phase.update.version)}>Skip this version</Button>
          <Button variant="default" onClick={() => onDownload(phase.update)}>
            <DownloadIcon size={18} />Download update
          </Button>
        </div>
      ) : phase.kind === "downloaded" ? (
        <Button
          variant="default"
          className="update-primary"
          onClick={() => onInstallRelaunch(phase.update)}
        >
          <RefreshIcon size={18} />Install & relaunch
        </Button>
      ) : (
        <Button
          variant="ghost"
          className="update-check"
          aria-label={phase.kind === "installing" ? "Installing update" : phase.kind === "checking" ? "Checking for updates" : "Check for updates"}
          aria-busy={phase.kind === "checking" || phase.kind === "installing"}
          onClick={onCheck}
          disabled={phase.kind === "checking" || phase.kind === "installing"}
        >
          {phase.kind === "checking" || phase.kind === "installing" ? <SpinnerIcon size={18} /> : <SearchIcon size={18} />}
          {phase.kind === "installing" ? "Installing…" : phase.kind === "checking" ? "Checking…" : "Check updates"}
        </Button>
      )}
    </div>
  );
}

// ── shared bits ────────────────────────────────────────────────────────────

function Row({
  name,
  desc,
  children,
}: {
  name: string;
  desc?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="setting-row">
      <div className="setting-text">
        <span className="setting-name">{name}</span>
        {desc ? <span className="setting-desc">{desc}</span> : null}
      </div>
      <div className="setting-control">{children}</div>
    </div>
  );
}

const REFRESH_PRESETS = [30, 60, 120];

/** Match the theme segments while preserving a previously saved custom cadence. */
function RefreshInterval({
  value,
  disabled,
  onCommit,
}: {
  value: number;
  disabled: boolean;
  onCommit: (value: number) => void;
}) {
  const options = REFRESH_PRESETS.includes(value)
    ? REFRESH_PRESETS
    : [...REFRESH_PRESETS, value].sort((a, b) => a - b);

  return (
    <ToggleGroup
      type="single"
      className="segmented ios-segments refresh-segments"
      style={segmentStyle(options.length, options.indexOf(value))}
      aria-label="Refresh interval"
      aria-describedby="refresh-interval-help"
      value={String(value)}
      disabled={disabled}
      onValueChange={(preset) => {
        if (preset) onCommit(Number(preset));
      }}
    >
      {options.map((preset) => (
        <ToggleGroupItem
          key={preset}
          value={String(preset)}
          className="segment"
        >
          {preset}s
        </ToggleGroupItem>
      ))}
    </ToggleGroup>
  );
}

function Toggle({
  selected,
  onChange,
  label,
  disabled = false,
}: {
  disabled?: boolean;
  selected: boolean;
  onChange: (v: boolean) => void;
  label: string;
}) {
  return (
    <Switch aria-label={label} disabled={disabled} checked={selected} onCheckedChange={onChange} />
  );
}
