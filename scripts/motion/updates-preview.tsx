// Real header/settings with synthetic workspace; use VITE_ORBILAP_PREVIEW_UPDATE=1.
import { useState } from "react";
import { createRoot } from "react-dom/client";
import { HomeHeader } from "../../src/components/HomeChrome";
import { SettingsModal } from "../../src/components/SettingsModal";
import { Toast, showToast } from "../../src/components/Toast";
import { TooltipProvider } from "../../src/components/ui/tooltip";
import { DEFAULT_APP_SETTINGS, DEFAULT_WORKSPACE_USAGE, type AppState } from "../../src/types";
import { applyDisplayPrefs, DEFAULT_DISPLAY_PREFS, type DisplayPrefs } from "../../src/displayPrefs";
import "../../src/index.css";
import "../../src/panel.css";
import "../../src/home.css";
import "../../src/surfaces.css";
import "../../src/orbilap.css";

const params = new URLSearchParams(location.search);
const prefs: DisplayPrefs = { ...DEFAULT_DISPLAY_PREFS, theme: params.get("theme") === "light" ? "light" : "dark" };
applyDisplayPrefs(prefs);
document.getElementById("root")!.style.cssText = `max-width:${params.get("width") === "380" ? 380 : 430}px;margin:0 auto;min-height:600px`;
const workspace = { id: "update-demo", name: "Sample workspace", accent: "#007aff", accountIds: [], usage: DEFAULT_WORKSPACE_USAGE };
const initialState: AppState = { settings: { openAtLogin: false }, app: { ...DEFAULT_APP_SETTINGS, workspaceVersion: 1, activeWorkspaceId: workspace.id, workspaces: [workspace] } };
const noAction = () => {};
function Preview() {
  const [state, setState] = useState(initialState);
  const [display, setDisplay] = useState(prefs);
  const [open, setOpen] = useState(false);
  const [unread, setUnread] = useState(false);
  return <>
    <HomeHeader workspace={workspace} workspaces={[workspace]} workspaceBusy={false} addBusy={false} refreshing={false} updatedAt={null}
      updateUnread={unread} onSelect={noAction} onRefresh={noAction} onQuit={noAction} onAdd={noAction} onCreate={noAction} onSettings={() => setOpen(true)} />
    <main className="home-accounts"><p className="account-data-note">Local update preview · Sample workspace. Reload to repeat the unread notice.</p></main>
    <SettingsModal open={open} onClose={() => setOpen(false)} state={state} onChanged={setState} notify={showToast}
      display={display} onDisplayChanged={setDisplay} onUpdateUnreadChange={setUnread} />
    <Toast theme={display.theme} />
  </>;
}
// An iframe gives the real tray viewport to media queries and portaled dialogs.
const panelUrl = new URL(location.href);
panelUrl.searchParams.set("panel", "1");
createRoot(document.getElementById("root")!).render(<TooltipProvider>{params.has("panel") ? <Preview />
  : <iframe title="Orbilap update preview" src={panelUrl.href} style={{ width: "100%", height: 600, border: 0, display: "block" }} />}</TooltipProvider>);
