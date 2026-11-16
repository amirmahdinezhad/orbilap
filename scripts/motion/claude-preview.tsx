import React from "react";
import { createRoot } from "react-dom/client";
import { setFixtureHandler } from "./bridge";
import { DEFAULT_APP_SETTINGS, DEFAULT_WORKSPACE_USAGE, type AppState, type ClaudeProfile, type CodexProfile } from "../../src/types";
import type { QuotaSet } from "../../src/api";
import { applyDisplayPrefs, DEFAULT_DISPLAY_PREFS } from "../../src/displayPrefs";
import { TooltipProvider } from "../../src/components/ui/tooltip";
import "../../src/index.css";
import "../../src/panel.css";
import "../../src/home.css";
import "../../src/surfaces.css";
import "../../src/orbilap.css";

const codexQuota: QuotaSet = { provider: "codex", windows: [{ window: "5-hour", percent: 32 }] };
const claudeQuota: QuotaSet = {
  provider: "claude",
  windows: [
    { window: "5-hour", percent: 28, resetsAt: new Date(Date.now() + 7_200_000).toISOString() },
    { window: "weekly", percent: 54, resetsAt: new Date(Date.now() + 259_200_000).toISOString() },
  ],
};
const codex: CodexProfile = {
  id: "demo-codex", name: "Codex demo", email: "codex-demo@example.com", plan: "plus",
  active: true, connected: true, needsActivation: false, connectionError: null, loginCommand: "",
};
const claude: ClaudeProfile = {
  id: "demo-claude", name: "Claude demo", email: "claude-demo@example.com",
  active: true, connected: true, configDir: "", createdAt: "", loginCommand: "", launchCommand: "",
  subscription: { id: "demo-claude", service: "Claude", plan: "max" }, quota: claudeQuota,
};
const state: AppState = {
  settings: { openAtLogin: false },
  app: {
    ...DEFAULT_APP_SETTINGS,
    workspaceVersion: 1,
    activeWorkspaceId: "preview",
    workspaces: [{
      id: "preview", name: "Demo preview", accent: "#007aff",
      accountIds: [codex.id], claudeAccountIds: [claude.id], antigravityAccountIds: [],
      usage: {
        ...DEFAULT_WORKSPACE_USAGE,
        menuBarProviders: ["codex", "claude"],
        showProviderLogos: true, showAccountName: false, menuBarStyle: "percentages",
        accountWindows: { [codex.id]: ["5-hour"], [claude.id]: ["5-hour", "weekly"] },
      },
    }],
  },
};

setFixtureHandler(async (command) => {
  switch (command) {
    case "get_state": return state;
    case "codex_profiles": return { profiles: [codex], activeProfileId: codex.id, canImport: false, switchError: null };
    case "claude_profiles": return [claude];
    case "cli_status": return [{
      id: "claude", label: "Claude Code", binary: "claude", binaryFound: true,
      loggedIn: true, email: claude.email, authMethod: "demo", loginCmd: "", subscriptions: [claude.subscription],
    }];
    case "codex_profile_quota":
    case "codex_account_quota": return codexQuota;
    case "claude_profile_quota": return claudeQuota;
    case "cli_quotas": return [claudeQuota];
    case "antigravity_accounts":
    case "load_setup_accounts": return [];
    case "codex_banked_resets": return { credits: [], supported: false };
    case "codex_reset_status": return { latestReset: null, scheduledReset: null, activeWatch: null, generatedAt: new Date().toISOString() };
    case "codex_restart_status":
    case "set_panel_file_import": return null;
    default: throw new Error("This action is unavailable in the demo preview.");
  }
});

applyDisplayPrefs(DEFAULT_DISPLAY_PREFS);
const { default: App } = await import("../../src/App");
createRoot(document.getElementById("root")!).render(<TooltipProvider>
  <div style={{ padding: "6px 16px", fontSize: 11, color: "var(--home-muted)" }}>Demo preview · Sample usage</div>
  <App />
</TooltipProvider>);
