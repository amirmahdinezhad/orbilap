import { render, findErrorToast } from "../test/notifications";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { cleanup, fireEvent,  screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { Tabs, TabsList, TabsTrigger } from "./ui/tabs";
import { WorkspaceSettings } from "./WorkspaceSettings";
import { DEFAULT_WORKSPACE_USAGE, type Workspace } from "../types";
import { makeState } from "../test/fixtures";

const api = vi.hoisted(() => ({ updateWorkspace: vi.fn(), antigravityAccounts: vi.fn(), codexProfileQuota: vi.fn(), claudeProfileQuota: vi.fn(), renameCodexProfile: vi.fn(), editClaudeProfile: vi.fn(), renameAntigravityAccount: vi.fn(), removeWorkspaceAccount: vi.fn() }));
vi.mock("../api", async (original) => ({ ...await original<typeof import("../api")>(), ...api }));
const workspace: Workspace = { id: "studio", name: "Studio", accent: "#007aff", accountIds: ["codex"], claudeAccountIds: ["claude"], antigravityAccountIds: ["google"], usage: { ...DEFAULT_WORKSPACE_USAGE } };
const codex = { id: "codex", name: "Personal", email: "personal@example.com", plan: null, connected: true, active: true, connectionError: null, needsActivation: false, loginCommand: "" };
const claude = { id: "claude", name: "Work", email: "work@example.com", configDir: "", createdAt: "", connected: true, subscription: null, loginCommand: "", launchCommand: "", quota: null };
function show(section: string, usage = workspace.usage) {
  const current = { ...workspace, usage };
  const state = makeState({ app: { ...makeState().app, workspaces: [current], activeWorkspaceId: current.id } });
  api.updateWorkspace.mockResolvedValue(state); api.removeWorkspaceAccount.mockResolvedValue(state);
  render(<Tabs defaultValue={section}><TabsList>{[["usage", "Usage"], ["menu-bar", "Menu bar"]].map(([id, label]) => <TabsTrigger key={id} value={id}>{label}</TabsTrigger>)}</TabsList><WorkspaceSettings open workspace={current} state={state} profiles={{ profiles: [codex], activeProfileId: codex.id, canImport: true, switchError: null }} claudeAccounts={[claude]} onBusyChange={vi.fn()} onChanged={vi.fn()} /></Tabs>);
}
beforeEach(() => { vi.clearAllMocks(); api.antigravityAccounts.mockResolvedValue([{ id: "google", name: "Google work", provider: "antigravity", email: "google@example.com" }]); api.codexProfileQuota.mockResolvedValue({ provider: "codex", windows: [{ window: "weekly", percent: 10 }] }); api.claudeProfileQuota.mockResolvedValue({ provider: "claude", windows: [{ window: "5-hour", percent: 20 }] }); });
afterEach(cleanup);
it("keeps Usage and Menu bar panels separate from account management", () => {
  show("usage");
  expect(screen.getAllByRole("tab").map((tab) => tab.textContent)).toEqual(["Usage", "Menu bar"]);
  expect(screen.queryByRole("button", { name: /Edit|Remove|Add account/ })).not.toBeInTheDocument();
  expect(screen.queryByRole("tab", { name: "Accounts" })).not.toBeInTheDocument();
});
it("enables all display defaults and exposes only the account's reported limit types", async () => {
  const user = userEvent.setup(); show("menu-bar");
  for (const label of ["Menu bar usage"]) expect(screen.getByRole("switch", { name: label })).toBeChecked();
  expect(screen.queryByRole("combobox", { name: "Accounts to display" })).not.toBeInTheDocument();
  const weekly = await screen.findByRole("checkbox", { name: "Show Personal Weekly limit" });
  expect(weekly).toBeChecked();
  await user.click(weekly);
  expect(api.updateWorkspace).toHaveBeenCalledWith(expect.objectContaining({ usage: expect.objectContaining({ accountWindows: { codex: [] } }) }));
  expect(screen.queryByRole("checkbox", { name: /Personal 5-hour/ })).not.toBeInTheDocument();
});
it("starts switching at 2% remaining and saves a custom threshold", async () => {
  show("usage", { ...workspace.usage, autoSwitchEnabled: true });
  const input = screen.getByRole("spinbutton", { name: "Switch at remaining percent" }); expect(input).toHaveValue(2);
  expect(screen.getByRole("checkbox", { name: "Include Personal in switch cycle" })).toBeInTheDocument();
  fireEvent.change(input, { target: { value: "8" } }); fireEvent.blur(input);
  expect(api.updateWorkspace).toHaveBeenCalledWith(expect.objectContaining({ usage: expect.objectContaining({ autoSwitchRemaining: 8 }) }));
});
it("chooses provider before limit switches and keeps color warnings independent of notifications", async () => {
  const user = userEvent.setup(); show("menu-bar");
  await user.click(screen.getByRole("switch", { name: "Limit colors" }));
  expect(api.updateWorkspace).toHaveBeenLastCalledWith(expect.objectContaining({ usage: expect.objectContaining({ warningColors: true }) }));
  await user.click(screen.getByRole("switch", { name: "Show Claude in menu bar" }));
  expect(api.updateWorkspace).toHaveBeenLastCalledWith(expect.objectContaining({ usage: expect.objectContaining({ menuBarProviders: ["codex", "claude"], displayMode: "active" }) }));
});

it("saves Antigravity rotation separately from the Codex cycle", async () => {
  const user = userEvent.setup();
  show("usage", { ...workspace.usage, antigravityAutoSwitch: true, autoSwitchRemaining: 8 });
  expect(screen.getByRole("switch", { name: "Auto-switch accounts" })).not.toBeChecked();
  expect(screen.getByRole("spinbutton", { name: "Switch Antigravity at remaining percent" })).toHaveValue(2);
  const account = await screen.findByRole("checkbox", { name: "Include Google work in Antigravity rotation" });
  await user.click(account);
  expect(api.updateWorkspace).toHaveBeenCalledWith(expect.objectContaining({
    usage: expect.objectContaining({ antigravitySwitchAccounts: ["google"], autoSwitchEnabled: false, autoSwitchRemaining: 8 }),
  }));
});

it("saves initials per workspace using the switch in Appearance", async () => {
  const user = userEvent.setup(); show("menu-bar");
  await user.click(screen.getByRole("button", { name: "Appearance" }));
  const toggle = screen.getByRole("switch", { name: "Show account initials" });
  expect(toggle).toBeChecked();
  await user.click(toggle);
  expect(api.updateWorkspace).toHaveBeenLastCalledWith(expect.objectContaining({ usage: expect.objectContaining({ showAccountName: false }) }));
});


it("removes alert controls and saves the Codex section reset toggle", async () => {
  const user = userEvent.setup(); show("usage");
  for (const name of ["Workspace alerts", "Session reset", "Alert at 90%"])
    expect(screen.queryByRole("switch", { name })).not.toBeInTheDocument();
  expect(screen.queryByLabelText("Custom alert percent")).not.toBeInTheDocument();
  await user.click(screen.getByRole("switch", { name: "Show reset updates" }));
  expect(api.updateWorkspace).toHaveBeenLastCalledWith(expect.objectContaining({usage: expect.objectContaining({showCodexResets:false})}));
});

it("keeps usage policy separate from menu-bar presentation without a separate prediction control", async () => {
  const user = userEvent.setup(); show("usage");
  expect(screen.getByRole("radio", {name:"Remaining"})).toBeChecked();
  expect(screen.getByRole("switch", {name:"Show reset updates"})).toBeChecked();
  expect(screen.queryByRole("checkbox", {name:"Include predictions"})).not.toBeInTheDocument();
  expect(screen.queryByRole("switch", {name:"Menu bar usage"})).not.toBeInTheDocument();
  expect(screen.queryByRole("switch", {name:"Limit colors"})).not.toBeInTheDocument();
  expect(screen.queryByRole("combobox", {name:"Menu bar provider"})).not.toBeInTheDocument();
  await user.click(screen.getByRole("tab", {name:"Menu bar"}));
  expect(screen.queryByRole("switch", {name:"Show reset updates"})).not.toBeInTheDocument();
  expect(screen.getByRole("switch", {name:"Menu bar usage"})).toBeChecked();
  expect(screen.getByRole("switch", {name:"Limit colors"})).toBeInTheDocument();
});

it("uses one accessible limit-color toggle without threshold controls", async () => {
  const user = userEvent.setup(); show("menu-bar", {...workspace.usage, warningColors:true, warningThresholds:[55,75,90,95]});
  const toggle = screen.getByRole("switch", {name:"Limit colors"});
  expect(toggle).toBeChecked();
  expect(toggle).toHaveAccessibleDescription("Turn red below 15% remaining.");
  expect(toggle.closest("details")).toBeNull();
  expect(screen.queryByRole("group", {name:"Color thresholds"})).not.toBeInTheDocument();
  expect(screen.queryByRole("switch", {name:/Change color at/})).not.toBeInTheDocument();
  toggle.focus(); await user.keyboard(" ");
  expect(api.updateWorkspace).toHaveBeenLastCalledWith(expect.objectContaining({usage:expect.objectContaining({warningColors:false})}));
});
it("can enable fixed red warnings even with legacy disabled thresholds", async () => {
  const user = userEvent.setup(); show("menu-bar", {...workspace.usage, warningColors:false,warningThresholds:[]});
  await user.click(screen.getByRole("switch",{name:"Limit colors"}));
  expect(api.updateWorkspace).toHaveBeenLastCalledWith(expect.objectContaining({usage:expect.objectContaining({warningColors:true,warningThresholds:[]})}));
});

 it("offers visual radio choices with keyboard activation and preserves other usage settings", async () => {
  const user = userEvent.setup(); show("menu-bar");
  await user.click(screen.getByRole("button", { name: "Appearance" }));
  expect(screen.getByRole("radio", {name:"Reset timeline"})).toBeChecked();
  screen.getByRole("radio", {name:"Progress bars"}).focus(); await user.keyboard(" ");
  await waitFor(() => expect(api.updateWorkspace).toHaveBeenCalled());
  expect(api.updateWorkspace).toHaveBeenLastCalledWith(expect.objectContaining({usage:expect.objectContaining({menuBarStyle:"progress", menuBarEnabled:true})}));
});
it("hides dependent controls when menu bar usage is disabled", () => {
  show("menu-bar", {...workspace.usage, menuBarEnabled:false});
  expect(screen.queryByRole("radiogroup")).not.toBeInTheDocument();
  expect(screen.queryByRole("switch", {name:"Limit colors"})).not.toBeInTheDocument();
});

it("saves the usage direction with keyboard activation and retains focus", async () => {
  const user = userEvent.setup(); show("usage");
  screen.getByRole("radio", { name: "Used" }).focus();
  await user.keyboard(" ");
  await waitFor(() => expect(api.updateWorkspace).toHaveBeenCalledWith(expect.objectContaining({ usage: expect.objectContaining({ showRemaining: false, menuBarEnabled: true }) })));
  await waitFor(() => expect(screen.getByRole("radio", { name: "Used" })).toHaveFocus());
});

it("preserves the saved prediction preference while reset updates are hidden", async () => {
  const user = userEvent.setup(); show("usage", { ...workspace.usage, showProbableResets: true });
  await user.click(screen.getByRole("switch", { name: "Show reset updates" }));
  expect(api.updateWorkspace).toHaveBeenCalledWith(expect.objectContaining({ usage: expect.objectContaining({ showCodexResets: false, showProbableResets: true }) }));
});

it("has no prediction control even for an old disabled preference", () => {
  show("usage", { ...workspace.usage, showCodexResets: false, showProbableResets: false });
  expect(screen.queryByRole("checkbox", { name: "Include predictions" })).not.toBeInTheDocument();
});

it("reports reset save errors without changing the selected preference", async () => {
  const user = userEvent.setup(); show("usage", { ...workspace.usage, showCodexResets: false });
  api.updateWorkspace.mockRejectedValueOnce(new Error("Could not save usage"));
  await user.click(screen.getByRole("switch", { name: "Show reset updates" }));
  expect(api.updateWorkspace).toHaveBeenCalledWith(expect.objectContaining({ usage: expect.objectContaining({ showCodexResets: true }) }));
  expect(await findErrorToast("Could not save usage")).toHaveTextContent("Could not save usage");
  expect(screen.getByRole("switch", { name: "Show reset updates" })).not.toBeChecked();
});


it('offers floating only providers with a real active account in this workspace',async()=>{
 api.antigravityAccounts.mockResolvedValue([{id:'google',name:'Google',provider:'antigravity',active:true}]);
 const current={...workspace,usage:{...workspace.usage,activeAccounts:{claude:'claude'}}};
 const state=makeState();const floating=vi.fn(()=>null);
 const props={open:true,workspace:current,state,profiles:{profiles:[codex],activeProfileId:codex.id,canImport:true,switchError:null},claudeAccounts:[claude],onBusyChange:vi.fn(),onChanged:vi.fn(),floatingSettings:floating};
 const v=render(<Tabs defaultValue="menu-bar"><WorkspaceSettings {...props}/></Tabs>);
 await waitFor(()=>expect(floating).toHaveBeenLastCalledWith(['codex','antigravity'],{codex:'codex',antigravity:'google'},{codex:codex.name,antigravity:'Google'}));
 v.rerender(<Tabs defaultValue="menu-bar"><WorkspaceSettings {...props} profiles={{...props.profiles,profiles:[{...codex,active:false}]}} claudeAccounts={[{...claude,active:true}]}/></Tabs>);
 expect(floating).toHaveBeenLastCalledWith(['claude','antigravity'],{claude:'claude',antigravity:'google'},{claude:claude.name,antigravity:'Google'});
 v.rerender(<Tabs defaultValue="menu-bar"><WorkspaceSettings {...props} workspace={{...current,antigravityAccountIds:undefined}}/></Tabs>);
 expect(floating).toHaveBeenLastCalledWith(['codex'],{codex:'codex'},{codex:codex.name});
 v.rerender(<Tabs defaultValue="menu-bar"><WorkspaceSettings {...props} workspace={{...current,accountIds:[],antigravityAccountIds:[]}}/></Tabs>);
 expect(floating).toHaveBeenLastCalledWith([],{},{});
});

it("shows both display sections without nested navigation or preference writes", async () => {
  const user = userEvent.setup();
  const state = makeState();
  const floating = <section aria-label="Floating preview"><input aria-label="Unsaved preview value" defaultValue="Keep me" /></section>;
  render(<Tabs defaultValue="menu-bar"><WorkspaceSettings open workspace={workspace} state={state}
    profiles={{ profiles: [codex], activeProfileId: codex.id, canImport: true, switchError: null }}
    onBusyChange={vi.fn()} onChanged={vi.fn()} floatingSettings={() => floating} /></Tabs>);
  const menu = screen.getByRole("switch", { name: "Menu bar usage" });
  expect(menu).toBeVisible();
  expect(screen.getByRole("region", { name: "Floating preview" })).toBeVisible();
  expect(screen.getByRole("region", { name: "Menu bar" })).toBeVisible();
  expect(screen.getByRole("region", { name: "Floating" })).toBeVisible();
  expect(screen.queryByRole("radiogroup", { name: "Display location" })).not.toBeInTheDocument();
  expect(screen.queryByRole("radio", { name: "Floating" })).not.toBeInTheDocument();
  const input = screen.getByRole("textbox", { name: "Unsaved preview value" });
  await user.clear(input);
  await user.type(input, "Preserved");
  await user.click(screen.getByLabelText("Appearance"));
  expect(menu).toBeVisible();
  expect(screen.getByRole("textbox", { name: "Unsaved preview value" })).toBe(input);
  expect(input).toHaveValue("Preserved");
  expect(api.updateWorkspace).not.toHaveBeenCalled();
});

it("starts secondary menu bar settings closed while keeping their saved summaries", () => {
  show("menu-bar", { ...workspace.usage, menuBarStyle: "progress", warningColors: true });
  const appearance = screen.getByRole("button", { name: "Appearance" });
  expect(appearance).toHaveAttribute("aria-expanded", "false");
  expect(appearance).toHaveTextContent("Progress bars");
  expect(screen.getByRole("switch", {name:"Limit colors"})).toBeVisible();
  expect(screen.getByRole("figure", { name: "Menu bar preview · Sample usage" })).toBeVisible();
});
