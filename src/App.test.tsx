import { findErrorToast, queryErrorToast } from "./test/notifications";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

const api = vi.hoisted(() => ({
  beginAccountSetup: vi.fn(), discardAccountSetup: vi.fn(), loadSetupAccounts: vi.fn(),
  startSetupLogin: vi.fn(), pollSetupLogin: vi.fn(), cancelSetupLogin: vi.fn(), submitSetupCode: vi.fn(),
  importSetupAccount: vi.fn(), connectCurrentGoogle: vi.fn(), connectSetupConfig: vi.fn(), commitAccountSetup: vi.fn(), removeWorkspaceAccount: vi.fn(), antigravityAccounts: vi.fn(), antigravityAccountQuota: vi.fn(),
  includeWorkspaceProvider: vi.fn(), getState: vi.fn(), setSettings: vi.fn(), setAppSettings: vi.fn(),
  codexProfileQuota: vi.fn(), setCodexAccountPreferences: vi.fn(), cliStatus: vi.fn(), codexProfiles: vi.fn(), claudeProfiles: vi.fn(),
  discoverWorkspaceAccounts: vi.fn(), createDiscoveredWorkspace: vi.fn(), createWorkspace: vi.fn(), importWorkspaceAccount: vi.fn(), selectWorkspace: vi.fn(), deleteWorkspace: vi.fn(), updateWorkspace: vi.fn(), moveWorkspaceAccount: vi.fn(),
  editClaudeProfile: vi.fn(), renameAntigravityAccount: vi.fn(), renameCodexProfile: vi.fn(), removeCodexProfile: vi.fn(), activateCodexProfile: vi.fn(),
  importCodexProfile: vi.fn(), importCodexProfileJson: vi.fn(), reconnectSetupAccount: vi.fn(),
  scheduleCodexRestart: vi.fn(), codexRestartStatus: vi.fn(), cancelCodexRestart: vi.fn(), runCodexRestartNow: vi.fn(),
  claudeProfileQuota: vi.fn(), codexBankedResets: vi.fn(), prepareCodexReset: vi.fn(), consumeCodexReset: vi.fn(),
  cliQuotas: vi.fn(), codexResetStatus: vi.fn(), quitApp: vi.fn(),
  prettyError: vi.fn((e: unknown) => e instanceof Error ? e.message : String(e)),
}));
vi.mock("./api", () => api);
const nativeEvents = vi.hoisted(() => ({ listen: vi.fn() }));
vi.mock("@tauri-apps/api/event", () => nativeEvents);
import App from "./App";
import type { SetupAccount } from "./api";
const opener = vi.hoisted(() => ({ openUrl: vi.fn().mockResolvedValue(undefined) }));
vi.mock("@tauri-apps/plugin-opener", () => opener);
import { makeState } from "./test/fixtures";
import { DEFAULT_CODEX_ACCOUNT_PREFERENCES, DEFAULT_WORKSPACE_USAGE, type AppState, type CodexProfile, type Workspace } from "./types";

const personal: CodexProfile = { id: "personal", name: "Personal account", email: "personal@example.com", plan: "plus", connected: true, active: true, needsActivation: false, connectionError: null, loginCommand: "" };
const work: CodexProfile = { ...personal, id: "work", name: "Work account", email: "work@example.com", active: false };
const studio: Workspace = { id: "studio", name: "Studio", accent: "#7c6cf0", accountIds: [personal.id, work.id], usage: { ...DEFAULT_WORKSPACE_USAGE } };
function savedState(workspaces = [studio], activeWorkspaceId = workspaces[0]?.id ?? null): AppState {
  return makeState({ app: { ...makeState().app, workspaceVersion: 1, workspaces, activeWorkspaceId } });
}
const claude = { id: "claude", label: "Claude", binary: "claude", binaryFound: true, loggedIn: true, authMethod: "claude.ai", email: "claude@example.com", loginCmd: "claude auth login", installUrl: "https://claude.com" };
const stagedClaude: SetupAccount = { id: "staged-claude", provider: "claude", name: "Claude", email: "claude@example.com", source: "cli", subscription: { id: "claude", service: "Claude", plan: "pro" } };
const stagedCodex: SetupAccount = { id: "staged-codex", provider: "codex", name: "Backup", email: "backup@example.com", source: "desktop", subscription: { id: "chatgpt", service: "ChatGPT", plan: "plus" } };
beforeEach(() => {
  vi.resetAllMocks(); localStorage.clear();
  api.claudeProfileQuota.mockResolvedValue({provider:"claude",windows:[]});
  api.antigravityAccountQuota.mockResolvedValue({provider:"antigravity",windows:[]});
  api.cliQuotas.mockResolvedValue([]);
  nativeEvents.listen.mockResolvedValue(vi.fn());
  api.beginAccountSetup.mockResolvedValue("draft"); api.discardAccountSetup.mockResolvedValue(undefined);
  api.loadSetupAccounts.mockResolvedValue([stagedClaude]); api.commitAccountSetup.mockResolvedValue(savedState());
  api.importSetupAccount.mockResolvedValue(stagedCodex); api.connectSetupConfig.mockResolvedValue(stagedClaude);
  api.cancelSetupLogin.mockResolvedValue(undefined); api.submitSetupCode.mockResolvedValue(undefined); opener.openUrl.mockResolvedValue(undefined);
  api.startSetupLogin.mockResolvedValue({ attemptId: "attempt", status: "pending", authUrl: "https://auth.openai.com/authorize", userCode: null, error: null, account: null });
  api.pollSetupLogin.mockResolvedValue({ attemptId: "attempt", status: "completed", authUrl: null, userCode: null, error: null, account: stagedCodex });
  api.prettyError.mockImplementation((e) => e instanceof Error ? e.message : String(e));
  api.getState.mockResolvedValue(savedState());
  api.cliStatus.mockResolvedValue([claude]);
  api.discoverWorkspaceAccounts.mockResolvedValue([{ ...claude, subscriptions: [{ id: "claude", service: "Claude", plan: "pro" }] }]);
  api.claudeProfiles.mockResolvedValue([]);
  api.antigravityAccounts.mockResolvedValue([]);
  api.codexProfiles.mockResolvedValue({ profiles: [personal, work], activeProfileId: personal.id, canImport: true, switchError: null });
  api.codexProfileQuota.mockResolvedValue({ provider: "codex", windows: [{ window: "5-hour", percent: 20 }] });
  api.codexRestartStatus.mockResolvedValue(null);
  api.codexResetStatus.mockResolvedValue({ latestReset: null, scheduledReset: null, activeWatch: null, generatedAt: new Date().toISOString() });
});
afterEach(() => { cleanup(); vi.restoreAllMocks(); });

async function uploadAuth(user: ReturnType<typeof userEvent.setup>, credentials: string) {
  await user.upload(screen.getByLabelText("Choose auth.json file"), new File([credentials], "auth.json", { type: "application/json" }));
  await screen.findByText("Ready to verify");
}

async function identity(user: ReturnType<typeof userEvent.setup>, name = "Lab") {
  await user.type(await screen.findByLabelText("Workspace name"), name);
  await user.click(screen.getByRole("button", { name: "Next" }));
}
async function fileMethod(user: ReturnType<typeof userEvent.setup>) {
  if (screen.queryByLabelText("Step 2 of 3")) await user.click(screen.getByRole("button", { name: "Next" }));
  if (!screen.queryByRole("group", { name: "Choose provider" })) await user.click(screen.getByRole("button", { name: "Add account" }));
  await user.click(await screen.findByRole("button", { name: "ChatGPT / Codex" }));
  await user.click(screen.getByRole("button", { name: /Import auth.json/ }));
}

it("ignores Tab and Shift+Tab on home and in portaled dialogs while other keys still work", async () => {
  const user = userEvent.setup();
  const { unmount } = render(<App />);
  const settings = await screen.findByRole("button", { name: /^Settings$/ });
  settings.focus();
  for (const shift of [false, true]) {
    await user.tab({ shift });
    expect(settings).toHaveFocus();
  }

  await user.keyboard("{Enter}");
  const general = await screen.findByRole("tab", { name: /^General$/ });
  general.focus();
  for (const shift of [false, true]) {
    await user.tab({ shift });
    expect(general).toHaveFocus();
  }

  const downstream = vi.fn();
  document.addEventListener("keydown", downstream, true);
  document.addEventListener("keyup", downstream, true);
  try {
    for (const type of ["keydown", "keyup"]) {
      const event = new KeyboardEvent(type, { key: "Tab", shiftKey: true, repeat: true, bubbles: true, cancelable: true });
      expect(general.dispatchEvent(event)).toBe(false);
      expect(event.defaultPrevented).toBe(true);
    }
    expect(downstream).not.toHaveBeenCalled();
  } finally {
    document.removeEventListener("keydown", downstream, true);
    document.removeEventListener("keyup", downstream, true);
  }

  await user.keyboard("{ArrowRight}");
  expect(screen.getByRole("tab", { name: /^Usage$/ })).toHaveAttribute("data-state", "active");
  await user.keyboard("{Escape}");
  await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
  expect(settings).toHaveFocus();
  unmount();
  expect(window.dispatchEvent(new KeyboardEvent("keydown", { key: "Tab", cancelable: true }))).toBe(true);
});

describe("workspace flow", () => {
  it("shows an active Codex account and an active Claude account at the same time", async () => {
    const loadedClaude = { id: "claude-loaded", name: "Claude current", configDir: "~/.claude", createdAt: "", email: "claude@example.com", connected: true, active: true, subscription: { id: "claude", service: "Claude", plan: "pro" }, loginCommand: "", launchCommand: "", quota: null };
    api.claudeProfiles.mockResolvedValue([loadedClaude]);
    api.getState.mockResolvedValue(savedState([{ ...studio, claudeAccountIds: [loadedClaude.id] }]));
    render(<App />);
    expect(within(await screen.findByRole("article", { name: "Personal account account" })).getByText("Active")).toBeInTheDocument();
    expect(within(await screen.findByRole("article", { name: "Claude current Claude account" })).getByText("Active")).toBeInTheDocument();
  });

  it("activates a saved Codex account without attempting a desktop restart on CLI-only Macs", async () => {
    const user = userEvent.setup();
    const inactive = { profiles: [{ ...personal, active: false }, work], activeProfileId: null, canImport: false, switchError: null, desktopInstalled: false };
    const active = { ...inactive, profiles: [inactive.profiles[0], { ...work, active: true }], activeProfileId: work.id, canImport: true };
    api.codexProfiles.mockResolvedValueOnce(inactive).mockResolvedValue(active);
    api.activateCodexProfile.mockResolvedValue(active);
    render(<App />);
    expect(await screen.findByText("Choose an account’s switch button to activate it in Codex.")).toBeVisible();
    await user.click(screen.getByRole("button", { name: "Switch to Work account" }));
    expect(api.activateCodexProfile).toHaveBeenCalledWith(work.id);
    expect(api.scheduleCodexRestart).not.toHaveBeenCalled();
    await waitFor(() => expect(within(screen.getByRole("article", { name: "Work account account" })).getByText("Active")).toBeVisible());
  });

  it("automatically loads verified accounts with their sources and no source picker", async () => {
    const user = userEvent.setup();
    api.getState.mockResolvedValue(savedState([]));
    api.loadSetupAccounts.mockResolvedValue([stagedCodex, stagedClaude]);
    render(<App />); await identity(user);
    const list = await screen.findByRole("group", { name: "Available accounts" });
    expect(within(list).getByText("Codex app")).toBeInTheDocument();
    expect(within(list).getByText("CLI")).toBeInTheDocument();
    expect(api.loadSetupAccounts).toHaveBeenCalledExactlyOnceWith("draft");
    expect(screen.queryByRole("button", { name: "Sources" })).not.toBeInTheDocument();
    expect(screen.queryByRole("radio")).not.toBeInTheDocument();
  });

  it("shows only verified logins that can be added from this Mac", async () => {
    const user = userEvent.setup();
    api.loadSetupAccounts.mockResolvedValue([
      { ...stagedCodex, id: "added-codex", email: "added@example.com", alreadyAdded: true },
      { ...stagedCodex, source: "cli", active: true },
    ]);
    render(<App />);
    await user.click(await screen.findByRole("button", { name: "Add account" }));
    await user.click(await screen.findByRole("button", { name: "ChatGPT / Codex" }));
    const select = await screen.findByRole("button", { name: "Select" });
    expect(api.loadSetupAccounts).toHaveBeenCalledExactlyOnceWith("draft", "codex");
    expect(screen.getByText("Codex CLI")).toBeInTheDocument();
    expect(screen.queryByText("added@example.com")).not.toBeInTheDocument();
    expect(within(screen.getByRole("region", {name:"ChatGPT / Codex accounts on this Mac"})).getByText("Active")).toBeInTheDocument();
    await user.click(select);
    expect(screen.getByRole("button", { name: "Selected" })).toHaveAttribute("aria-pressed", "true");
    await user.click(screen.getByRole("button", { name: "Add accounts" }));
    expect(api.commitAccountSetup).toHaveBeenCalledWith("draft", "Studio", studio.accent, [stagedCodex.id], "studio");
  });

  it("hides On this Mac during discovery and when the only login is already added", async () => {
    const user = userEvent.setup();
    let finish!: (accounts: SetupAccount[]) => void;
    api.loadSetupAccounts.mockImplementation(() => new Promise<SetupAccount[]>((resolve) => { finish = resolve; }));
    render(<App />);
    await user.click(await screen.findByRole("button", { name: "Add account" }));
    await user.click(await screen.findByRole("button", { name: "ChatGPT / Codex" }));
    await waitFor(() => expect(api.loadSetupAccounts).toHaveBeenCalledExactlyOnceWith("draft", "codex"));
    expect(screen.getByText("Verifying local accounts…")).toHaveClass("sr-only");
    expect(screen.queryByRole("heading", { name: "On this Mac" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Check local accounts again" })).not.toBeInTheDocument();
    expect(screen.queryByText("Or connect another account")).not.toBeInTheDocument();
    expect(screen.getByRole("group", { name: "Choose sign-in method" })).toBeVisible();
    await act(async () => finish([{ ...stagedCodex, alreadyAdded: true }]));
    expect(screen.queryByRole("region", { name: "ChatGPT / Codex accounts on this Mac" })).not.toBeInTheDocument();
    expect(screen.queryByText("Verifying local accounts…")).not.toBeInTheDocument();
    expect(screen.queryByText("Or connect another account")).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Add accounts" })).not.toBeInTheDocument();
    expect(api.commitAccountSetup).not.toHaveBeenCalled();
  });

  it("rejects a manually imported account that is already saved", async () => {
    const user = userEvent.setup();
    api.importSetupAccount.mockResolvedValue({ ...stagedCodex, alreadyAdded: true });
    render(<App />);
    await user.click(await screen.findByRole("button", { name: "Add account" }));
    await fileMethod(user);
    await uploadAuth(user, '{"tokens":{"access_token":"synthetic"}}');
    await user.click(screen.getByRole("button", { name: "Verify account" }));
    expect(await findErrorToast("This account is already added to Orbilap.")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Add accounts" })).not.toBeInTheDocument();
    expect(api.commitAccountSetup).not.toHaveBeenCalled();
  });

  it("ignores a local discovery response after choosing a different provider", async () => {
    const user = userEvent.setup();
    let finish!: (accounts: SetupAccount[]) => void;
    api.loadSetupAccounts.mockImplementationOnce(() => new Promise<SetupAccount[]>((resolve) => { finish = resolve; })).mockResolvedValue([stagedClaude]);
    render(<App />);
    await user.click(await screen.findByRole("button", { name: "Add account" }));
    await user.click(await screen.findByRole("button", { name: "ChatGPT / Codex" }));
    await waitFor(() => expect(api.loadSetupAccounts).toHaveBeenCalledTimes(1));
    await user.click(screen.getByRole("button", { name: "All providers" }));
    await user.click(screen.getByRole("button", { name: "Claude" }));
    await within(await screen.findByRole("region", { name: "Claude accounts on this Mac" })).findByText("claude@example.com");
    await act(async () => finish([stagedCodex]));
    expect(screen.queryByText("backup@example.com")).not.toBeInTheDocument();
    expect(within(screen.getByRole("region", { name: "Claude accounts on this Mac" })).getByText("claude@example.com")).toBeInTheDocument();
  });

  it("marks verified current logins Active in discovery and leaves saved backups unmarked", async () => {
    const user = userEvent.setup(); api.getState.mockResolvedValue(savedState([]));
    api.loadSetupAccounts.mockResolvedValue([{ ...stagedCodex, active: true }, { ...stagedClaude, active: true }, { ...stagedCodex, id: "saved-backup", name: "Saved backup", source: "saved", active: false }]);
    render(<App />); await identity(user);
    const list = await screen.findByRole("group", { name: "Available accounts" });
    expect(within(list).getAllByText("Active")).toHaveLength(2);
    expect(within(list).getByText("Saved backup").closest(".setup-account-option")).not.toHaveTextContent("Active");
    expect(within(list).getAllByRole("checkbox")).toHaveLength(3);
  });

  it("keeps the saved account name authoritative after reload", async () => {
    api.codexProfiles.mockResolvedValue({ profiles: [{ ...personal, name: "Work backup", displayName: "Emma Brooks", email: "work@example.com" }], activeProfileId: personal.id, canImport: true, switchError: null });
    render(<App />);
    const card = await screen.findByRole("article", { name: "Work backup account" });
    expect(within(card).queryByText("Emma Brooks")).not.toBeInTheDocument();
    expect(within(card).getByText("work@example.com")).toBeInTheDocument();
    expect(within(card).getByText("Work backup")).toBeInTheDocument();
  });

  it("shows the Codex profile name with its email when loading available accounts", async () => {
    const user = userEvent.setup();
    api.getState.mockResolvedValue(savedState([]));
    api.loadSetupAccounts.mockResolvedValue([{ ...stagedCodex, name: "ChatGPT account", displayName: "Emma Brooks" }]);
    render(<App />); await identity(user);
    expect(await screen.findByText("Emma Brooks")).toBeInTheDocument();
    expect(screen.getByText(stagedCodex.email!)).toBeInTheDocument();
    expect(screen.getByRole("checkbox", { name: "Add Emma Brooks to workspace" })).toBeInTheDocument();
    expect(screen.queryByText("ChatGPT account")).not.toBeInTheDocument();
  });

  it("automatically loads accounts and lets the optional third step use only existing selections", async () => {
    const user = userEvent.setup(); api.getState.mockResolvedValue(savedState([])); render(<App />);
    await identity(user, "Studio");
    expect(api.loadSetupAccounts).toHaveBeenCalledTimes(1); expect(api.cliStatus).not.toHaveBeenCalled();
    expect(screen.queryByRole("button", { name: "Load accounts" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Add new account" })).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Check accounts again" }).textContent).toBe("");
    expect(screen.queryByRole("button", { name: /Import auth.json/ })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Settings" })).not.toBeInTheDocument();

    expect(await screen.findByText("claude@example.com")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Create workspace" })).not.toBeInTheDocument();
    await user.click(screen.getByRole("checkbox", { name: "Add Claude to workspace" }));
    await user.click(screen.getByRole("button", { name: "Next" }));
    expect(screen.getByRole("heading", { name: "Add accounts" })).toBeInTheDocument();
    expect(document.querySelector(".workspace-add-accounts-art")).toBeVisible();
    await user.click(screen.getByRole("button", { name: "Create workspace" }));
    expect(api.commitAccountSetup).toHaveBeenCalledWith("draft", "Studio", "#64c998", [stagedClaude.id], null);
    expect(api.activateCodexProfile).not.toHaveBeenCalled();
  });
  it("shows one announced loading indicator during account discovery and refresh", async () => {
    const user = userEvent.setup(); api.getState.mockResolvedValue(savedState([]));
    let finish!: (accounts: SetupAccount[]) => void;
    api.loadSetupAccounts.mockImplementation(() => new Promise<SetupAccount[]>((resolve) => { finish = resolve; }));
    render(<App />); await identity(user);
    const loadingText = screen.getByText("Checking your accounts");
    expect(loadingText.closest('[role="status"]')).toHaveTextContent("Checking your accounts");
    expect(loadingText.previousElementSibling).toHaveClass("ak-spin");
    expect(loadingText.closest('[role="status"]')!.querySelector(".setup-account-check-art")).toBeNull();
    expect(screen.getByRole("button", { name: "Check accounts again" }).querySelector(".ak-spin")).toBeNull();
    expect(screen.getByRole("button", { name: "Check accounts again" })).toBeDisabled();
    await act(async () => finish([stagedClaude]));
    await user.click(screen.getByRole("button", { name: "Check accounts again" }));
    expect(screen.getByRole("button", { name: "Check accounts again" })).toHaveAttribute("aria-busy", "true");
    expect(document.querySelector(".setup-account-check-art")).toBeNull();
    expect(screen.getByText("Checking your accounts").closest('[role="status"]')!.querySelector(".ak-spin")).toBeInTheDocument();
    await act(async () => finish([stagedClaude]));
    expect(screen.getByRole("button", { name: "Check accounts again" })).toHaveAttribute("aria-busy", "false");
    expect(screen.queryByText(/Saved privately/)).not.toBeInTheDocument();
  });
  it("offers step three even when no existing paid accounts are found", async () => {
    const user = userEvent.setup(); api.getState.mockResolvedValue(savedState([])); api.loadSetupAccounts.mockResolvedValue([]); render(<App />);
    await identity(user);
    expect(await screen.findByText("No paid accounts found")).toBeInTheDocument();
    await fileMethod(user);
    expect(screen.getByLabelText("Choose auth.json file")).toBeInTheDocument();
    expect(screen.getByLabelText("Step 3 of 3")).toBeInTheDocument();
  });
  it("preserves existing selection across back, and removes unavailable accounts on reload", async () => {
    const user = userEvent.setup(); api.getState.mockResolvedValue(savedState([])); render(<App />); await identity(user);

    await user.click(await screen.findByRole("checkbox", { name: "Add Claude to workspace" }));
    await user.click(screen.getByRole("button", { name: "Back" })); await user.click(screen.getByRole("button", { name: "Next" }));
    expect(screen.getByRole("checkbox", { name: "Add Claude to workspace" })).toBeChecked();
    expect(api.loadSetupAccounts).toHaveBeenCalledTimes(1);
    api.loadSetupAccounts.mockResolvedValue([{...stagedClaude,id:"changed",email:"another@example.com"}]);
    await user.click(screen.getByRole("button", { name: "Check accounts again" })); await screen.findByText("another@example.com");
    expect(screen.getByRole("checkbox", { name: "Add Claude to workspace" })).not.toBeChecked();
  });
  it("keeps discovery errors inline and the new-account route reachable", async () => {
    const user = userEvent.setup(); api.getState.mockResolvedValue(savedState([])); api.loadSetupAccounts.mockRejectedValue(new Error("Cannot read CLI accounts"));
    render(<App />); await identity(user);
    expect(await findErrorToast("Cannot read CLI accounts")).toHaveTextContent("Cannot read CLI accounts"); await fileMethod(user);
    expect(screen.getByLabelText("Choose auth.json file")).toBeInTheDocument();
  });
  it("keeps a workspace draft until the user explicitly discards it", async () => {
    const user = userEvent.setup(); render(<App />); await user.click(await screen.findByRole("combobox", { name: "Workspace" }));
    await user.click(screen.getByRole("button", { name: "New workspace" }));
    await user.type(screen.getByLabelText("Workspace name"), "Unsaved"); await user.click(screen.getByRole("button", { name: "Close" }));
    expect(screen.getByRole("alertdialog", { name: "Discard changes?" })).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Keep editing" })); expect(screen.getByLabelText("Workspace name")).toHaveValue("Unsaved");
    await user.keyboard("{Escape}"); await user.click(screen.getByRole("button", { name: "Discard changes" }));
    expect(api.commitAccountSetup).not.toHaveBeenCalled();
  });
  it("keeps file enrollment in a modal with workspace save actions unavailable", async () => {
    const user = userEvent.setup(); api.getState.mockResolvedValue(savedState([])); render(<App />); await identity(user); await fileMethod(user);
    await uploadAuth(user, '{"fixture":true}');
    expect(screen.getByRole("dialog", { name: "Import login files" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Create workspace" })).not.toBeInTheDocument();
    expect(screen.queryByText("Enter a file path instead")).not.toBeInTheDocument();
    expect(screen.queryByText("claude@example.com")).not.toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Close" }));
    await user.click(screen.getByRole("button", { name: "Keep editing" }));
    expect(screen.queryByLabelText("Account name")).not.toBeInTheDocument();
    expect(screen.getByText("Ready to verify")).toBeInTheDocument();
    expect(api.importSetupAccount).not.toHaveBeenCalled();
  });
  it("verifies a file before allowing final workspace commit and never activates it", async () => {
    api.importSetupAccount.mockResolvedValue({ ...stagedCodex, name: "Emma Brooks", displayName: "Emma Brooks" });
    const user = userEvent.setup(); api.getState.mockResolvedValue(savedState([])); api.commitAccountSetup.mockImplementation(async () => {api.getState.mockResolvedValue(savedState());return savedState();});
    render(<App />); await user.type(await screen.findByLabelText("Workspace name"), "Studio");
    await user.click(screen.getByRole("button", { name: "Next" })); await fileMethod(user); expect(screen.queryByLabelText("Account name")).not.toBeInTheDocument(); await uploadAuth(user, '{"fixture":true}');
    expect(screen.queryByRole("button", { name: "Create workspace" })).not.toBeInTheDocument(); await user.click(screen.getByRole("button", { name: "Verify account" }));
    expect(api.importSetupAccount).toHaveBeenCalledWith("draft", "codex", "", {credentials:'{"fixture":true}'});
    await screen.findByText("Account added");
    expect(screen.queryByRole("dialog", { name: "Add account" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Done" })).not.toBeInTheDocument();
    expect(screen.queryByText("Account verified and ready to add")).not.toBeInTheDocument();
    expect(within(screen.getByRole("group", { name: "Added accounts" })).getByText("backup@example.com")).toBeInTheDocument();
    expect(within(screen.getByRole("group", { name: "Added accounts" })).getByText("Emma Brooks")).toBeInTheDocument();
    expect(screen.getByRole("checkbox", { name: "Include Emma Brooks" })).toBeChecked();
    expect(screen.queryByText("claude@example.com")).not.toBeInTheDocument();
    expect(api.commitAccountSetup).not.toHaveBeenCalled();
    await user.click(screen.getByRole("button", { name: "Create workspace" }));
    expect(api.commitAccountSetup).toHaveBeenCalledWith("draft", "Studio", "#64c998", [stagedCodex.id], null);
    expect(await screen.findByRole("article", {name:"Personal account account"})).toBeInTheDocument(); expect(api.activateCodexProfile).not.toHaveBeenCalled();
  });
  it("rejects failed or unknown paid-plan verification without committing a workspace", async () => {
    const user = userEvent.setup(); api.getState.mockResolvedValue(savedState([])); api.importSetupAccount.mockRejectedValue(new Error("A paid plan could not be confirmed"));
    render(<App />); await identity(user); await fileMethod(user); await uploadAuth(user,"{}");
    await user.click(screen.getByRole("button", {name:"Verify account"})); expect(await findErrorToast("paid plan")).toHaveTextContent("paid plan");
    expect(screen.queryByRole("button", {name:"Create workspace"})).not.toBeInTheDocument(); expect(api.commitAccountSetup).not.toHaveBeenCalled();
  });
  it("adds a file to an existing workspace through the same staged flow", async () => {
    const user = userEvent.setup(); render(<App />); await user.click(await screen.findByRole("button", {name:"Add account"}));
    expect(screen.getByRole("group", {name:"Choose provider"})).toBeInTheDocument();
    expect(screen.getAllByRole("dialog", {hidden:true})).toHaveLength(1);
    expect(screen.queryByRole("button", {name:"Add accounts"})).not.toBeInTheDocument();
    await fileMethod(user);
    await uploadAuth(user,'{"fixture":true}'); await user.click(screen.getByRole("button",{name:"Verify account"}));
    await screen.findByText("Account added");
    expect(screen.getByRole("heading", { name: "Studio", level: 3 })).toHaveFocus();
    const account = screen.getByRole("checkbox", { name: `Include ${stagedCodex.name}` });
    const submit = screen.getByRole("button", { name: "Add accounts" });
    await user.click(screen.getByRole("button", { name: "Clear selection" }));
    expect(account).not.toBeChecked();
    expect(submit).toBeDisabled();
    expect(screen.getByText("0 selected")).toBeVisible();
    await user.click(account);
    expect(screen.getByText("1 selected")).toBeVisible();
    await user.click(submit);
    expect(api.commitAccountSetup).toHaveBeenCalledWith("draft","Studio","#7c6cf0",[stagedCodex.id],"studio");
  });
  it("supports browser sign-in and only adds the verified resulting account", async () => {
    const user = userEvent.setup(); render(<App />); await user.click(await screen.findByRole("button",{name:"Add account"}));
    await user.click(screen.getByRole("button",{name:"ChatGPT / Codex"})); await user.click(screen.getByRole("button",{name:/Sign in with ChatGPT/}));
    expect(screen.queryByLabelText("Account name")).not.toBeInTheDocument(); expect(screen.queryByRole("button",{name:"Continue in browser"})).not.toBeInTheDocument();
    expect(await screen.findByText(/Finish signing in/)).toBeInTheDocument(); expect(api.commitAccountSetup).not.toHaveBeenCalled();
    expect(opener.openUrl).toHaveBeenCalledWith("https://auth.openai.com/authorize"); await screen.findByText("Account added");
    expect(api.startSetupLogin).toHaveBeenCalledWith("draft","codex","browser","");
  });
  it("opens the default browser once when the CLI supplies its URL after startup", async () => {
    const user = userEvent.setup();
    api.startSetupLogin.mockResolvedValue({ attemptId: "browser", status: "pending", authUrl: null, userCode: null, error: null, account: null });
    api.pollSetupLogin.mockResolvedValue({ attemptId: "browser", status: "pending", authUrl: "https://auth.openai.com/authorize", userCode: null, error: null, account: null });
    render(<App />);
    await user.click(await screen.findByRole("button", { name: "Add account" }));
    await user.click(await screen.findByRole("button", { name: "ChatGPT / Codex" }));
    await user.click(await screen.findByRole("button", { name: "Sign in with ChatGPT" }));
    expect(screen.queryByRole("button", { name: "Copy link" })).not.toBeInTheDocument();
    await waitFor(() => expect(opener.openUrl).toHaveBeenCalledWith("https://auth.openai.com/authorize"));
    expect(await screen.findByText("Waiting for browser sign-in")).toBeVisible();
    const help = screen.getByRole("button", { name: "Device limit help" });
    expect(screen.getByRole("button", { name: "Copy link" })).toBeVisible();
    await user.click(help);
    expect(screen.getByRole("dialog", { name: "Device limit reached?" })).toHaveTextContent("Private or Incognito");
    await user.keyboard("{Escape}");
    await waitFor(() => expect(help).toHaveFocus());
    expect(screen.getByText("Waiting for browser sign-in")).toBeVisible();
    await waitFor(() => expect(api.pollSetupLogin.mock.calls.length).toBeGreaterThanOrEqual(2), { timeout: 2000 });
    expect(opener.openUrl).toHaveBeenCalledTimes(1);
  });
  it("retries normal browser opening and copies the same pending link without starting another login", async () => {
    const user = userEvent.setup();
    const authUrl = "https://auth.openai.com/authorize?state=synthetic-browser";
    api.startSetupLogin.mockResolvedValue({ attemptId: "browser", status: "pending", authUrl, userCode: null, error: null, account: null });
    api.pollSetupLogin.mockReturnValue(new Promise(() => {}));
    opener.openUrl.mockRejectedValueOnce(new Error("Couldn’t open your browser."));
    render(<App />);
    await user.click(await screen.findByRole("button", { name: "Add account" }));
    await user.click(await screen.findByRole("button", { name: "ChatGPT / Codex" }));
    await user.click(screen.getByRole("button", { name: "Sign in with ChatGPT" }));
    expect(await findErrorToast("Couldn’t open your browser.")).toHaveTextContent("Couldn’t open your browser.");
    await user.click(screen.getByRole("button", { name: "Open browser" }));
    await waitFor(() => expect(queryErrorToast()).not.toBeInTheDocument());
    expect(opener.openUrl.mock.calls).toEqual([[authUrl], [authUrl]]);
    await user.click(screen.getByRole("button", { name: "Copy link" }));
    expect(await navigator.clipboard.readText()).toBe(authUrl);
    expect(screen.getByRole("button", { name: "Copied" })).toBeVisible();
    expect(api.startSetupLogin).toHaveBeenCalledTimes(1);
    expect(opener.openUrl).toHaveBeenCalledTimes(2);
    expect(api.commitAccountSetup).not.toHaveBeenCalled();
  });
  it("keeps browser sign-in cancellable when copying its link fails", async () => {
    const user = userEvent.setup();
    api.startSetupLogin.mockResolvedValue({ attemptId: "browser", status: "pending", authUrl: "https://auth.openai.com/authorize", userCode: null, error: null, account: null });
    api.pollSetupLogin.mockReturnValue(new Promise(() => {}));
    vi.spyOn(navigator.clipboard, "writeText").mockRejectedValueOnce(new Error("Clipboard unavailable"));
    render(<App />);
    await user.click(await screen.findByRole("button", { name: "Add account" }));
    await user.click(await screen.findByRole("button", { name: "ChatGPT / Codex" }));
    await user.click(screen.getByRole("button", { name: "Sign in with ChatGPT" }));
    await user.click(screen.getByRole("button", { name: "Copy link" }));
    expect(await findErrorToast("Couldn’t copy the sign-in link.")).toHaveTextContent("Couldn’t copy the sign-in link.");
    const cancel = screen.getByRole("button", { name: "Cancel sign-in" });
    expect(cancel).toHaveClass("ui-button-secondary");
    const actionRow = cancel.parentElement!;
    expect(actionRow).toHaveClass("action-row");
    expect(Array.from(actionRow.querySelectorAll("button"))).toEqual([
      cancel, screen.getByRole("button", { name: "Open browser" }),
    ]);
    expect(actionRow.contains(screen.getByRole("button", { name: "Copy link" }))).toBe(false);
    await user.click(cancel);
    expect(api.cancelSetupLogin).toHaveBeenCalledWith("draft");
    expect(await screen.findByRole("button", { name: "Use a device code" })).toBeVisible();
    expect(api.commitAccountSetup).not.toHaveBeenCalled();
  });
  it("cancels a pending device login and discards its draft on confirmed close", async () => {
    const user = userEvent.setup(); api.startSetupLogin.mockResolvedValue({attemptId:"device",status:"pending",authUrl:"https://auth.openai.com/codex/device",userCode:"ABCD-EFGH",error:null,account:null}); api.pollSetupLogin.mockReturnValue(new Promise(()=>{}));
    render(<App />); await user.click(await screen.findByRole("button",{name:"Add account"}));
    await user.click(screen.getByRole("button",{name:"ChatGPT / Codex"})); await user.click(screen.getByRole("button",{name:/Use a device code/}));
    expect(screen.queryByLabelText("Account name")).not.toBeInTheDocument(); expect(screen.queryByRole("button",{name:"Get device code"})).not.toBeInTheDocument(); expect(api.startSetupLogin).toHaveBeenCalledWith("draft","codex","device","");
    expect(await screen.findByText("ABCD-EFGH")).toBeInTheDocument(); await user.click(screen.getByRole("button",{name:"Cancel sign-in"})); expect(api.cancelSetupLogin).toHaveBeenCalledWith("draft");
    await screen.findByRole("button", { name: /Use a device code/ });
    await user.click(screen.getByRole("button",{name:"Close"})); await waitFor(()=>expect(api.discardAccountSetup).toHaveBeenCalledWith("draft"));
  });
  it("returns failed direct starts to the method picker and retries only on another choice", async () => {
    const user = userEvent.setup();
    api.startSetupLogin.mockRejectedValueOnce(new Error("CLI unavailable"));
    api.pollSetupLogin.mockReturnValue(new Promise(() => {}));
    render(<App />); await user.click(await screen.findByRole("button", { name: "Add account" }));
    await user.click(await screen.findByRole("button", { name: "ChatGPT / Codex" }));
    await user.click(screen.getByRole("button", { name: "Sign in with ChatGPT" }));
    expect(await findErrorToast("CLI unavailable")).toHaveTextContent("CLI unavailable");
    expect(await screen.findByRole("group", { name: "Choose sign-in method" })).toBeInTheDocument();
    expect(api.startSetupLogin).toHaveBeenCalledTimes(1);
    await user.click(screen.getByRole("button", { name: "Sign in with ChatGPT" }));
    expect(await screen.findByText(/Finish signing in/)).toBeInTheDocument();
    expect(api.startSetupLogin).toHaveBeenCalledTimes(2);
    await user.click(screen.getByRole("button", { name: "Cancel sign-in" }));
    expect(await screen.findByRole("group", { name: "Choose sign-in method" })).toBeInTheDocument();
  });
  it("returns to sign-in options when polling fails and focuses the step heading", async () => {
    const user = userEvent.setup();
    api.pollSetupLogin.mockRejectedValueOnce(new Error("Sign-in expired. Try again."));
    render(<App />);
    await user.click(await screen.findByRole("button", { name: "Add account" }));
    await user.click(await screen.findByRole("button", { name: "ChatGPT / Codex" }));
    await user.click(screen.getByRole("button", { name: "Sign in with ChatGPT" }));
    expect(await findErrorToast("Sign-in expired")).toHaveTextContent("Sign-in expired");
    expect(await screen.findByRole("group", { name: "Choose sign-in method" })).toBeInTheDocument();
    await waitFor(() => expect(screen.getByRole("heading", { name: "ChatGPT / Codex" })).toHaveFocus());
    expect(screen.queryByText("Starting sign-in…")).not.toBeInTheDocument();
  });
  it("confirms a device code was copied without finishing sign-in", async () => {
    const user = userEvent.setup();
    api.startSetupLogin.mockResolvedValue({ attemptId: "device", status: "pending", authUrl: "https://auth.openai.com/codex/device", userCode: "ABCD-EFGH", error: null, account: null });
    api.pollSetupLogin.mockReturnValue(new Promise(() => {}));
    render(<App />);
    await user.click(await screen.findByRole("button", { name: "Add account" }));
    await user.click(await screen.findByRole("button", { name: "ChatGPT / Codex" }));
    await user.click(screen.getByRole("button", { name: "Use a device code" }));
    await user.click(await screen.findByRole("button", { name: "Copy code" }));
    expect(await screen.findByRole("button", { name: "Copied" })).toBeInTheDocument();
    expect(await navigator.clipboard.readText()).toBe("ABCD-EFGH");
    expect(api.commitAccountSetup).not.toHaveBeenCalled();
  });
  it("blocks repeated direct starts while the first request is in flight", async () => {
    const user = userEvent.setup(); let finish!: (login: unknown) => void;
    api.startSetupLogin.mockReturnValueOnce(new Promise(resolve => { finish = resolve; }));
    api.pollSetupLogin.mockReturnValue(new Promise(() => {}));
    render(<App />); await user.click(await screen.findByRole("button", { name: "Add account" }));
    await user.click(await screen.findByRole("button", { name: "ChatGPT / Codex" }));
    await user.dblClick(screen.getByRole("button", { name: "Use a device code" }));
    expect(api.startSetupLogin).toHaveBeenCalledTimes(1);
    expect(screen.getByText("Starting sign-in…")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Close" })).toBeDisabled();
    await act(async () => finish({ attemptId: "direct", status: "pending", authUrl: null, userCode: "ABCD", error: null, account: null }));
    expect(await screen.findByText("ABCD")).toBeInTheDocument();
  });
  it("provides official Claude login and config-folder choices rather than a Codex file format", async () => {
    const user = userEvent.setup(); render(<App />); await user.click(await screen.findByRole("button",{name:"Add account"}));
    await user.click(screen.getByRole("button",{name:"Claude"}));
    expect(screen.getByRole("button",{name:/Sign in with Claude Code/})).toBeInTheDocument(); expect(screen.queryByRole("button",{name:/Import auth.json/})).not.toBeInTheDocument();
    await user.click(screen.getByRole("button",{name:/Connect a configuration/})); await user.type(screen.getByLabelText("Account name"),"Work Claude"); await user.type(screen.getByLabelText("Claude configuration folder"),"~/.claude-work");
    await user.click(screen.getByRole("button",{name:"Verify account"})); expect(api.connectSetupConfig).toHaveBeenCalledWith("draft","Work Claude","~/.claude-work");
  });
  it("saves selected existing and new accounts together in one final commit", async () => {
    const user=userEvent.setup();api.getState.mockResolvedValue(savedState([]));render(<App />);await identity(user);
    await user.click(await screen.findByRole("checkbox",{name:"Add Claude to workspace"}));
    await fileMethod(user);await uploadAuth(user,'{"fixture":true}');await user.click(screen.getByRole("button",{name:"Verify account"}));
    await screen.findByText("Account added");expect(api.commitAccountSetup).not.toHaveBeenCalled();
    await user.click(screen.getByRole("button",{name:"Create workspace"}));expect(api.commitAccountSetup).toHaveBeenCalledWith("draft","Lab","#64c998",[stagedClaude.id,stagedCodex.id],null);
  });
  it("keeps the draft open after commit failure and retries without repeating login", async () => {
    const user=userEvent.setup();api.getState.mockResolvedValue(savedState([]));api.commitAccountSetup.mockRejectedValueOnce(new Error("Cannot save settings"));render(<App />);await identity(user);
    await user.click(await screen.findByRole("checkbox",{name:"Add Claude to workspace"}));await user.click(screen.getByRole("button",{name:"Next"}));await user.click(screen.getByRole("button",{name:"Create workspace"}));
    expect(await findErrorToast("Cannot save settings")).toHaveTextContent("Cannot save settings");expect(screen.getByRole("heading", { name: "Add accounts" })).toBeInTheDocument();
    await user.click(screen.getByRole("button",{name:"Create workspace"}));expect(api.commitAccountSetup).toHaveBeenCalledTimes(2);
  });
  it("renders saved accounts and hides unselected providers", async () => {
    api.getState.mockResolvedValue(savedState([{...studio,providerIds:[]}])); render(<App />); await screen.findByRole("article",{name:"Personal account account"}); expect(screen.queryByRole("region",{name:"Claude accounts"})).not.toBeInTheDocument();
  });
  it("switches workspaces without changing the active CLI login", async () => {
    const user=userEvent.setup(); const first={...studio,accountIds:[personal.id]}; const second={...studio,id:"second",name:"Second",accountIds:[work.id]}; api.getState.mockResolvedValue(savedState([first,second])); api.selectWorkspace.mockResolvedValue(savedState([first,second],second.id));
    render(<App />); await screen.findByRole("article",{name:"Personal account account"}); await user.click(screen.getByRole("combobox",{name:"Workspace"})); await user.click(screen.getByRole("button",{name:"Second"}));
    expect(await screen.findByRole("article",{name:"Work account account"})).toBeInTheDocument(); expect(screen.queryByRole("article",{name:"Personal account account"})).not.toBeInTheDocument(); expect(api.activateCodexProfile).not.toHaveBeenCalled();
  });
});

describe("limit countdown and quick switching", () => {
  it("moves Active immediately on native success before the profile refresh returns", async () => {
    let switched!: (event: { payload: string }) => void;
    nativeEvents.listen.mockImplementation(async (name, callback) => { if (name === "codex-profile-switched") switched = callback; return vi.fn(); });
    render(<App />);
    const oldCard = await screen.findByRole("article", { name: "Personal account account" });
    expect(within(oldCard).getByText("Active")).toBeInTheDocument();
    api.codexProfiles.mockImplementation(() => new Promise(() => {}));
    await act(async () => switched({ payload: work.id }));
    expect(within(screen.getByRole("article", { name: "Work account account" })).getByText("Active")).toBeInTheDocument();
    expect(within(oldCard).queryByText("Active")).not.toBeInTheDocument();
  });

  it("selects the switched account for a menu bar using the same provider before refresh finishes", async () => {
    let switched!: (event: { payload: string }) => void;
    nativeEvents.listen.mockImplementation(async (name, callback) => { if (name === "codex-profile-switched") switched = callback; return vi.fn(); });
    api.getState.mockResolvedValue(savedState([{ ...studio, usage: { ...studio.usage, menuBarProvider: "codex", menuBarAccountId: personal.id } }]));
    const user = userEvent.setup(); render(<App />);
    await screen.findByRole("article", { name: "Work account account" });
    api.getState.mockImplementation(() => new Promise(() => {}));
    await act(async () => switched({ payload: work.id }));
    await user.click(screen.getByRole("button", { name: "Settings" }));
    await user.click(await screen.findByRole("tab", { name: "Menu bar" }));
    expect(screen.getByLabelText("Menu bar active account")).toHaveTextContent(work.name);
  });

  const fixed = Date.parse("2026-10-17T10:00:00Z");
  function exhausted() {
    vi.spyOn(Date, "now").mockReturnValue(fixed);
    api.codexProfileQuota.mockImplementation(async (id) => ({ provider: "codex", windows: id === personal.id ? [
      { window: "5-hour", percent: 100, resetsAt: "2026-10-17T11:00:00Z" },
      { window: "weekly", percent: 100, resetsAt: "2026-10-18T14:15:00Z" },
    ] : [{ window: "5-hour", percent: 20, resetsAt: "2026-10-17T14:00:00Z" }] }));
  }
  it("shows progress on the requested account while checking its capacity", async () => {
    const user = userEvent.setup(); render(<App />);
    await screen.findByRole("article", { name: "Work account account" });
    await waitFor(() => expect(screen.getByRole("group", { name: "Usage for Work account" })).toHaveAccessibleDescription());
    let resolve!: (quota: { provider: string; windows: { window: string; percent: number }[] }) => void;
    api.codexProfileQuota.mockImplementationOnce(() => new Promise(done => { resolve = done; }));
    const switchButton = screen.getByRole("button", { name: "Switch to Work account" });
    await user.click(switchButton);
    expect(switchButton).toHaveAttribute("aria-busy", "true");
    expect(switchButton).toHaveAttribute("aria-disabled", "true");
    await act(async () => { resolve({ provider: "codex", windows: [{ window: "weekly", percent: 100 }] }); });
    await screen.findByRole("dialog", { name: "Account limit reached" });
    expect(api.scheduleCodexRestart).not.toHaveBeenCalled();
  });
  it("warns before switching to a freshly limited account and never schedules a restart", async () => {
    const user = userEvent.setup(); render(<App />);
    await screen.findByRole("article", { name: "Work account account" });
    api.codexProfileQuota.mockResolvedValue({ provider: "codex", windows: [{ window: "weekly", percent: 100, resetsAt: new Date(Date.now() + 3_600_000).toISOString() }] });
    await user.click(screen.getByRole("button", { name: "Switch to Work account" }));
    const warning = await screen.findByRole("dialog", { name: "Account limit reached" });
    expect(warning).toHaveTextContent("Work account");
    expect(warning).toHaveTextContent("Codex may be unavailable on this account until the limit resets");
    expect(warning).toHaveTextContent("Resets in");
    expect(api.scheduleCodexRestart).not.toHaveBeenCalled();
    expect(api.activateCodexProfile).not.toHaveBeenCalled();
    await user.click(within(warning).getByRole("button", { name: "Cancel" }));
    expect(screen.queryByRole("dialog", { name: "Account limit reached" })).not.toBeInTheDocument();
  });
  it("switches anyway only after confirmation and keeps scheduling errors in the warning", async () => {
    const user = userEvent.setup(); render(<App />);
    await screen.findByRole("article", { name: "Work account account" });
    api.codexProfileQuota.mockResolvedValue({ provider: "codex", windows: [{ window: "weekly", percent: 100 }] });
    const status = { profileId: work.id, profileName: work.name, deadlineAt: new Date(Date.now()).toISOString(), phase: "quitting", error: null, processId: null, credentialsVerified: false };
    api.scheduleCodexRestart.mockRejectedValueOnce(new Error("Codex could not be started. Try again.")).mockResolvedValueOnce(status);
    await user.click(screen.getByRole("button", { name: "Switch to Work account" }));
    const warning = await screen.findByRole("dialog", { name: "Account limit reached" });
    expect(warning).toHaveTextContent("Reset time unavailable");
    expect(api.scheduleCodexRestart).not.toHaveBeenCalled();
    await user.click(within(warning).getByRole("button", { name: "Switch anyway" }));
    expect(await findErrorToast("Codex could not be started")).toHaveTextContent("Codex could not be started");
    expect(api.scheduleCodexRestart).toHaveBeenLastCalledWith(work.id, true);
    await user.click(within(warning).getByRole("button", { name: "Switch anyway" }));
    expect(await screen.findByLabelText("Account switch")).toHaveClass("sr-only");
    expect(screen.getByRole("button", { name: "Switch to Work account" })).toHaveAttribute("aria-busy", "true");
    expect(screen.queryByRole("dialog", { name: "Account limit reached" })).not.toBeInTheDocument();
    expect(api.scheduleCodexRestart).toHaveBeenCalledTimes(2);
    expect(api.activateCodexProfile).not.toHaveBeenCalled();
  });
  it("disables repeated confirmation while an override is being scheduled", async () => {
    const user = userEvent.setup(); render(<App />);
    await screen.findByRole("article", { name: "Work account account" });
    api.codexProfileQuota.mockResolvedValue({ provider: "codex", windows: [{ window: "weekly", percent: 100 }] });
    let finish!: (value: unknown) => void;
    api.scheduleCodexRestart.mockImplementation(() => new Promise((resolve) => { finish = resolve; }));
    await user.click(screen.getByRole("button", { name: "Switch to Work account" }));
    const warning = await screen.findByRole("dialog", { name: "Account limit reached" });
    const confirm = within(warning).getByRole("button", { name: "Switch anyway" });
    fireEvent.click(confirm); fireEvent.click(confirm);
    expect(api.scheduleCodexRestart).toHaveBeenCalledExactlyOnceWith(work.id, true);
    expect(within(warning).getByRole("button", { name: "Starting switch…" })).toBeDisabled();
    expect(within(warning).getByRole("button", { name: "Cancel" })).toBeDisabled();
    expect(within(warning).getByRole("status")).toHaveTextContent("Starting account switch");
    await act(async () => finish({ profileId: work.id, profileName: work.name, deadlineAt: new Date(Date.now()).toISOString(), phase: "quitting", error: null, processId: null, credentialsVerified: false }));
    expect(screen.queryByRole("dialog", { name: "Account limit reached" })).not.toBeInTheDocument();
  });
  it("does not retain the capacity override after dismissing a warning", async () => {
    const user = userEvent.setup(); render(<App />);
    await screen.findByRole("article", { name: "Work account account" });
    api.codexProfileQuota.mockResolvedValue({ provider: "codex", windows: [{ window: "5-hour", percent: 100 }] });
    await user.click(screen.getByRole("button", { name: "Switch to Work account" }));
    const warning = await screen.findByRole("dialog", { name: "Account limit reached" });
    await user.click(within(warning).getByRole("button", { name: "Cancel" }));
    api.codexProfileQuota.mockResolvedValue({ provider: "codex", windows: [{ window: "5-hour", percent: 20 }] });
    api.scheduleCodexRestart.mockResolvedValue({ profileId: work.id, profileName: work.name, deadlineAt: new Date(Date.now()).toISOString(), phase: "quitting", error: null, processId: null, credentialsVerified: false });
    await user.click(screen.getByRole("button", { name: "Switch to Work account" }));
    await waitFor(() => expect(api.scheduleCodexRestart).toHaveBeenCalledWith(work.id));
    expect(api.scheduleCodexRestart).toHaveBeenCalledTimes(1);
  });
  it("checks fresh usage and schedules a manual switch when the target still has capacity", async () => {
    const user = userEvent.setup();
    api.scheduleCodexRestart.mockResolvedValue({ profileId: work.id, profileName: work.name, deadlineAt: new Date(Date.now()).toISOString(), phase: "quitting", error: null, processId: null, credentialsVerified: false });
    render(<App />); await screen.findByRole("article", { name: "Work account account" });
    api.codexProfileQuota.mockClear();
    await user.click(screen.getByRole("button", { name: "Switch to Work account" }));
    await waitFor(() => expect(api.scheduleCodexRestart).toHaveBeenCalledWith(work.id));
    expect(api.codexProfileQuota).toHaveBeenCalledWith(work.id);
    expect(screen.queryByRole("dialog", { name: "Account limit reached" })).not.toBeInTheDocument();
  });
  it("keeps recovery details in meters without a limit footer and allows switching from the card header", async () => {
    const user = userEvent.setup(); exhausted();
    const status = { profileId: work.id, profileName: work.name, deadlineAt: "2026-10-17T10:00:00Z", phase: "quitting", error: null, processId: null, credentialsVerified: false };
    api.scheduleCodexRestart.mockResolvedValue(status);
    api.cancelCodexRestart.mockResolvedValue({ ...status, phase: "cancelled" });
    render(<App />);
    await screen.findByRole("article", { name: "Personal account account" });
    expect(screen.queryByLabelText("Account usage limit")).not.toBeInTheDocument();
    expect(screen.queryByText("Limit reached")).not.toBeInTheDocument();
    expect(screen.queryByText("Resets in 28h 15m")).not.toBeInTheDocument();
    const weekly = within(screen.getByRole("article", {name:"Personal account account"})).getByRole("meter", {name:"Weekly remaining"});
    expect(weekly).toHaveAttribute("aria-valuetext", expect.stringContaining("Reset countdown, 1d 4h left"));
    await user.click(screen.getByRole("button", { name: "Switch to Work account" }));
    expect(api.scheduleCodexRestart).toHaveBeenCalledWith(work.id);
    expect(await screen.findByLabelText("Account switch")).toHaveClass("sr-only");
    expect(screen.queryByRole("button", { name: "Switch now" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Cancel" })).not.toBeInTheDocument();
    expect(api.cancelCodexRestart).not.toHaveBeenCalled();
    expect(api.activateCodexProfile).not.toHaveBeenCalled();
  });
  it("omits the limit footer when no account has usable quota", async () => {
    exhausted(); api.codexProfileQuota.mockResolvedValue({ provider: "codex", windows: [{ window: "weekly", percent: 100, resetsAt: "2026-10-18T14:15:00Z" }] });
    render(<App />);
    await screen.findByRole("article", { name: "Personal account account" });
    expect(screen.queryByRole("button", { name: "Switch to next available account" })).not.toBeInTheDocument();
    expect(screen.queryByLabelText("Account usage limit")).not.toBeInTheDocument();
    expect(api.scheduleCodexRestart).not.toHaveBeenCalled();
  });
});

describe("settings and refresh", () => {
  it("shares a settings dialog while preserving workspace-scoped saves", async () => {
    const user = userEvent.setup(); api.updateWorkspace.mockImplementation(async (workspace) => savedState([workspace]));
    render(<App />); await screen.findByRole("combobox", { name: "Workspace" });
    await user.click(screen.getByRole("button", { name: "Settings" }));
    expect(await screen.findByRole("heading", { name: "Settings" })).toBeInTheDocument();
    expect(screen.queryByText("Codex account")).not.toBeInTheDocument();
    expect(screen.queryByRole("switch", { name: "Include reset predictions" })).not.toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Close" }));
    await user.click(screen.getByRole("button", { name: "Settings" }));
    await screen.findByRole("tab", { name: "General" });
    for (const name of ["General", "Usage", "Menu bar"]) expect(screen.getByRole("tab", { name })).toBeInTheDocument();
    await user.click(screen.getByRole("tab", { name: "Usage" }));
    await user.click(screen.getByRole("switch", { name: "Show reset updates" }));
    expect(api.updateWorkspace).toHaveBeenCalledWith(expect.objectContaining({ id: "studio", usage: expect.objectContaining({ showCodexResets: false }) }));
    expect(api.setAppSettings).not.toHaveBeenCalled();
  });

  it("renames the current workspace inline and keeps General free of workspace fields", async () => {
    const user = userEvent.setup();
    api.updateWorkspace.mockImplementation(async workspace => savedState([workspace]));
    render(<App />);
    await user.click(await screen.findByRole("button", { name: "Settings" }));
    expect(screen.getAllByRole("tab").map(tab => tab.textContent)).toEqual(["General", "Usage", "Menu bar", "Updates"]);
    expect(screen.queryByLabelText("Workspace name")).not.toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Close" }));
    await user.click(screen.getByRole("combobox", { name: "Workspace" }));
    await user.click(screen.getByRole("button", { name: "Rename" }));
    await user.clear(screen.getByRole("textbox", { name: "Workspace name" }));
    await user.type(screen.getByRole("textbox", { name: "Workspace name" }), "Office");
    await user.click(screen.getByRole("button", { name: "Save workspace name" }));
    await waitFor(() => expect(screen.getByRole("option", { name: "Office" })).toBeInTheDocument());
    expect(screen.getByRole("dialog", { name: "Workspaces" })).toBeInTheDocument();
    expect(api.updateWorkspace).toHaveBeenCalledExactlyOnceWith({ ...studio, name: "Office" });
    expect(api.setAppSettings).not.toHaveBeenCalled();
    await user.keyboard("{Escape}");
    expect(screen.getByRole("combobox", { name: "Workspace" })).toHaveAccessibleDescription("Office");
  });

  it("fetches Codex profile names only on explicit refresh and updates the card and initials", async () => {
    const user = userEvent.setup();
    render(<App />);
    await screen.findByRole("article", { name: "Work account account" });
    expect(api.codexProfiles).toHaveBeenCalledWith(false);
    api.codexProfiles.mockResolvedValue({ profiles: [personal, { ...work, name: "Updated in Codex", displayName: work.name }], activeProfileId: personal.id, canImport: true, switchError: null });
    await user.click(screen.getByRole("button", { name: "Refresh data" }));
    await waitFor(() => expect(api.codexProfiles).toHaveBeenCalledWith(true));
    const card = await screen.findByRole("article", { name: "Updated in Codex account" });
    expect(within(card).queryByText(work.name)).not.toBeInTheDocument();
    expect(card.querySelector(".account-monogram")).toHaveTextContent("UC");
  });

  it("shows only the saved account name after renaming even when provider metadata retains the old name", async () => {
    const user = userEvent.setup();
    api.codexProfiles.mockResolvedValue({ profiles: [personal, { ...work, displayName: work.name }], activeProfileId: personal.id, canImport: true, switchError: null });
    api.renameCodexProfile.mockResolvedValue({ profiles: [personal, { ...work, name: "Office", displayName: work.name }], activeProfileId: personal.id, canImport: true, switchError: null });
    render(<App />);
    await user.click(await screen.findByRole("button", { name: "More options for Work account" }));
    await user.clear(await screen.findByLabelText("Account name"));
    await user.type(screen.getByLabelText("Account name"), "Office");
    await user.click(screen.getByRole("button", { name: "Save" }));
    await waitFor(() => expect(api.renameCodexProfile).toHaveBeenCalledWith(work.id, "Office"));
    await user.click(screen.getByRole("button", { name: "Close" }));
    const card = await screen.findByRole("article", { name: "Office account" });
    expect(within(card).getByText("Office")).toBeVisible();
    expect(within(card).queryByText(work.name)).not.toBeInTheDocument();
    expect(within(card).getByText(work.email!)).toBeVisible();
    expect(card.querySelector(".account-monogram")).toHaveTextContent("OF");
  });

  it("reviews multiple JSON files, adds/removes selections and imports all verified accounts together", async () => {
    const user = userEvent.setup();
    render(<App />);
    await user.click(await screen.findByRole("button", { name: "Add account" }));
    await user.click(await screen.findByRole("button", { name: "ChatGPT / Codex" }));
    await user.click(await screen.findByRole("button", { name: "Import auth.json" }));
    const input = screen.getByLabelText("Choose auth.json file");
    await user.upload(input, [new File(['{"id":1}'], "one.json"), new File(['{"id":2}'], "two.json")]);
    expect(await screen.findByText("2 files")).toBeVisible();
    await user.upload(input, new File(['{"id":2}'], "two.json"));
    expect(screen.getByText("2 files")).toBeVisible();
    expect(screen.getAllByRole("button", { name: "Remove two.json" })).toHaveLength(1);
    await user.click(screen.getByRole("button", { name: "Remove one.json" }));
    await user.upload(input, [new File(['{"id":3}'], "three.json")]);
    expect(await screen.findByText("three.json")).toBeVisible();
    expect(api.importSetupAccount).not.toHaveBeenCalled();
    api.importSetupAccount.mockResolvedValueOnce({ ...stagedCodex, id: "two", name: "Second account" }).mockResolvedValueOnce({ ...stagedCodex, id: "three", name: "Third account" });
    await user.click(screen.getByRole("button", { name: "Verify accounts" }));
    expect(await screen.findByRole("checkbox", { name: "Include Second account" })).toBeChecked();
    expect(screen.getByRole("checkbox", { name: "Include Third account" })).toBeChecked();
    expect(api.importSetupAccount).toHaveBeenCalledTimes(2);
    expect(api.importSetupAccount.mock.calls.map(call => call[3])).toEqual([{ credentials: '{"id":2}' }, { credentials: '{"id":3}' }]);
    await user.click(screen.getByRole("button", { name: "Add accounts" }));
    await waitFor(() => expect(api.commitAccountSetup).toHaveBeenCalledWith("draft", studio.name, studio.accent, ["two", "three"], studio.id));
  });

  it("marks each verified file while the remaining files are still being checked", async () => {
    const user = userEvent.setup();
    let rejectSecond!: (error: Error) => void;
    api.importSetupAccount.mockResolvedValueOnce({ ...stagedCodex, name: "First verified account" })
      .mockImplementationOnce(() => new Promise((_, reject) => { rejectSecond = reject; }));
    render(<App />);
    await user.click(await screen.findByRole("button", { name: "Add account" }));
    await user.click(await screen.findByRole("button", { name: "ChatGPT / Codex" }));
    await user.click(await screen.findByRole("button", { name: "Import auth.json" }));
    await user.upload(screen.getByLabelText("Choose auth.json file"), [new File(['{"id":1}'], "first.json"), new File(['{"id":2}'], "second.json")]);
    await screen.findByText("2 files");
    await user.click(screen.getByRole("button", { name: "Verify accounts" }));
    const first = (await screen.findByText("First verified account")).closest("li")!;
    expect(first).toHaveClass("is-verified");
    expect(screen.getByText("second.json").closest("li")).not.toHaveClass("is-verified");
    expect(screen.getByRole("button", { name: "Verifying…" })).toBeDisabled();
    expect(screen.queryByRole("button", { name: "Continue with 1 account" })).not.toBeInTheDocument();
    expect(api.commitAccountSetup).not.toHaveBeenCalled();
    await act(async () => rejectSecond(new Error("Request timed out.")));
    expect(await findErrorToast("Request timed out.")).toHaveTextContent("Request timed out.");
    expect(first).toHaveClass("is-verified");
    expect(screen.getByRole("button", { name: "Continue with 1 account" })).toBeEnabled();
    expect(screen.queryByRole("button", { name: /^Verify accounts?$/ })).not.toBeInTheDocument();
    await user.upload(screen.getByLabelText("Choose auth.json file"), new File(['{"id":3}'], "third.json"));
    expect(await screen.findByRole("button", { name: "Verify accounts" })).toBeEnabled();
    await user.click(screen.getByRole("button", { name: "Remove third.json" }));
    expect(screen.queryByRole("button", { name: /^Verify accounts?$/ })).not.toBeInTheDocument();
  });

  it("renews an expired import through browser sign-in and returns it to the batch", async () => {
    const user = userEvent.setup();
    api.importSetupAccount.mockRejectedValueOnce("session could not be renewed — reconnect this account")
      .mockResolvedValueOnce({ ...stagedCodex, id: "other", name: "Other account" });
    render(<App />);
    await user.click(await screen.findByRole("button", { name: "Add account" }));
    await user.click(await screen.findByRole("button", { name: "ChatGPT / Codex" }));
    await user.click(await screen.findByRole("button", { name: "Import auth.json" }));
    await user.upload(screen.getByLabelText("Choose auth.json file"), [
      new File(['{"id":1}'], "expired.json"), new File(['{"id":2}'], "other.json"),
    ]);
    await screen.findByText("2 files");
    await user.click(screen.getByRole("button", { name: "Verify accounts" }));
    const renew = await screen.findByRole("button", { name: "Renew expired.json" });
    expect(screen.queryByRole("button", { name: "Verify accounts" })).not.toBeInTheDocument();
    renew.focus();
    await user.keyboard("{Enter}");
    expect(await screen.findByRole("dialog", { name: "Finish signing in" })).toBeVisible();
    expect(opener.openUrl).toHaveBeenCalledWith("https://auth.openai.com/authorize");
    expect(await screen.findByRole("checkbox", { name: `Include ${stagedCodex.name}` })).toBeChecked();
    expect(screen.getByRole("checkbox", { name: "Include Other account" })).toBeChecked();
    expect(api.importSetupAccount).toHaveBeenCalledTimes(2);
    expect(api.commitAccountSetup).not.toHaveBeenCalled();
  });

  it("keeps a failed JSON beside successful imports and continues with only verified accounts", async () => {
    const user = userEvent.setup();
    render(<App />);
    await user.click(await screen.findByRole("button", { name: "Add account" }));
    await user.click(await screen.findByRole("button", { name: "ChatGPT / Codex" }));
    await user.click(await screen.findByRole("button", { name: "Import auth.json" }));
    await user.upload(screen.getByLabelText("Choose auth.json file"), [new File(['{"id":1}'], "good.json"), new File(['{"id":2}'], "failed.json")]);
    await screen.findByText("2 files");
    api.importSetupAccount.mockResolvedValueOnce({ ...stagedCodex, name: "Verified account" }).mockRejectedValueOnce(new Error("Request timed out."));
    await user.click(screen.getByRole("button", { name: "Verify accounts" }));
    expect(await findErrorToast("Request timed out")).toHaveTextContent("Request timed out");
    expect(screen.getByText("Verified account")).toBeVisible();
    expect(api.commitAccountSetup).not.toHaveBeenCalled();
    await user.click(screen.getByRole("button", { name: "Remove failed.json" }));
    await user.click(screen.getByRole("button", { name: "Continue with 1 account" }));
    await waitFor(() => expect(api.commitAccountSetup).toHaveBeenCalledExactlyOnceWith("draft", studio.name, studio.accent, [stagedCodex.id], studio.id));
    await waitFor(() => expect(screen.queryByRole("dialog", { name: "Add account" })).not.toBeInTheDocument());
    expect(screen.getByRole("button", { name: "Add account" })).toBeVisible();
  });

  it("creates a workspace directly from Continue with verified accounts", async () => {
    const user = userEvent.setup();
    api.getState.mockResolvedValue(savedState([]));
    api.commitAccountSetup.mockImplementation(async () => {
      api.getState.mockResolvedValue(savedState());
      return savedState();
    });
    render(<App />);
    await identity(user, "Lab");
    await fileMethod(user);
    await user.upload(screen.getByLabelText("Choose auth.json file"), [new File(['{"id":1}'], "one.json"), new File(['{"id":2}'], "two.json"), new File(['{"id":3}'], "bad.json")]);
    await screen.findByText("3 files");
    api.importSetupAccount.mockResolvedValueOnce(stagedCodex).mockResolvedValueOnce({ ...stagedCodex, id: "second" }).mockRejectedValueOnce(new Error("Invalid file"));
    await user.click(screen.getByRole("button", { name: "Verify accounts" }));
    await user.click(await screen.findByRole("button", { name: "Continue with 2 accounts" }));
    await waitFor(() => expect(api.commitAccountSetup).toHaveBeenCalledExactlyOnceWith("draft", "Lab", "#64c998", [stagedCodex.id, "second"], null));
    expect(await screen.findByRole("button", { name: "Add account" })).toBeVisible();
    expect(screen.queryByLabelText("Create workspace")).not.toBeInTheDocument();
  });

  it("retains verified files after a final import save fails and retries without reverification", async () => {
    const user = userEvent.setup();
    render(<App />);
    await user.click(await screen.findByRole("button", { name: "Add account" }));
    await user.click(await screen.findByRole("button", { name: "ChatGPT / Codex" }));
    await user.click(await screen.findByRole("button", { name: "Import auth.json" }));
    await user.upload(screen.getByLabelText("Choose auth.json file"), [new File(['{"id":1}'], "good.json"), new File(['{"id":2}'], "failed.json")]);
    await screen.findByText("2 files");
    api.importSetupAccount.mockResolvedValueOnce(stagedCodex).mockRejectedValueOnce(new Error("Invalid login file"));
    await user.click(screen.getByRole("button", { name: "Verify accounts" }));
    await screen.findByRole("button", { name: "Continue with 1 account" });
    api.commitAccountSetup.mockRejectedValueOnce(new Error("Couldn’t save accounts. Try again."));
    await user.click(screen.getByRole("button", { name: "Continue with 1 account" }));
    expect(await screen.findByText("Couldn’t save accounts. Try again.")).toBeVisible();
    expect(screen.getByText(stagedCodex.name)).toBeVisible();
    expect(screen.queryByText("good.json")).not.toBeInTheDocument();
    expect(screen.getByText("failed.json")).toBeVisible();
    expect(await findErrorToast("Invalid login file")).toBeVisible();
    await user.click(screen.getByRole("button", { name: "Continue with 1 account" }));
    await waitFor(() => expect(api.commitAccountSetup).toHaveBeenCalledTimes(2));
    expect(api.commitAccountSetup).toHaveBeenLastCalledWith("draft", studio.name, studio.accent, [stagedCodex.id], studio.id);
    expect(api.importSetupAccount).toHaveBeenCalledTimes(2);
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
  });

  it("opens account settings with only rename and removal, separately from workspace preferences", async () => {
    const user = userEvent.setup();
    api.renameCodexProfile.mockResolvedValue({ profiles: [personal, { ...work, name: "Office" }], activeProfileId: personal.id, canImport: true, switchError: null });
    render(<App />);
    await user.click(await screen.findByRole("button", { name: "More options for Work account" }));
    const dialog = await screen.findByRole("dialog", { name: "Account settings" });
    expect(within(dialog).queryByRole("tab")).not.toBeInTheDocument();
    expect(within(dialog).queryByRole("switch")).not.toBeInTheDocument();
    expect(within(dialog).queryByRole("button", { name: "Replace login" })).not.toBeInTheDocument();
    await user.clear(screen.getByLabelText("Account name"));
    await user.type(screen.getByLabelText("Account name"), "Office");
    await user.click(screen.getByRole("button", { name: "Save" }));
    await waitFor(() => expect(api.renameCodexProfile).toHaveBeenCalledWith(work.id, "Office"));
    await user.click(screen.getByRole("button", { name: "Close" }));
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Settings" }));
    expect(screen.queryByRole("tab", { name: "Accounts" })).not.toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Close" }));
    await user.click(await screen.findByRole("button", { name: "More options for Office" }));
    expect(screen.getByLabelText("Account name")).toHaveValue("Office");
    expect(screen.queryByRole("button", { name: "Account color Moss" })).not.toBeInTheDocument();
  });

  it("removes an account from the current workspace only after confirmation", async () => {
    const user = userEvent.setup();
    api.removeWorkspaceAccount.mockResolvedValue(savedState([{ ...studio, accountIds: [personal.id] }]));
    render(<App />);
    await user.click(await screen.findByRole("button", { name: "More options for Work account" }));
    await user.click(screen.getByRole("button", { name: "Remove account" }));
    expect(api.removeWorkspaceAccount).not.toHaveBeenCalled();
    await user.click(screen.getByRole("button", { name: "Remove" }));
    await waitFor(() => expect(api.removeWorkspaceAccount).toHaveBeenCalledWith(studio.id, "codex", work.id, false));
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(screen.queryByRole("article", { name: "Work account account" })).not.toBeInTheDocument();
  });

  it.each(["claude", "antigravity"] as const)("uses the same rename/remove settings for %s", async (provider) => {
    const user = userEvent.setup();
    const id = `${provider}-saved`;
    const name = `${provider} Personal`;
    const account = { id, name, email: "account@example.com", configDir: "/tmp/claude-test", createdAt: "2026-10-01", active: true, connected: true, subscription: { id: provider, service: provider, plan: "pro" }, loginCommand: "", launchCommand: "", quota: null };
    const workspace = { ...studio, claudeAccountIds: provider === "claude" ? [id] : [], antigravityAccountIds: provider === "antigravity" ? [id] : [] };
    api.getState.mockResolvedValue(savedState([workspace]));
    api.claudeProfiles.mockResolvedValue(provider === "claude" ? [account] : []);
    api.antigravityAccounts.mockResolvedValue([{ ...account, provider: "antigravity" }]);
    api.editClaudeProfile.mockResolvedValue([{ ...account, name: "Office" }]);
    api.renameAntigravityAccount.mockResolvedValue(undefined);
    render(<App />);
    await user.click(await screen.findByRole("button", { name: `More options for ${name}` }));
    const dialog = await screen.findByRole("dialog", { name: "Account settings" });
    expect(within(dialog).queryByRole("tab")).not.toBeInTheDocument();
    expect(within(dialog).queryByRole("switch")).not.toBeInTheDocument();
    expect(within(dialog).queryByText("Configuration directory")).not.toBeInTheDocument();
    await user.clear(screen.getByLabelText("Account name"));
    await user.type(screen.getByLabelText("Account name"), "Office");
    const rename = provider === "claude" ? api.editClaudeProfile : api.renameAntigravityAccount;
    rename.mockRejectedValueOnce(new Error("Could not save account name"));
    await user.click(screen.getByRole("button", { name: "Save" }));
    expect(await findErrorToast("Could not save account name")).toHaveTextContent("Could not save account name");
    expect(screen.getByLabelText("Account name")).toHaveValue("Office");
    await user.click(screen.getByRole("button", { name: "Save" }));
    await waitFor(() => expect(provider === "claude" ? api.editClaudeProfile : api.renameAntigravityAccount).toHaveBeenCalledWith(id, "Office"));
    await user.click(screen.getByRole("button", { name: "Close" }));
    await user.click(await screen.findByRole("button", { name: "More options for Office" }));
    expect(screen.getByLabelText("Account name")).toHaveValue("Office");
    await user.click(screen.getByRole("button", { name: "Remove account" }));
    expect(api.removeWorkspaceAccount).not.toHaveBeenCalled();
    expect(screen.getByRole("button", { name: "Cancel" })).toHaveFocus();
    await user.click(screen.getByRole("button", { name: "Cancel" }));
    expect(screen.getByRole("button", { name: "Remove account" })).toHaveFocus();
    expect(screen.queryByRole("button", { name: "Remove from all workspaces" })).not.toBeInTheDocument();
    api.removeWorkspaceAccount.mockResolvedValue(savedState([{ ...workspace, claudeAccountIds: [], antigravityAccountIds: [] }]));
    await user.click(screen.getByRole("button", { name: "Remove account" }));
    await user.click(screen.getByRole("button", { name: "Remove" }));
    await waitFor(() => expect(api.removeWorkspaceAccount).toHaveBeenCalledWith(studio.id, provider, id, false));
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "More options for Office" })).not.toBeInTheDocument();
  });

  it("opens app and workspace preferences from the same settings button", async () => {
    const user = userEvent.setup(); render(<App />);
    await user.click(await screen.findByRole("button", { name: "Settings" }));
    for (const name of ["General", "Updates"]) expect(screen.getByRole("tab", { name })).toBeInTheDocument();
    expect(screen.queryByRole("tab", { name: "Alerts" })).not.toBeInTheDocument();
    expect(screen.queryByRole("tab", { name: "Display" })).not.toBeInTheDocument();
    expect(screen.getByRole("radiogroup", { name: "Color theme" })).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Close" }));
    await user.click(screen.getByRole("button", { name: "Settings" }));
    await user.click(screen.getByRole("tab", { name: "Menu bar" }));
    expect(screen.getByRole("switch", { name: "Menu bar usage" })).toBeInTheDocument();
    expect(screen.getByRole("dialog", { name: "Settings" })).toBeInTheDocument();
  });

  it("uses the shared mint accent despite legacy account and workspace colors", async () => {
    const initial = savedState(); initial.app.codexAccounts = { [work.id]: { ...DEFAULT_CODEX_ACCOUNT_PREFERENCES, color: "#2f9e6e" } };
    api.getState.mockResolvedValue(initial);
    render(<App />);
    await screen.findByRole("article", { name: "Work account account" });
    expect(screen.getByRole("article", { name: "Work account account" }).style.getPropertyValue("--accent")).toBe("");
    expect(screen.getByRole("article", { name: "Personal account account" }).style.getPropertyValue("--accent")).toBe("");
    expect(document.documentElement.style.getPropertyValue("--accent")).toBe("#64c998");
  });

  it("shows saved account quota inline and refreshes it without a usage popup", async () => {
    const user = userEvent.setup(); render(<App />);
    expect(await within(await screen.findByRole("group", {name:"Usage for Work account"})).findByText("80%")).toBeInTheDocument();
    expect(screen.queryByRole("button",{name:/Usage limits/})).not.toBeInTheDocument();
    api.codexProfileQuota.mockResolvedValue({provider:"codex",windows:[{window:"5-hour",percent:21}]});
    await user.click(screen.getByRole("button",{name:"Refresh data"}));
    await waitFor(()=>expect(within(screen.getByRole("group",{name:"Usage for Work account"})).getByText("79%")).toBeInTheDocument());
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(api.cliQuotas).not.toHaveBeenCalled();
  });

  it("places Banked resets between the edit and remove sections only for accounts with credit", async () => {
    api.codexProfileQuota.mockImplementation(async (id) => ({
      provider: "codex", windows: [{ window: "weekly", percent: 100 }],
      resetCredits: { availableCount: id === work.id ? 0 : 1, planType: "plus" },
    }));
    api.codexBankedResets.mockResolvedValue({
      availableCount: 1,
      credits: [{ id: "reset", title: "Full reset", expiresAt: null, coveredWindows: ["Weekly"], canUse: true, unavailableReason: null }],
      pendingCredit: null,
    });
    const user = userEvent.setup();
    render(<App />);
    const card = within(await screen.findByRole("article", { name: "Personal account account" }));
    expect(card.getByRole("meter", { name: "Weekly remaining" })).toBeInTheDocument();
    expect(card.queryByRole("button", { name: "Switch to next available account" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /saved reset/i })).not.toBeInTheDocument();
    const noCredit = screen.getByRole("button", { name: "More options for Work account" });
    noCredit.focus();
    await user.keyboard("[Enter]");
    const emptyDialog = await screen.findByRole("dialog", { name: "Account settings" });
    expect(within(emptyDialog).getByRole("textbox", { name: "Account name" })).toBeInTheDocument();
    expect(within(emptyDialog).queryByRole("region", { name: "Banked resets" })).not.toBeInTheDocument();
    await user.keyboard("[Escape]");
    await waitFor(() => expect(noCredit).toHaveFocus());
    expect(api.codexBankedResets).not.toHaveBeenCalled();
    await user.click(card.getByRole("button", { name: "More options for Personal account" }));
    const dialog = await screen.findByRole("dialog", { name: "Account settings" });
    const settings = within(dialog);
    const reset = settings.getByRole("region", { name: "Banked resets" });
    expect(await within(reset).findByLabelText("1 available")).toHaveTextContent("1");
    const name = settings.getByRole("textbox", { name: "Account name" });
    const remove = settings.getByRole("button", { name: "Remove account" });
    expect(name.compareDocumentPosition(reset)).toBe(Node.DOCUMENT_POSITION_FOLLOWING);
    expect(reset.compareDocumentPosition(remove)).toBe(Node.DOCUMENT_POSITION_FOLLOWING);
    expect(api.codexBankedResets).toHaveBeenCalledWith(personal.id);
    expect(api.consumeCodexReset).not.toHaveBeenCalled();
  });

  it("recovers a rejected saved session through the same account and refetches usage after replacement", async () => {
    const user = userEvent.setup();
    api.codexProfileQuota.mockImplementation(async (id) => id === work.id
      ? { provider: "codex", error: "session could not be renewed — reconnect this account or replace its auth.json in account settings" }
      : { provider: "codex", windows: [{ window: "5-hour", percent: 20 }] });
    api.reconnectSetupAccount.mockImplementation(async () => {
      api.codexProfileQuota.mockResolvedValue({ provider: "codex", windows: [{ window: "Weekly", percent: 12 }] });
      return { removed: false, profiles: { profiles: [personal, { ...work, needsActivation: true }], activeProfileId: personal.id, canImport: true, switchError: null } };
    });
    render(<App />);
    expect(await screen.findByText("Reconnect needed")).toBeInTheDocument();
    await user.click(await screen.findByRole("button", { name: "Reconnect" }));
    expect(screen.queryByRole("dialog", { name: "Usage limits" })).not.toBeInTheDocument();
    expect(await screen.findByRole("button", { name: "Sign in with ChatGPT" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Use a device code" })).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Import auth.json" }));
    api.importSetupAccount.mockResolvedValue({ ...stagedCodex, alreadyAdded: true, email: work.email });
    await uploadAuth(user, '{"fixture":"renewed"}');
    await user.click(screen.getByRole("button", { name: "Verify account" }));
    await waitFor(() => expect(api.reconnectSetupAccount).toHaveBeenCalledWith("draft", stagedCodex.id, work.id));
    expect(await within(await screen.findByRole("group", { name: "Usage for Work account" })).findByText("88%")).toBeInTheDocument();
    expect(api.activateCodexProfile).not.toHaveBeenCalled();
    expect(api.scheduleCodexRestart).not.toHaveBeenCalled();
  });

  it.each([false, true])("automatically saves browser reconnect, names the account and reveals its refreshed card (reduced motion: %s)", async (reducedMotion) => {
    const user = userEvent.setup();
    const scroll = vi.spyOn(HTMLElement.prototype, "scrollIntoView");
    vi.stubGlobal("matchMedia", vi.fn(() => ({ matches: reducedMotion, addEventListener: vi.fn(), removeEventListener: vi.fn() })));
    api.codexProfileQuota.mockImplementation(async (id) => id === work.id ? { provider: "codex", error: "session expired" } : { provider: "codex", windows: [{ window: "Weekly", percent: 10 }] });
    let finishUsage!: (quota: { provider: string; windows: { window: string; percent: number }[] }) => void;
    const refreshedUsage = new Promise<{ provider: string; windows: { window: string; percent: number }[] }>(resolve => { finishUsage = resolve; });
    api.reconnectSetupAccount.mockImplementation(async () => {
      api.codexProfileQuota.mockImplementation(() => refreshedUsage);
      return { removed: false, profiles: { profiles: [personal, { ...work, needsActivation: true }], activeProfileId: personal.id, canImport: true, switchError: null } };
    });
    try {
      render(<App />);
      await user.click(await screen.findByRole("button", { name: "Reconnect" }));
      await user.click(await screen.findByRole("button", { name: "Sign in with ChatGPT" }));
      await waitFor(() => expect(api.reconnectSetupAccount).toHaveBeenCalledExactlyOnceWith("draft", stagedCodex.id, work.id));
      await waitFor(() => expect(screen.queryByRole("dialog", { name: "Reconnect account" })).not.toBeInTheDocument());
      expect(await screen.findByText("Work account reconnected successfully")).toBeInTheDocument();
      expect(screen.queryByRole("article", { name: "Work account account" })).not.toBeInTheDocument();
      await act(async () => finishUsage({ provider: "codex", windows: [{ window: "Weekly", percent: 12 }] }));
      const card = await screen.findByRole("article", { name: "Work account account" });
      await waitFor(() => expect(card).toHaveFocus());
      const index = scroll.mock.contexts.findIndex((node) => node === card);
      expect(index).toBeGreaterThanOrEqual(0);
      expect(scroll.mock.calls[index]).toEqual([{ block: "center", behavior: reducedMotion ? "instant" : "smooth" }]);
      expect(api.activateCodexProfile).not.toHaveBeenCalled();
    } finally { vi.unstubAllGlobals(); }
  });

  it("closes reconnect and removes the saved card when native verification confirms a Free plan", async () => {
    const user = userEvent.setup();
    api.codexProfileQuota.mockImplementation(async (id) => id === work.id
      ? { provider: "codex", error: "session rejected" }
      : { provider: "codex", windows: [{ window: "Weekly", percent: 10 }] });
    api.pollSetupLogin.mockResolvedValue({ attemptId: "attempt", status: "completed",
      account: { ...stagedCodex, alreadyAdded: true, subscription: { id: "chatgpt", service: "ChatGPT", plan: "free" } }, error: null });
    api.reconnectSetupAccount.mockImplementation(async () => {
      api.getState.mockResolvedValue(savedState([{ ...studio, accountIds: [personal.id] }]));
      return { removed: true, profiles: { profiles: [personal], activeProfileId: personal.id, canImport: true, switchError: null } };
    });
    render(<App />);
    await user.click(await screen.findByRole("button", { name: "Reconnect" }));
    await user.click(screen.getByRole("button", { name: "Sign in with ChatGPT" }));
    expect(api.beginAccountSetup).toHaveBeenCalledWith(work.id);
    expect(await screen.findByText("Work account was removed because its ChatGPT plan is Free.")).toBeVisible();
    expect(api.reconnectSetupAccount).toHaveBeenCalledExactlyOnceWith("draft", stagedCodex.id, work.id);
    expect(screen.queryByRole("dialog", { name: "Reconnect account" })).not.toBeInTheDocument();
    expect(screen.queryByRole("article", { name: "Work account account" })).not.toBeInTheDocument();
    expect(screen.getByRole("article", { name: "Personal account account" })).toBeVisible();
    expect(api.activateCodexProfile).not.toHaveBeenCalled();
  });

  it.each(["Sign in with ChatGPT", "Use a device code"])("reconnects with %s and allows retry after an identity mismatch", async (method) => {
    const user = userEvent.setup();
    api.codexProfileQuota.mockResolvedValue({ provider: "codex", error: "session expired" });
    api.pollSetupLogin.mockResolvedValue({ attemptId: "attempt", status: "completed", account: { ...stagedCodex, alreadyAdded: true }, error: null });
    api.reconnectSetupAccount.mockRejectedValue(new Error("This login belongs to a different ChatGPT account."));
    render(<App />);
    await user.click((await screen.findAllByRole("button", { name: "Reconnect" }))[0]);
    const dialog = await screen.findByRole("dialog", { name: "Reconnect account" });
    await user.click(within(dialog).getByRole("button", { name: method }));
    expect(api.startSetupLogin).toHaveBeenCalledWith("draft", "codex", method === "Use a device code" ? "device" : "browser", "");
    expect(await findErrorToast("different ChatGPT account")).toHaveTextContent("different ChatGPT account");
    expect(api.activateCodexProfile).not.toHaveBeenCalled();
    await user.click(within(dialog).getByRole("button", { name: "Choose another method" }));
    expect(within(dialog).getByRole("button", { name: "Import auth.json" })).toBeInTheDocument();
  });

  it("updates inline usage from 18% to 17% at the configured refresh interval", async () => {
    vi.useFakeTimers(); vi.spyOn(document,"hasFocus").mockReturnValue(true);
    const state=savedState(); api.getState.mockResolvedValue({...state,app:{...state.app,refreshIntervalSecs:30}});
    api.codexProfileQuota.mockResolvedValue({provider:"codex",windows:[{window:"5-hour",percent:82}]});
    try {
      await act(async()=>{render(<App />);});
      expect(within(screen.getByRole("group",{name:"Usage for Work account"})).getByText("18%")).toBeInTheDocument();
      api.codexProfileQuota.mockResolvedValue({provider:"codex",windows:[{window:"5-hour",percent:83}]});
      await act(async()=>{vi.advanceTimersByTime(29_000);});
      expect(within(screen.getByRole("group",{name:"Usage for Work account"})).getByText("18%")).toBeInTheDocument();
      await act(async()=>{vi.advanceTimersByTime(1000);});
      expect(within(screen.getByRole("group",{name:"Usage for Work account"})).getByRole("meter")).toHaveAttribute("aria-valuenow","17");
      expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
      expect(api.cliQuotas).not.toHaveBeenCalled();
    } finally {cleanup();vi.useRealTimers();}
  });

  it("loads saved accounts even if another provider probe fails", async () => {
    api.cliStatus.mockRejectedValue(new Error("probe failed")); render(<App />);
    expect(await screen.findByRole("article", { name: "Personal account account" })).toBeInTheDocument();
    expect(screen.getByText("Couldn't read CLI status: probe failed")).toBeInTheDocument();
  });

  it("shows the initial loading skeleton and reports load failures", async () => {
    api.getState.mockReturnValueOnce(new Promise(() => {})); const view = render(<App />);
    expect(screen.getByRole("status", { name: "Loading" })).toBeInTheDocument(); view.unmount();
    api.getState.mockRejectedValue(new Error("permission denied")); render(<App />);
    expect(await screen.findByText("Couldn't load settings: permission denied")).toBeInTheDocument();
  });


});

describe("home page actions and recovery", () => {
  it("releases Refresh after a stalled settings read and discards its late result", async () => {
    vi.useFakeTimers();
    let finish!: (value: unknown) => void;
    try {
      await act(async () => { render(<App />); });
      api.codexProfiles.mockClear();
      api.getState.mockImplementationOnce(() => new Promise(resolve => { finish = resolve; }));
      await act(async () => { fireEvent.click(screen.getByRole("button", { name: "Refresh data" })); });
      expect(screen.getByRole("button", { name: "Refresh data" })).toBeDisabled();
      await act(async () => { vi.advanceTimersByTime(15_000); });
      expect(screen.getByRole("button", { name: "Refresh data" })).toBeEnabled();
      await act(async () => { finish(savedState()); });
      expect(api.codexProfiles).not.toHaveBeenCalled();
    } finally { cleanup(); vi.useRealTimers(); }
  });

  it("keeps settings, refresh and the primary add action available in an empty workspace", async () => {
    api.getState.mockResolvedValue(savedState([{ ...studio, accountIds: [], providerIds: [], claudeAccountIds: [] }]));
    api.cliStatus.mockResolvedValue([]);
    api.codexProfiles.mockResolvedValue({ profiles: [], activeProfileId: null, canImport: false, switchError: null });
    render(<App />);
    expect(await screen.findByText("Your workspace is ready")).toBeInTheDocument();
    expect(screen.queryByText("No current Codex accounts")).not.toBeInTheDocument();
    const actions = screen.getByRole("group", { name: "Account and app actions" });
    expect(within(actions).getByRole("button", { name: "Add account" })).toBeEnabled();
    expect(screen.getByRole("main", { name: "Accounts" })).not.toContainElement(actions);
    expect(screen.getByRole("button", { name: "Settings" })).toBeEnabled();
    expect(screen.getByRole("button", { name: "Refresh data" })).toBeEnabled();
    await userEvent.setup().click(within(actions).getByRole("button", { name: "Add account" }));
    expect(await screen.findByRole("dialog", { name: "Add account" })).toBeInTheDocument();
  });

  it("retries an account-list failure beside its error without losing page actions", async () => {
    api.codexProfiles.mockRejectedValueOnce(new Error("Temporary read failure"));
    render(<App />);
    const error = await findErrorToast();
    expect(error).toHaveTextContent("Temporary read failure");
    await userEvent.setup().click(screen.getByRole("button", { name: "Retry" }));
    expect(await screen.findByRole("article", { name: "Personal account account" })).toBeInTheDocument();
    await waitFor(() => expect(screen.queryByText(/Temporary read failure/)).not.toBeInTheDocument());
  });
});

it("hands focus from the workspace picker to the creation dialog", async () => {
  const user = userEvent.setup();
  render(<App />);
  await user.click(await screen.findByRole("combobox", { name: "Workspace" }));
  await user.click(screen.getByRole("button", { name: "New workspace" }));
  const dialog = await screen.findByRole("dialog", { name: "New workspace" });
  await waitFor(() => expect(within(dialog).getByRole("textbox", { name: "Workspace name" })).toHaveFocus());
  await user.click(within(dialog).getByRole("button", { name: "Close" }));
  await waitFor(() => expect(screen.getByRole("combobox", { name: "Workspace" })).toHaveFocus());
});

it("omits Gemini from account enrollment", async () => {
  const user = userEvent.setup();
  render(<App />);
  await user.click(await screen.findByRole("button", { name: "Add account" }));
  expect(await screen.findByRole("button", { name: "Antigravity" })).toBeVisible();
  expect(screen.queryByRole("button", { name: /Gemini/ })).not.toBeInTheDocument();
});

it("connects Antigravity immediately without method selection or a requested name and cancels to providers", async () => {
  const user = userEvent.setup();
  api.loadSetupAccounts.mockResolvedValue([]);
  api.startSetupLogin.mockResolvedValue({ attemptId: "official-google", status: "pending", authUrl: null, userCode: null, error: null, account: null });
  api.pollSetupLogin.mockResolvedValue({ attemptId: "official-google", status: "pending", authUrl: null, userCode: null, error: null, account: null });
  render(<App />);
  await user.click(await screen.findByRole("button", { name: "Add account" }));
  await user.click(await screen.findByRole("button", { name: "Antigravity" }));
  await waitFor(() => expect(api.startSetupLogin).toHaveBeenCalledWith("draft", "antigravity", "browser", ""));
  expect(screen.queryByRole("group", { name: "Choose sign-in method" })).not.toBeInTheDocument();
  expect(screen.queryByRole("textbox", { name: "Account name" })).not.toBeInTheDocument();
  expect(screen.queryByRole("button", { name: /Sign in with|Use current AGY/ })).not.toBeInTheDocument();
  expect(screen.queryByText(/Experimental/)).not.toBeInTheDocument();
  expect(await screen.findByText("Checking Google account access…")).toBeVisible();
  expect(opener.openUrl).not.toHaveBeenCalled();
  await user.click(screen.getByRole("button", { name: "Cancel sign-in" }));
  expect(api.cancelSetupLogin).toHaveBeenCalledWith("draft");
  expect(await screen.findByRole("button", { name: "Antigravity" })).toBeVisible();
});

it("lets a failed direct Antigravity connection retry without exposing removed methods or a name field", async () => {
  const user = userEvent.setup();
  api.startSetupLogin.mockRejectedValueOnce(new Error("Google unavailable"));
  api.loadSetupAccounts.mockResolvedValue([]);
  render(<App />);
  await user.click(await screen.findByRole("button", { name: "Add account" }));
  await user.click(await screen.findByRole("button", { name: "Antigravity" }));
  expect(await screen.findByText("Google unavailable")).toBeVisible();
  expect(screen.queryByLabelText("Account name")).not.toBeInTheDocument();
  api.startSetupLogin.mockResolvedValue({ attemptId:"retry-google", status:"pending", authUrl:null, userCode:null, error:null, account:null });
  api.pollSetupLogin.mockResolvedValue({ attemptId:"retry-google", status:"pending", authUrl:null, userCode:null, error:null, account:null });
  await user.click(screen.getByRole("button", { name:"Retry connection" }));
  expect(api.startSetupLogin).toHaveBeenLastCalledWith("draft", "antigravity", "browser", "");
  expect(await screen.findByText("Checking Google account access…")).toBeVisible();
});

it("opens the Google account chooser automatically when adding another Antigravity account", async () => {
  const user = userEvent.setup();
  const chooser = "https://accounts.google.com/o/oauth2/v2/auth?prompt=select_account%20consent&state=synthetic";
  const google = { id:"google-existing",provider:"antigravity" as const,name:"Existing Google",email:"existing@example.com",subscription:{id:"google",service:"Antigravity",plan:"Pro"} };
  api.getState.mockResolvedValue(savedState([{...studio,antigravityAccountIds:[google.id]}]));
  api.antigravityAccounts.mockResolvedValue([google]);
  api.startSetupLogin.mockResolvedValue({attemptId:"google-new",status:"pending",authUrl:null,userCode:null,error:null,account:null});
  api.pollSetupLogin.mockResolvedValue({attemptId:"google-new",status:"pending",authUrl:chooser,userCode:null,error:null,account:null});
  render(<App />);
  await user.click(await screen.findByRole("button",{name:"Add account"}));
  await user.click(await screen.findByRole("button",{name:"Antigravity"}));
  await waitFor(() => expect(opener.openUrl).toHaveBeenCalledWith(chooser));
  expect(api.startSetupLogin).toHaveBeenCalledWith("draft","antigravity","browser","");
  expect(api.startSetupLogin).toHaveBeenCalledTimes(1);
  expect(screen.queryByRole("button", { name:"Retry connection" })).not.toBeInTheDocument();
  expect(screen.queryByLabelText("Account name")).not.toBeInTheDocument();
  expect(screen.queryByRole("group",{name:"Choose sign-in method"})).not.toBeInTheDocument();
});


it("deletes another workspace from its card without switching workspaces", async () => {
  const user = userEvent.setup();
  const other = { ...studio, id: "lab", name: "Research lab" };
  api.getState.mockResolvedValue(savedState([studio, other]));
  api.deleteWorkspace.mockResolvedValue(savedState([studio]));
  render(<App />);
  const picker = await screen.findByRole("combobox", { name: "Workspace" });
  await user.click(picker);
  await user.keyboard("{ArrowDown}{ArrowRight}");
  expect(screen.getByRole("button", { name: "Delete workspace: Research lab" })).toHaveFocus();
  await user.keyboard("{Enter}");
  const confirmation = await screen.findByRole("alertdialog", { name: "Delete workspace?" });
  expect(confirmation).toHaveAccessibleDescription("Research lab Workspace settings will be deleted.");
  expect(within(confirmation).getByRole("button", { name: "Cancel" })).toHaveFocus();
  expect(api.deleteWorkspace).not.toHaveBeenCalled();
  await user.keyboard("{ArrowRight}{Enter}");
  await waitFor(() => expect(screen.queryByRole("alertdialog")).not.toBeInTheDocument());
  expect(api.deleteWorkspace).toHaveBeenCalledExactlyOnceWith(other.id);
  expect(api.selectWorkspace).not.toHaveBeenCalled();
  expect(picker).toHaveAccessibleDescription("Studio");
  await user.click(picker);
  expect(screen.queryByRole("button", { name: "Delete workspace: Research lab" })).not.toBeInTheDocument();
});

it("returns to setup after deleting the last workspace without removing saved accounts", async () => {
  const user = userEvent.setup();
  api.deleteWorkspace.mockResolvedValue(savedState([]));
  render(<App />);
  await user.click(await screen.findByRole("combobox", { name: "Workspace" }));
  await user.click(screen.getByRole("button", { name: "Delete workspace" }));
  const confirmation = await screen.findByRole("alertdialog", { name: "Delete workspace?" });
  await user.click(within(confirmation).getByRole("button", { name: "Delete workspace" }));
  expect(await screen.findByRole("region", { name: "Create workspace" })).toBeInTheDocument();
  expect(api.deleteWorkspace).toHaveBeenCalledWith("studio");
  expect(api.removeWorkspaceAccount).not.toHaveBeenCalled();
  expect(api.removeCodexProfile).not.toHaveBeenCalled();
  expect(api.activateCodexProfile).not.toHaveBeenCalled();
});
