import { render } from "../test/notifications";
import { afterEach, expect, it, vi } from "vitest";
import { cleanup,  screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { WorkspaceMenuBar } from "./WorkspaceMenuBar";
import { DEFAULT_APP_SETTINGS, DEFAULT_WORKSPACE_USAGE, type ClaudeProfile, type CodexProfile, type Workspace } from "../types";
import type { QuotaSet, SetupAccount } from "../api";
const api = vi.hoisted(() => ({ codexProfileQuota: vi.fn(), claudeProfileQuota: vi.fn(), antigravityAccountQuota: vi.fn() }));
vi.mock("../api", async (original) => ({ ...await original<typeof import("../api")>(), ...api }));
afterEach(() => { cleanup(); vi.clearAllMocks(); });
const account = (id: string): CodexProfile => ({ id, name: id, email: `${id}@example.com`, plan: null, connected: true, active: false, needsActivation: false, connectionError: null, loginCommand: "" });
const googleAccount = (id: string, active = false): SetupAccount => ({ id, name: id, active, provider: "antigravity", email: `${id}@example.com`, subscription: { id, service: "antigravity" } });
const claudeAccount = (id: string, active = false): ClaudeProfile => ({ id, name: id, active, email: null, configDir: `/tmp/${id}`, createdAt: "", connected: true, subscription: null, loginCommand: "", launchCommand: "", quota: null });

it.each(["claude", "antigravity"] as const)("shows only the live %s account without an account picker", async (provider) => {
  const read = provider === "claude" ? api.claudeProfileQuota : api.antigravityAccountQuota;
  read.mockImplementation(async (id) => ({ provider, windows: [{ window: id === "two" ? "weekly" : "monthly", percent: 20 }] }));
  const workspace: Workspace = { id: "studio", name: "Studio", accent: "#007aff", accountIds: [], claudeAccountIds: ["one", "two"], antigravityAccountIds: ["one", "two"], usage: { ...DEFAULT_WORKSPACE_USAGE, menuBarProvider: provider, menuBarAccountId: "one", activeAccounts: { [provider]: "one" } } };
  const props = { workspace, app: DEFAULT_APP_SETTINGS, accounts: [], busy: false, onSave: vi.fn() };
  const members = (active: string) => provider === "claude" ? { claudeAccounts: [claudeAccount("one", active === "one"), claudeAccount("two", active === "two"), claudeAccount("outsider", active === "outsider")], googleAccounts: [] }
    : { claudeAccounts: [], googleAccounts: [googleAccount("one", active === "one"), googleAccount("two", active === "two"), googleAccount("outsider", active === "outsider")] };
  const view = render(<WorkspaceMenuBar {...props} {...members("two")} />);
  expect(await screen.findByRole("checkbox", { name: "Show two Weekly limit" })).toBeInTheDocument();
  expect(screen.getByLabelText("Menu bar active account")).toHaveTextContent("Active accounttwo");
  expect(screen.queryByRole("combobox", { name: "Menu bar account" })).not.toBeInTheDocument();
  expect(read.mock.calls.map(([id]) => id)).not.toContain("one");
  view.rerender(<WorkspaceMenuBar {...props} {...members("one")} />);
  expect(await screen.findByRole("checkbox", { name: "Show one Monthly limit" })).toBeInTheDocument();
  view.rerender(<WorkspaceMenuBar {...props} {...members("outsider")} />);
  expect(screen.getByText(`No active ${provider === "claude" ? "Claude" : "Antigravity"} account.`)).toBeInTheDocument();
  expect(screen.queryByRole("checkbox", { name: / limit$/ })).not.toBeInTheDocument();
  expect(read.mock.calls.map(([id]) => id)).not.toContain("outsider");
});

it("selects Carbon and Argon limits independently for the active Antigravity account", async () => {
  const user = userEvent.setup();
  api.antigravityAccountQuota.mockResolvedValue({ provider: "antigravity", models: ["Gemini 4 Carbon", "Gemini 4 Argon", "Gemini 4 Hydrogen"], windows: [
    { window: "Gemini 4 Argon · Weekly", percent: 60 },
    { window: "Gemini 4 Carbon · Weekly", percent: 40 },
    { window: "Gemini 4 Carbon · 5-hour", percent: 20 },
    { window: "Gemini · Weekly", percent: 10 },
    { window: "Unmeasured", percent: -1 },
  ] });
  let workspace: Workspace = { id: "studio", name: "Studio", accent: "#007aff", accountIds: [], antigravityAccountIds: ["google"], usage: { ...DEFAULT_WORKSPACE_USAGE, menuBarProvider: "antigravity", accountWindows: { google: [] } } };
  const save = vi.fn(async (patch) => { workspace = { ...workspace, usage: { ...workspace.usage, ...patch } }; view.rerender(<WorkspaceMenuBar {...props} workspace={workspace} />); });
  const props = { app: DEFAULT_APP_SETTINGS, accounts: [], claudeAccounts: [], googleAccounts: [googleAccount("google", true)], busy: false, onSave: save };
  const view = render(<WorkspaceMenuBar {...props} workspace={workspace} />);
  const carbon = await screen.findByRole("checkbox", { name: "Show google Gemini 4 Carbon · 5-hour limit" });
  const argon = screen.getByRole("checkbox", { name: "Show google Gemini 4 Argon · Weekly limit" });
  expect(api.antigravityAccountQuota).toHaveBeenCalledExactlyOnceWith("google", true);
  expect(screen.getByRole("checkbox", { name: "Show google Gemini · Weekly limit" })).toBeInTheDocument();
  expect(screen.queryByRole("checkbox", { name: /Hydrogen|Unmeasured/ })).not.toBeInTheDocument();
  expect(screen.getAllByRole("checkbox", { name: / limit$/ })[0]).toBe(carbon);
  await user.click(carbon);
  argon.focus();
  await user.keyboard(" ");
  expect(argon).toHaveFocus();
  expect(carbon).toBeChecked();
  expect(argon).toBeChecked();
  expect(screen.getByRole("checkbox", { name: "Show google Gemini 4 Carbon · Weekly limit" })).not.toBeChecked();
  expect(save).toHaveBeenLastCalledWith({ accountWindows: { google: ["Gemini 4 Carbon · 5-hour", "Gemini 4 Argon · Weekly"] } });
});

it.each([
  { label: "Codex", provider: "codex", read: api.codexProfileQuota },
  { label: "Claude", provider: "claude", read: api.claudeProfileQuota },
  { label: "Antigravity", provider: "antigravity", read: api.antigravityAccountQuota },
] as const)("shows loading for $label before offering saved limits and clears it on failure", async ({ label, provider, read }) => {
  let rejectQuota!: (error: Error) => void;
  read.mockReturnValue(new Promise<QuotaSet>((_, reject) => { rejectQuota = reject; }));
  const workspace: Workspace = { id: "studio", name: "Studio", accent: "#007aff", accountIds: ["codex"], claudeAccountIds: ["claude"], antigravityAccountIds: ["antigravity"], usage: { ...DEFAULT_WORKSPACE_USAGE, menuBarProviders: [provider], accountWindows: { [provider]: ["weekly"] } } };
  render(<WorkspaceMenuBar workspace={workspace} app={DEFAULT_APP_SETTINGS} accounts={[{ ...account("codex"), active: true }]} claudeAccounts={[claudeAccount("claude", true)]} googleAccounts={[googleAccount("antigravity", true)]} busy={false} onSave={vi.fn()} />);
  const loading = `Loading ${label} limits…`;
  expect(screen.getByRole("status")).toHaveTextContent(loading);
  expect(screen.queryByRole("checkbox", { name: / limit$/ })).not.toBeInTheDocument();
  rejectQuota(new Error("Usage request failed"));
  expect(await screen.findByText("Usage request failed")).toBeVisible();
  expect(screen.queryByText(loading)).not.toBeInTheDocument();
  expect(screen.getByRole("checkbox", { name: `Show ${provider} Weekly limit` })).toBeChecked();
});

it("adds a provider without replacing the existing selection and follows both live accounts", async () => {
  const user = userEvent.setup();
  api.codexProfileQuota.mockResolvedValue({ provider: "codex", windows: [{ window: "weekly", percent: 20 }] });
  api.antigravityAccountQuota.mockResolvedValue({ provider: "antigravity", windows: [{ window: "Gemini 4 Carbon · 5-hour", percent: 30 }] });
  let workspace: Workspace = { id: "studio", name: "Studio", accent: "#007aff", accountIds: ["codex"], antigravityAccountIds: ["one", "two"], usage: { ...DEFAULT_WORKSPACE_USAGE, menuBarProvider: "codex", activeAccounts: { antigravity: "one" }, accountWindows: { codex: ["weekly"], two: ["Gemini 4 Carbon · 5-hour"] } } };
  const save = vi.fn(async (patch) => { workspace = { ...workspace, usage: { ...workspace.usage, ...patch } }; view.rerender(<WorkspaceMenuBar {...props} workspace={workspace} />); });
  const props = { app: DEFAULT_APP_SETTINGS, accounts: [{ ...account("codex"), active: true }], claudeAccounts: [], googleAccounts: [googleAccount("one"), googleAccount("two", true)], busy: false, onSave: save };
  const view = render(<WorkspaceMenuBar {...props} workspace={workspace} />);
  expect(await screen.findByRole("checkbox", { name: "Show codex Weekly limit" })).toBeChecked();
  expect(api.antigravityAccountQuota).not.toHaveBeenCalled();
  const google = screen.getByRole("switch", { name: "Show Antigravity in menu bar" });
  google.focus(); await user.keyboard(" ");
  expect(save).toHaveBeenLastCalledWith({ menuBarProviders: ["codex", "antigravity"], displayMode: "active" });
  expect(google).toHaveFocus();
  expect(await screen.findByRole("checkbox", { name: "Show two Gemini 4 Carbon · 5-hour limit" })).toBeChecked();
  expect(screen.getByRole("checkbox", { name: "Show codex Weekly limit" })).toBeChecked();
  expect(screen.getByLabelText("Antigravity active account")).toHaveTextContent("two");
  expect(api.antigravityAccountQuota).not.toHaveBeenCalledWith("one", true);
  await user.click(screen.getByRole("checkbox", { name: "Show codex Weekly limit" }));
  expect(save).toHaveBeenLastCalledWith({ accountWindows: { codex: [], two: ["Gemini 4 Carbon · 5-hour"] } });
  await user.click(google);
  expect(screen.getByRole("switch", { name: "Show Codex in menu bar" })).toBeChecked();
  expect(screen.queryByRole("checkbox", { name: "Show two Gemini 4 Carbon · 5-hour limit" })).not.toBeInTheDocument();
  await user.click(screen.getByRole("switch", { name: "Show Codex in menu bar" }));
  expect(save).toHaveBeenLastCalledWith({ menuBarProviders: [], displayMode: "active" });
  view.rerender(<WorkspaceMenuBar {...props} workspace={structuredClone(workspace)} />);
  expect(screen.getByRole("switch", { name: "Show Codex in menu bar" })).not.toBeChecked();
  expect(screen.getByText("Select a provider to show usage in the menu bar.")).toBeInTheDocument();
});
it("offers only member providers and reads the active member account", async () => {
  const save = vi.fn();
  const workspace: Workspace = { id: "studio", name: "Studio", accent: "#007aff", accountIds: ["one", "two"], claudeAccountIds: [], antigravityAccountIds: [], usage: { ...DEFAULT_WORKSPACE_USAGE, menuBarAccountId: "one" } };
  api.codexProfileQuota.mockImplementation(async (id) => ({ provider: "codex", windows: [{ window: id === "one" ? "weekly" : "monthly", percent: 20 }] }));
  const props = { app: DEFAULT_APP_SETTINGS, accounts: [{ ...account("one"), active: true }, account("two"), account("outsider")], claudeAccounts: [], googleAccounts: [], busy: false, onSave: save };
  render(<WorkspaceMenuBar {...props} workspace={workspace} />);
  expect(await screen.findByRole("checkbox", { name: "Show one Weekly limit" })).toBeChecked();
  expect(screen.queryByRole("checkbox", { name: "Show one 5-hour limit" })).not.toBeInTheDocument();
  expect(api.codexProfileQuota).toHaveBeenCalledExactlyOnceWith("one");
  expect(screen.getByRole("switch", { name: "Show Codex in menu bar" })).toBeChecked();
  expect(screen.queryByRole("switch", { name: "Show Claude in menu bar" })).not.toBeInTheDocument();
  expect(screen.queryByRole("combobox", { name: "Menu bar account" })).not.toBeInTheDocument();
  expect(api.codexProfileQuota).not.toHaveBeenCalledWith("two");
  expect(api.codexProfileQuota).not.toHaveBeenCalledWith("outsider");
});

it("starts with Reset timeline first and saves the progress style without changing account or windows", async () => {
  const user = userEvent.setup(); const save = vi.fn();
  api.codexProfileQuota.mockResolvedValue({ provider: "codex", windows: [{ window: "5-hour", percent: 30 }, { window: "weekly", percent: 60 }] });
  const workspace: Workspace = { id: "studio", name: "Studio", accent: "#007aff", accountIds: ["one"], claudeAccountIds: [], usage: { ...DEFAULT_WORKSPACE_USAGE, accountWindows: {} } };
  const props = { app: DEFAULT_APP_SETTINGS, accounts: [{ ...account("one"), active: true }], claudeAccounts: [], googleAccounts: [], busy: false, onSave: save };
  const view = render(<WorkspaceMenuBar {...props} workspace={workspace} />);
  expect(screen.getAllByRole("radio")[0]).toBe(screen.getByRole("radio", { name: "Reset timeline" }));
  expect(screen.getByRole("radio", { name: "Reset timeline" })).toBeChecked();
  expect(await screen.findByRole("checkbox", { name: "Show one Weekly limit" })).toBeChecked();
  await user.click(screen.getByRole("radio", { name: "Progress bars" }));
  expect(save).toHaveBeenCalledExactlyOnceWith({ menuBarStyle: "progress" });
  view.rerender(<WorkspaceMenuBar {...props} workspace={{ ...workspace, usage: { ...workspace.usage, menuBarStyle: "progress" } }} />);
  expect(screen.getByRole("radio", { name: "Progress bars" })).toBeChecked();
  expect(screen.getByRole("checkbox", { name: "Show one 5-hour limit" })).toBeChecked();
  expect(screen.getByRole("checkbox", { name: "Show one Weekly limit" })).toBeChecked();
  screen.getByRole("radio", { name: "Progress bars" }).focus();
  await user.keyboard("{ArrowDown}");
  expect(screen.getByRole("radio", { name: "Reset timeline" })).toHaveFocus();
  await user.keyboard(" ");
  expect(save).toHaveBeenLastCalledWith({ menuBarStyle: "resetTimeline" });
  view.rerender(<WorkspaceMenuBar {...props} workspace={{ ...workspace, usage: { ...workspace.usage, menuBarStyle: "resetTimeline" } }} />);
  expect(screen.getByRole("radio", { name: "Reset timeline" })).toBeChecked();
  expect(screen.getByRole("radio", { name: "Reset timeline" })).toHaveAccessibleDescription("The line shrinks as reset approaches.");
});

it("follows the live Codex account instead of a saved menu bar selection", async () => {
  api.codexProfileQuota.mockImplementation(async (id) => ({ provider: "codex", windows: [{ window: id === "one" ? "weekly" : "monthly", percent: 20 }] }));
  const workspace: Workspace = { id: "studio", name: "Studio", accent: "#007aff", accountIds: ["one", "two"], claudeAccountIds: [], usage: { ...DEFAULT_WORKSPACE_USAGE, menuBarAccountId: "one", activeAccounts: { codex: "one" } } };
  const props = { app: DEFAULT_APP_SETTINGS, claudeAccounts: [], googleAccounts: [], busy: false, onSave: vi.fn() };
  const view = render(<WorkspaceMenuBar {...props} workspace={workspace} accounts={[account("one"), { ...account("two"), active: true }]} />);
  expect(await screen.findByRole("checkbox", { name: "Show two Monthly limit" })).toBeInTheDocument();
  expect(api.codexProfileQuota).not.toHaveBeenCalledWith("one");
  expect(screen.queryByRole("combobox", { name: "Menu bar account" })).not.toBeInTheDocument();
  view.rerender(<WorkspaceMenuBar {...props} workspace={workspace} accounts={[{ ...account("one"), active: true }, account("two")]} />);
  expect(await screen.findByRole("checkbox", { name: "Show one Weekly limit" })).toBeInTheDocument();
  expect(screen.queryByRole("checkbox", { name: "Show two Monthly limit" })).not.toBeInTheDocument();
  view.rerender(<WorkspaceMenuBar {...props} workspace={workspace} accounts={[account("one"), account("two")]} />);
  expect(screen.getByText("No active Codex account.")).toBeInTheDocument();
  expect(screen.queryByRole("checkbox", { name: /limit/ })).not.toBeInTheDocument();
  view.rerender(<WorkspaceMenuBar {...props} workspace={workspace} accounts={[account("one"), account("two"), { ...account("outside"), active: true }]} />);
  expect(screen.getByText("No active Codex account.")).toBeInTheDocument();
  expect(api.codexProfileQuota).not.toHaveBeenCalledWith("outside");
});

it("keeps visible limit targets in duration order after deselecting and reselecting", async () => {
  const user = userEvent.setup();
  api.codexProfileQuota.mockResolvedValue({ provider: "codex", windows: [{ window: "weekly", percent: 20 }, { window: "5-hour", percent: 30 }] });
  let workspace: Workspace = { id: "studio", name: "Studio", accent: "#007aff", accountIds: ["one"], usage: { ...DEFAULT_WORKSPACE_USAGE, accountWindows: { one: ["weekly", "5-hour"] } } };
  const save = vi.fn(async (patch) => { workspace = { ...workspace, usage: { ...workspace.usage, ...patch } }; view.rerender(<WorkspaceMenuBar {...props} workspace={workspace} />); });
  const props = { app: DEFAULT_APP_SETTINGS, accounts: [{ ...account("one"), active: true }], claudeAccounts: [], googleAccounts: [], busy: false, onSave: save };
  const view = render(<WorkspaceMenuBar {...props} workspace={workspace} />);
  await screen.findByRole("checkbox", { name: "Show one Weekly limit" });
  const fiveHour = screen.getByRole("checkbox", { name: "Show one 5-hour limit" });
  const labels = () => screen.getAllByRole("checkbox", { name: / limit$/ }).map(el => el.getAttribute("aria-label"));
  const initial = labels();
  expect(initial).toEqual(["Show one 5-hour limit", "Show one Weekly limit"]);
  await user.click(fiveHour);
  expect(fiveHour).not.toBeChecked();
  expect(labels()).toEqual(initial);
  expect(screen.getByRole("checkbox", { name: "Show one 5-hour limit" })).toBe(fiveHour);
  await user.click(fiveHour);
  expect(fiveHour).toBeChecked();
  expect(labels()).toEqual(initial);
});

it("saves the provider logo preference independently of providers and limits", async () => {
  const user = userEvent.setup(); const save = vi.fn();
  api.codexProfileQuota.mockResolvedValue({ provider: "codex", windows: [] });
  const workspace: Workspace = { id: "studio", name: "Studio", accent: "#007aff", accountIds: ["one"], usage: { ...DEFAULT_WORKSPACE_USAGE, showProviderLogos: false } };
  const props = { app: DEFAULT_APP_SETTINGS, accounts: [{ ...account("one"), active: true }], claudeAccounts: [], googleAccounts: [], busy: false, onSave: save };
  const view = render(<WorkspaceMenuBar {...props} workspace={workspace} />);
  const logos = screen.getByRole("switch", { name: "Show provider logos" });
  expect(logos).not.toBeChecked();
  await user.click(logos);
  expect(save).toHaveBeenLastCalledWith({ showProviderLogos: true });
  view.rerender(<WorkspaceMenuBar {...props} workspace={{...workspace,usage:{...workspace.usage,showProviderLogos:true}}} />);
  expect(logos).toBeChecked();
});

it("defaults the app logo on for legacy settings and independently saves its visibility", async () => {
  const user = userEvent.setup(); const save = vi.fn();
  api.codexProfileQuota.mockResolvedValue({ provider: "codex", windows: [] });
  const workspace: Workspace = { id: "studio", name: "Studio", accent: "#007aff", accountIds: ["one"], usage: { ...DEFAULT_WORKSPACE_USAGE, showAppLogo: undefined, showProviderLogos: true } };
  const props = { app: DEFAULT_APP_SETTINGS, accounts: [{ ...account("one"), active: true }], claudeAccounts: [], googleAccounts: [], busy: false, onSave: save };
  const view = render(<WorkspaceMenuBar {...props} workspace={workspace} />);
  const toggle = screen.getByRole("switch", { name: "Show app logo" });
  expect(toggle).toBeChecked();
  expect(toggle).toHaveAccessibleDescription("Always shown when no usage is displayed.");
  expect(view.container.querySelector(".menubar-preview-mark")).toBeInTheDocument();
  toggle.focus(); await user.keyboard(" ");
  expect(save).toHaveBeenCalledExactlyOnceWith({ showAppLogo: false });
  view.rerender(<WorkspaceMenuBar {...props} workspace={{ ...workspace, usage: { ...workspace.usage, showAppLogo: false } }} />);
  expect(toggle).toHaveFocus();
  expect(toggle).not.toBeChecked();
  expect(view.container.querySelector(".menubar-preview-mark")).not.toBeInTheDocument();
  expect(screen.getByRole("switch", { name: "Show provider logos" })).toBeChecked();
  expect(view.container.querySelector(".menubar-preview-sample .menubar-provider-mark")).toBeInTheDocument();
  view.rerender(<WorkspaceMenuBar {...props} busy workspace={{ ...workspace, usage: { ...workspace.usage, showAppLogo: false } }} />);
  await user.click(toggle);
  expect(save).toHaveBeenCalledTimes(1);
});
