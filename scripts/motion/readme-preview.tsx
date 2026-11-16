// Isolated README fixture: real components, synthetic identities, no native IPC.
import React from "react";
import { createRoot } from "react-dom/client";
import { setFixtureHandler } from "./bridge";
import { DEFAULT_APP_SETTINGS, DEFAULT_WORKSPACE_USAGE, type AppState, type CodexProfile } from "../../src/types";
import type { QuotaSet, SetupAccount } from "../../src/api";
import { applyDisplayPrefs, DEFAULT_DISPLAY_PREFS } from "../../src/displayPrefs";
import { TooltipProvider } from "../../src/components/ui/tooltip";
import "../../src/index.css";
import "../../src/panel.css";
import "../../src/home.css";
import "../../src/surfaces.css";
import "../../src/orbilap.css";

const profiles: CodexProfile[] = [
  { id: "personal", name: "Personal", email: "alex@example.com", plan: "plus", active: true },
  { id: "studio", name: "Studio", email: "alex@studio.example", plan: "pro", active: false },
].map(profile => ({ ...profile, connected: true, needsActivation: false, connectionError: null, loginCommand: "" }));
const antigravity: SetupAccount = {
  id: "research", provider: "antigravity", name: "Research", active: true, email: "research@example.com",
  subscription: { id: "google", service: "Google", plan: "Pro" },
};
const state: AppState = {
  settings: { openAtLogin: false },
  app: {
    ...DEFAULT_APP_SETTINGS, workspaceVersion: 1, activeWorkspaceId: "demo",
    workspaces: [{
      id: "demo", name: "Demo workspace", accent: "#007aff", accountIds: profiles.map(profile => profile.id),
      claudeAccountIds: [], antigravityAccountIds: [antigravity.id],
      usage: { ...DEFAULT_WORKSPACE_USAGE, showCodexResets: false, activeAccounts: { codex: "personal", antigravity: "research" } },
    }],
  },
};
const quota = (provider: string, used: number[]): QuotaSet => ({
  provider, windows: [{ window: "5-hour", percent: used[0] }, { window: "weekly", percent: used[1] }],
});
setFixtureHandler(async (command, args = {}) => {
  switch (command) {
    case "get_state": return state;
    case "codex_profiles": return { profiles, activeProfileId: "personal", canImport: false, switchError: null };
    case "codex_profile_quota":
    case "codex_account_quota": return quota("codex", args.id === "studio" ? [14, 37] : [32, 18]);
    case "antigravity_accounts": return [antigravity];
    case "antigravity_account_quota": return {
      provider: "antigravity", windows: [{ window: "Gemini · 5-hour", percent: 24 }, { window: "Gemini · Weekly", percent: 46 }],
    };
    case "claude_profiles":
    case "cli_status":
    case "cli_quotas": return [];
    case "codex_banked_resets": return { credits: [], supported: false };
    case "codex_reset_status": return { latestReset: null, scheduledReset: null, activeWatch: null, generatedAt: "2026-11-16T12:00:00Z" };
    case "codex_restart_status":
    case "set_panel_file_import": return null;
    default: throw new Error(`Unavailable in the README preview: ${command}`);
  }
});
const theme = new URLSearchParams(location.search).get("theme") === "light" ? "light" : "dark";
const prefs = { ...DEFAULT_DISPLAY_PREFS, theme } as const;
localStorage.setItem("orbilap.displayPrefs", JSON.stringify(prefs));
applyDisplayPrefs(prefs);
const { default: App } = await import("../../src/App");
createRoot(document.getElementById("root")!).render(<TooltipProvider><App /></TooltipProvider>);
