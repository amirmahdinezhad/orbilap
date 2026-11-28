import { render } from "../test/notifications";
import { act, cleanup,  screen } from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { useWorkspaceQuotas } from "./WorkspaceAccounts";
import type { QuotaSet } from "../api";
import type { CodexProfile } from "../types";

const quota = vi.hoisted(() => vi.fn());
const resetStatus = vi.hoisted(() => vi.fn());
vi.mock("../api", async (original) => ({ ...await original<typeof import("../api")>(), codexProfileQuota: quota, codexResetStatus: resetStatus }));
const profile = (id: string): CodexProfile => ({ id, name: id, email: null, plan: null, connected: true, active: false, needsActivation: false, connectionError: null, loginCommand: "" });
const ready = (...ids: string[]) => Object.fromEntries(ids.map((id) => [id, { provider: "codex" }]));
beforeEach(() => { resetStatus.mockResolvedValue({generatedAt:new Date().toISOString(),latestReset:null,scheduledReset:null,activeWatch:null}); });
afterEach(cleanup);
it("removes an expired subscription from the workspace without exposing a management action", async () => {
  const { WorkspaceAccounts } = await import("./WorkspaceAccounts");
  const { DEFAULT_APP_SETTINGS, DEFAULT_WORKSPACE_USAGE } = await import("../types");
  const workspace = { id: "studio", name: "Studio", accent: "#007aff", accountIds: ["ended", "live"], usage: { ...DEFAULT_WORKSPACE_USAGE, showCodexResets: false } };
  const ended = { ...profile("ended"), name: "Ended account", subscription: { id: "chatgpt", service: "ChatGPT", status: "expired" as const } };
  const props = { workspace, app: DEFAULT_APP_SETTINGS, quotas: ready("live"), busy: false, onManage: vi.fn(), onActivate: vi.fn() };
  const pastDate = { ...profile("live"), subscription: { id: "chatgpt", service: "ChatGPT", expiresAt: "2000-01-01T00:00:00Z" } };
  const profiles = { profiles: [ended, pastDate], activeProfileId: null, canImport: true, switchError: null };
  const view = render(<WorkspaceAccounts {...props} profiles={profiles} />);
  expect(screen.getByRole("article", { name: "live account" })).toBeVisible();
  expect(screen.queryByText(/expired accounts|ended account/i)).not.toBeInTheDocument();
  view.rerender(<WorkspaceAccounts {...props} profiles={{ ...profiles, profiles: [ended] }} />);
  expect(screen.queryByRole("region", { name: "Workspace accounts" })).not.toBeInTheDocument();
});

it("rejects a delayed quota response after switching workspace", async () => {
  let resolveOld!: (quota: QuotaSet) => void;
  quota.mockImplementation((id) => id === "old" ? new Promise((resolve) => { resolveOld = resolve; }) : Promise.resolve({ provider: "codex", windows: [{ window: "weekly", percent: 10 }] }));
  function Harness({ id }: { id: string }) { return <output>{JSON.stringify(useWorkspaceQuotas([profile(id)], id, 0))}</output>; }
  const view = render(<Harness id="old" />);
  view.rerender(<Harness id="new" />);
  expect(await screen.findByText(/"new"/)).toBeInTheDocument();
  await act(async () => resolveOld({ provider: "codex", windows: [{ window: "weekly", percent: 100 }] }));
  expect(screen.getByRole("status")).not.toHaveTextContent('"old"');
});

it("shows the live active account, no switch action for the live account, and one provider logo", async () => {
  const { WorkspaceAccounts } = await import("./WorkspaceAccounts");
  const { DEFAULT_APP_SETTINGS, DEFAULT_WORKSPACE_USAGE } = await import("../types");
  const defaults = { ...DEFAULT_WORKSPACE_USAGE, showProbableResets: false, activeAccounts: { codex: "emma" } };
  const workspace = { id: "studio", name: "Studio", accent: "#007aff", accountIds: ["zoe", "emma"], usage: defaults };
  const emma = { ...profile("emma"), active: true, name: "Emma Brooks", email: "emma@example.com" };
  const zoe = { ...profile("zoe"), name: "Zoe Wilson", email: "zoe@example.com" };
  const activate = vi.fn();
  render(<WorkspaceAccounts workspace={workspace} app={{ ...DEFAULT_APP_SETTINGS, workspaces: [workspace], activeWorkspaceId: workspace.id }} profiles={{ profiles: [emma, zoe], activeProfileId: "emma", canImport: true, switchError: null }} quotas={ready("emma", "zoe")} busy={false} onManage={vi.fn()} onActivate={activate} />);
  const { within } = await import("@testing-library/react");
  const group = screen.getByRole("region", { name: "Workspace accounts" });
  const current = screen.getByRole("article", { name: "Emma Brooks account" });
  const backup = screen.getByRole("article", { name: "Zoe Wilson account" });
  expect(within(group).getAllByRole("article")).toEqual([current, backup]);
  expect(current).toHaveClass("is-active");
  expect(within(group).getAllByText("Active")).toHaveLength(1);
  expect(within(current).getByText("Active")).toBeVisible();
  expect(within(current).queryByRole("button", { name: /Switch/i })).not.toBeInTheDocument();
  expect(within(backup).getByRole("button", { name: "Switch to Zoe Wilson" })).toBeEnabled();
  expect(group.querySelectorAll(".plogo")).toHaveLength(1);
  expect(current.querySelector(".plogo")).toBeNull();
  const user = (await import("@testing-library/user-event")).default.setup();
  expect(activate).not.toHaveBeenCalled();
  within(backup).getByRole("button", { name: "Switch to Zoe Wilson" }).focus();
  await user.keyboard("[Space]");
  expect(activate).toHaveBeenCalledWith("zoe");
});

it("shows one provider reset outside account cards and stops polling when disabled", async () => {
  const { WorkspaceAccounts } = await import("./WorkspaceAccounts");
  const { DEFAULT_APP_SETTINGS, DEFAULT_WORKSPACE_USAGE } = await import("../types");
  resetStatus.mockResolvedValue({generatedAt: new Date().toISOString(), latestReset:{id:"reset",resetType:"regular",announcedAt:new Date(Date.now()-60_000).toISOString()}, scheduledReset:{resetType:"regular",announcedAt:new Date(Date.now()-60_000).toISOString(),scheduledFor:new Date(Date.now()+3600_000).toISOString()},activeWatch:null});
  const workspace = {id:"studio",name:"Studio",accent:"#007aff",accountIds:["a","b"],usage:{...DEFAULT_WORKSPACE_USAGE}};
  const props = {workspace,app:DEFAULT_APP_SETTINGS,profiles:{profiles:[{...profile("a"),active:true},{...profile("b"),active:true}],activeProfileId:"a",canImport:true,switchError:null},quotas:ready("a","b"),busy:false,onManage:vi.fn(),onActivate:vi.fn()};
  const view = render(<WorkspaceAccounts {...props} />);
  const notice = await screen.findByLabelText("Codex reset outlook");
  expect(notice.closest("article")).toBeNull();
  expect(screen.getAllByText("Resets in 1h 00m")).toHaveLength(1);
  const calls = resetStatus.mock.calls.length;
  view.rerender(<WorkspaceAccounts {...props} workspace={{...workspace,usage:{...workspace.usage,showCodexResets:false}}} />);
  expect(screen.queryByLabelText("Codex reset outlook")).not.toBeInTheDocument();
  expect(resetStatus).toHaveBeenCalledTimes(calls);
});

it("keeps Codex activity global and allows switching a lone inactive workspace account", async () => {
  const { WorkspaceAccounts } = await import("./WorkspaceAccounts");
  const { DEFAULT_APP_SETTINGS, DEFAULT_WORKSPACE_USAGE } = await import("../types");
  const profiles = { profiles: [{ ...profile("live"), active: true }, profile("imported")], activeProfileId: "live", canImport: true, switchError: null };
  const first = { id: "first", name: "First", accent: "#007aff", accountIds: ["live"], usage: { ...DEFAULT_WORKSPACE_USAGE, showCodexResets: false } };
  const second = { ...first, id: "second", accountIds: ["imported"], usage: { ...first.usage, activeAccounts: { codex: "imported" } } };
  const activate = vi.fn();
  const props = { app: DEFAULT_APP_SETTINGS, profiles, quotas: ready("live", "imported"), busy: false, onManage: vi.fn(), onActivate: activate };
  const view = render(<WorkspaceAccounts {...props} workspace={first} />);
  expect(screen.getAllByText("Active")).toHaveLength(1);
  view.rerender(<WorkspaceAccounts {...props} workspace={second} />);
  expect(screen.queryByText("Active")).not.toBeInTheDocument();
  const user = (await import("@testing-library/user-event")).default.setup();
  await user.tab();
  const switchButton = screen.getByRole("button", { name: "Switch to imported" });
  expect(switchButton).toBeEnabled();
  switchButton.focus();
  await user.keyboard("[Space]");
  expect(activate).toHaveBeenCalledWith("imported");
  activate.mockClear();
  expect(screen.getByRole("button", { name: "More options for imported" })).toBeEnabled();
  expect(activate).not.toHaveBeenCalled();
  view.rerender(<WorkspaceAccounts {...props} workspace={{ ...second, accountIds: ["imported", "live"] }} />);
  const { within } = await import("@testing-library/react");
  await user.click(screen.getByRole("button", { name: "Switch to imported" }));
  expect(activate).toHaveBeenCalledWith("imported");
  expect(screen.getAllByText("Active")).toHaveLength(1);
  expect(screen.getAllByRole("article")[0]).toHaveAccessibleName("live account");
  expect(within(screen.getByRole("article", { name: "live account" })).getByText("Active")).toBeInTheDocument();
  view.rerender(<WorkspaceAccounts {...props} workspace={second} profiles={{ ...profiles, activeProfileId: "imported", profiles: [profile("live"), { ...profile("imported"), active: true }] }} />);
  expect(within(screen.getByRole("article", { name: "imported account" })).getByText("Active")).toBeInTheDocument();
  view.rerender(<WorkspaceAccounts {...props} workspace={first} profiles={{ ...profiles, activeProfileId: "imported", profiles: [profile("live"), { ...profile("imported"), active: true }] }} />);
  expect(screen.queryByText("Active")).not.toBeInTheDocument();
});

it("publishes a complete quota batch and settles failed accounts instead of revealing balances one at a time",async()=>{
  let fast!:(q:QuotaSet)=>void,slow!:(q:QuotaSet)=>void;
  quota.mockImplementation((id:string)=>id==="fast"?new Promise(resolve=>{fast=resolve;}):id==="slow"?new Promise(resolve=>{slow=resolve;}):Promise.reject(new Error("Offline")));
  function Harness(){return <output>{JSON.stringify(useWorkspaceQuotas([profile("fast"),profile("slow"),profile("failed")],"batch",0))}</output>;}
  render(<Harness />);
  await act(async()=>fast({provider:"codex",resetCredits:{availableCount:1,planType:"plus"}}));
  expect(screen.getByRole("status")).toHaveTextContent("{}");
  await act(async()=>slow({provider:"codex",resetCredits:{availableCount:0,planType:"plus"}}));
  expect(screen.getByRole("status")).toHaveTextContent('"fast"');expect(screen.getByRole("status")).toHaveTextContent('"slow"');expect(screen.getByRole("status")).toHaveTextContent("Offline");
});

it("keeps account identity behind the card skeleton until the entire batch is ready",async()=>{
  const {WorkspaceAccounts}=await import("./WorkspaceAccounts");const {DEFAULT_APP_SETTINGS,DEFAULT_WORKSPACE_USAGE}=await import("../types");
  const workspace={id:"loading",name:"Loading",accent:"#007aff",accountIds:["a","b"],usage:{...DEFAULT_WORKSPACE_USAGE,showCodexResets:false}};
  const props={workspace,app:DEFAULT_APP_SETTINGS,profiles:{profiles:[profile("a"),profile("b")],activeProfileId:null,canImport:true,switchError:null},busy:false,onManage:vi.fn(),onActivate:vi.fn()};
  const a:QuotaSet={provider:"codex",resetCredits:{availableCount:1,planType:"plus"}};
  const view=render(<WorkspaceAccounts {...props} quotas={{a}} />);
  expect(screen.getByLabelText("Loading accounts")).toBeInTheDocument();expect(screen.queryByRole("article")).not.toBeInTheDocument();
  view.rerender(<WorkspaceAccounts {...props} quotas={{a,b:{provider:"codex"}}} />);
  expect(screen.queryByLabelText("Loading accounts")).not.toBeInTheDocument();expect(screen.getAllByRole("article")).toHaveLength(2);
  expect(screen.getByRole("img", { name: "1 banked reset available" }).closest("article")).toHaveAccessibleName("a account");
  expect(screen.queryByRole("img", { name: "0 banked resets available" })).not.toBeInTheDocument();
  view.rerender(<WorkspaceAccounts {...props} quotas={{a:{...a,resetCredits:{availableCount:3,planType:"plus"}},b:{provider:"codex"}}} />);
  expect(screen.getByRole("img", { name: "3 banked resets available" })).toBeVisible();
  expect(screen.queryByRole("img", { name: "1 banked reset available" })).not.toBeInTheDocument();
  view.rerender(<WorkspaceAccounts {...props} quotas={{a:{...a,resetCredits:{availableCount:0,planType:"plus"}},b:{provider:"codex"}}} />);
  expect(screen.queryByRole("img", { name: /banked resets? available/ })).not.toBeInTheDocument();
});


it("requires an installed Codex client before activating an imported login", async () => {
  const { WorkspaceAccounts } = await import("./WorkspaceAccounts");
  const { DEFAULT_APP_SETTINGS, DEFAULT_WORKSPACE_USAGE } = await import("../types");
  const workspace = { id: "setup", name: "Setup", accent: "#007aff", accountIds: ["imported"], usage: { ...DEFAULT_WORKSPACE_USAGE, showCodexResets: false } };
  render(<WorkspaceAccounts workspace={workspace} app={DEFAULT_APP_SETTINGS}
    profiles={{ profiles: [profile("imported")], activeProfileId: null, canImport: false, switchError: null, desktopInstalled: false, cliInstalled: false }}
    quotas={ready("imported")} busy={false} onManage={vi.fn()} onActivate={vi.fn()} />);
  expect(screen.getByText("Install Codex CLI or Codex app and sign in, then refresh.")).toBeVisible();
  expect(screen.getByRole("button", { name: "Switch to imported" })).toBeDisabled();
  expect(screen.queryByText("Active")).not.toBeInTheDocument();
});

it.each(["disconnected", "expired", "network"])("distinguishes %s accounts and restores the healthy card after reconnect", async (kind) => {
  const { WorkspaceAccounts } = await import("./WorkspaceAccounts");
  const { DEFAULT_APP_SETTINGS, DEFAULT_WORKSPACE_USAGE } = await import("../types");
  const { within } = await import("@testing-library/react");
  const user = (await import("@testing-library/user-event")).default.setup();
  const account = { ...profile("saved"), active: true, connected: kind !== "disconnected", name: "Personal", email: "personal@example.com", connectionError: kind === "disconnected" ? "Saved login is missing." : null };
  const workspace = { id: "studio", name: "Studio", accent: "#505193", accountIds: [account.id], usage: { ...DEFAULT_WORKSPACE_USAGE, showCodexResets: false } };
  const reconnect = vi.fn();
  const props = { workspace, app: DEFAULT_APP_SETTINGS, profiles: { profiles: [account], activeProfileId: account.id, canImport: true, switchError: null }, busy: false, onManage: vi.fn(), onActivate: vi.fn(), onReconnect: reconnect };
  const quotas = { saved: { provider: "codex", error: kind === "network" ? "Network request timed out" : "session expired", windows: [{ window: "Weekly", percent: 10 }], resetCredits: { availableCount: 1, planType: "plus" } } };
  const view = render(<WorkspaceAccounts {...props} quotas={quotas} />);
  const card = screen.getByRole("article", { name: "Personal account" });
  expect(within(card).getByText("personal@example.com")).toBeVisible();
  if (kind === "network") {
    expect(card).not.toHaveClass("is-disconnected");
    expect(await screen.findByText("Network request timed out")).toBeVisible();
    expect(within(card).queryByText("Reconnect needed")).not.toBeInTheDocument();
  } else {
    expect(card).toHaveClass("is-disconnected");
    expect(within(card).queryByRole("img", { name: /banked reset/ })).not.toBeInTheDocument();
    expect(within(card).getByRole("status", { name: "Connection for Personal" })).toHaveTextContent("Reconnect needed");
    expect(within(card).queryByText("Active")).not.toBeInTheDocument();
    expect(within(card).queryByRole("meter")).not.toBeInTheDocument();
    expect(within(card).queryByRole("button", { name: /Switch|Banked resets/ })).not.toBeInTheDocument();
    await user.click(within(card).getByRole("button", { name: "Reconnect" }));
    expect(reconnect).toHaveBeenCalledWith(account.id);
  }
  view.rerender(<WorkspaceAccounts {...props} profiles={{ ...props.profiles, profiles: [{ ...account, connected: true, connectionError: null }] }} quotas={{ saved: { provider: "codex", windows: [{ window: "Weekly", percent: 10 }] } }} />);
  expect(card).not.toHaveClass("is-disconnected");
  expect(within(card).queryByText("Reconnect needed")).not.toBeInTheDocument();
  expect(within(card).getByRole("meter", { name: "Weekly remaining" })).toBeVisible();
  expect(within(card).getByText("Active")).toBeVisible();
});

it("applies the sorting control to real account cards, not only its selected label", async () => {
  const { WorkspaceAccounts } = await import("./WorkspaceAccounts");
  const { AccountSortProvider } = await import("./AccountSorting");
  const { DEFAULT_APP_SETTINGS, DEFAULT_WORKSPACE_USAGE } = await import("../types");
  const user = (await import("@testing-library/user-event")).default.setup();
  const workspace = {id:"sort-regression",name:"Studio",accent:"#007aff",accountIds:["zoe","emma"],usage:{...DEFAULT_WORKSPACE_USAGE,showCodexResets:false}};
  const profiles = {profiles:[{...profile("zoe"),name:"Zoe",active:true},{...profile("emma"),name:"Emma"}],activeProfileId:"zoe",canImport:true,switchError:null};
  render(<AccountSortProvider workspaceId={workspace.id}><WorkspaceAccounts workspace={workspace} profiles={profiles} app={DEFAULT_APP_SETTINGS} quotas={ready("zoe","emma")} busy={false} onManage={vi.fn()} onActivate={vi.fn()}/></AccountSortProvider>);
  expect(screen.getAllByRole("article").map(card=>card.getAttribute("aria-label"))).toEqual(["Zoe account","Emma account"]);
  await user.click(screen.getByRole("combobox",{name:"Sort accounts"}));
  await user.click(screen.getByRole("option",{name:"Account name"}));
  expect(screen.getAllByRole("article").map(card=>card.getAttribute("aria-label"))).toEqual(["Emma account","Zoe account"]);
  await user.click(await screen.findByRole("button",{name:"Reverse sort order, a to z"}));
  expect(screen.getAllByRole("article").map(card=>card.getAttribute("aria-label"))).toEqual(["Zoe account","Emma account"]);
});

it("offers switching when the current Codex login was not saved during setup", async () => {
  const { WorkspaceAccounts } = await import("./WorkspaceAccounts");
  const { DEFAULT_APP_SETTINGS, DEFAULT_WORKSPACE_USAGE } = await import("../types");
  const workspace = { id: "new", name: "New", accent: "#007aff", accountIds: ["imported"], usage: { ...DEFAULT_WORKSPACE_USAGE, showCodexResets: false, activeAccounts: { codex: "imported" } } };
  const activate = vi.fn();
  const props = { workspace, app: DEFAULT_APP_SETTINGS, profiles: { profiles: [profile("imported")], activeProfileId: null, canImport: true, desktopInstalled: true, switchError: null }, quotas: ready("imported"), busy: false, onManage: vi.fn(), onActivate: activate };
  const view = render(<WorkspaceAccounts {...props} />);
  expect(screen.queryByText("Active")).not.toBeInTheDocument();
  expect(screen.queryByText("Choose an account’s switch button to activate it in Codex.")).not.toBeInTheDocument();
  const user = (await import("@testing-library/user-event")).default.setup();
  await user.click(screen.getByRole("button", { name: "Switch to imported" }));
  expect(activate).toHaveBeenCalledExactlyOnceWith("imported");
  view.rerender(<WorkspaceAccounts {...props} busy />);
  expect(screen.getByRole("button", { name: "Switch to imported" })).toBeDisabled();
  view.rerender(<WorkspaceAccounts {...props} profiles={{ ...props.profiles, switchError: "Cannot read Codex configuration." }} />);
  expect(screen.getByRole("button", { name: "Switch to imported" })).toBeDisabled();
});

it("keeps surviving DOM cards mounted while refreshing usage after membership removal", async () => {
  const { WorkspaceAccounts } = await import("./WorkspaceAccounts");
  const { DEFAULT_APP_SETTINGS, DEFAULT_WORKSPACE_USAGE } = await import("../types");
  const value: QuotaSet = { provider: "codex", windows: [{ window: "5-hour", percent: 32 }] };
  let finishRefresh!: (value: QuotaSet) => void;
  quota.mockResolvedValueOnce(value).mockResolvedValueOnce(value)
    .mockImplementation(() => new Promise(resolve => { finishRefresh = resolve; }));
  function Harness({ ids }: { ids: string[] }) {
    const profiles = ids.map(profile);
    const quotas = useWorkspaceQuotas(profiles, "removal", 0);
    const workspace = { id: "removal", name: "Removal", accent: "#007aff", accountIds: ids, usage: { ...DEFAULT_WORKSPACE_USAGE, showCodexResets: false } };
    return <WorkspaceAccounts workspace={workspace} app={DEFAULT_APP_SETTINGS} profiles={{ profiles, activeProfileId: null, canImport: true, switchError: null }} quotas={quotas} busy={false} onManage={vi.fn()} onActivate={vi.fn()} />;
  }
  const view = render(<Harness ids={["removed", "survivor"]} />);
  const survivingCard = await screen.findByRole("article", { name: "survivor account" });
  view.rerender(<Harness ids={["survivor"]} />);
  expect(screen.queryByRole("article", { name: "removed account" })).not.toBeInTheDocument();
  expect(screen.getByRole("article", { name: "survivor account" })).toBe(survivingCard);
  await act(async () => finishRefresh(value));
  expect(screen.getByRole("article", { name: "survivor account" })).toBe(survivingCard);
});

it.each(["workspace", "refresh", "identity", "addition"])("does not reuse narrowed-list usage after %s changes", async change => {
  quota.mockResolvedValueOnce({ provider: "codex", windows: [{ window: "5-hour", percent: 32 }] })
    .mockImplementation(() => new Promise(() => {}));
  function Harness({ changed = false }: { changed?: boolean }) {
    const accounts = [{ ...profile("saved"), active: changed && change === "identity" }];
    if (changed && change === "addition") accounts.push({ ...profile("new"), active: false });
    return <output>{JSON.stringify(useWorkspaceQuotas(accounts, changed && change === "workspace" ? "other" : "original", changed && change === "refresh" ? 1 : 0))}</output>;
  }
  const view = render(<Harness />);
  await act(async () => {});
  expect(screen.getByRole("status")).toHaveTextContent('"percent":32');
  view.rerender(<Harness changed />);
  expect(screen.getByRole("status")).toHaveTextContent("{}");
});
