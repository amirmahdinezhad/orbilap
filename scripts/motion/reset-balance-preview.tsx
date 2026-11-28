// Explicit read-only fixture: no provider calls, credentials or account writes.
import { useState } from "react";
import { createRoot } from "react-dom/client";
import { WorkspaceAccounts } from "../../src/components/WorkspaceAccounts";
import { TooltipProvider } from "../../src/components/ui/tooltip";
import { DEFAULT_APP_SETTINGS, DEFAULT_WORKSPACE_USAGE, type CodexProfile } from "../../src/types";
import { applyDisplayPrefs, DEFAULT_DISPLAY_PREFS } from "../../src/displayPrefs";
import type { QuotaSet } from "../../src/api";
import "../../src/index.css";
import "../../src/panel.css";
import "../../src/home.css";
import "../../src/surfaces.css";
import "../../src/orbilap.css";

const params = new URLSearchParams(location.search);
applyDisplayPrefs({ ...DEFAULT_DISPLAY_PREFS, theme: params.get("theme") === "light" ? "light" : "dark" });
const accounts: CodexProfile[] = [
  { id: "active", name: "Alex Morgan", email: "alex@example.com", plan: "plus", active: true, connected: true, needsActivation: false, connectionError: null, loginCommand: "", subscription: { id: "chatgpt", service: "ChatGPT", plan: "plus", expiresAt: "2026-12-12T12:00:00Z" } },
  { id: "email", name: "Studio account", email: "studio@example.com", plan: "plus", active: false, connected: true, needsActivation: false, connectionError: null, loginCommand: "" },
  { id: "zero", name: "No reset credits", email: "zero@example.com", plan: "plus", active: false, connected: true, needsActivation: false, connectionError: null, loginCommand: "", subscription: { id: "chatgpt", service: "ChatGPT", plan: "plus", expiresAt: "2026-12-12T12:00:00Z" } },
];
const workspace = { id: "reset-balance-preview", name: "Sample workspace", accent: "#007aff", accountIds: accounts.map(account => account.id), usage: { ...DEFAULT_WORKSPACE_USAGE, showCodexResets: false } };
const usage = (count: number): QuotaSet => ({ provider: "codex", resetCredits: { availableCount: count, planType: "plus" }, windows: [{ window: "5-hour", percent: 24 }, { window: "Weekly", percent: 48 }] });
function Preview() {
  const [hint, setHint] = useState("Sample accounts · No provider requests");
  return <main className="home-accounts" style={{ width: params.get("width") === "380" ? 380 : 430, maxWidth: "100%", margin: "1rem auto", padding: "0 .9375rem" }}>
    <p style={{ color: "var(--home-muted)", fontSize: ".6875rem", marginBottom: ".75rem" }} role="status">{hint}</p>
    <WorkspaceAccounts workspace={workspace} profiles={{ profiles: accounts, activeProfileId: "active", canImport: false, switchError: null }} app={DEFAULT_APP_SETTINGS}
      quotas={{ active: usage(3), email: usage(1), zero: usage(0) }} busy={false}
      onManage={() => setHint("Read-only sample · Use account options in the native app")}
      onActivate={() => setHint("Read-only sample · Account switching is disabled here")} />
  </main>;
}
createRoot(document.getElementById("root")!).render(<TooltipProvider><Preview /></TooltipProvider>);
