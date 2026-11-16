import { render, findErrorToast } from "../test/notifications";
import { act, cleanup, fireEvent, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { BankedResetSection } from "./BankedResetSection";
import { AccountSettings } from "./AccountSettings";
import { DEFAULT_WORKSPACE_USAGE } from "../types";
import type { BankedResetCredit, BankedResetInventory } from "../api";
import type { CodexProfile } from "../types";
const api = vi.hoisted(() => ({ inventory: vi.fn(), prepare: vi.fn(), consume: vi.fn() }));
vi.mock("../api", async (original) => ({ ...await original<typeof import("../api")>(), codexBankedResets: api.inventory, prepareCodexReset: api.prepare, consumeCodexReset: api.consume }));
const profile: CodexProfile = { id: "inactive", name: "Backup", email: "backup@example.com", plan: "plus", connected: true, active: false, needsActivation: false, connectionError: null, loginCommand: "" };
const credit: BankedResetCredit = { id: "first", title: "Full reset (Weekly + 5 hr)", expiresAt: "2099-11-30T12:00:00Z", coveredWindows: ["5-hour", "Weekly"], canUse: true, unavailableReason: null };
const inventory = (changes: Partial<BankedResetInventory> = {}): BankedResetInventory => ({ availableCount: 1, credits: [credit], pendingCredit: null, usage: { provider: "codex", windows: [{ window: "Weekly", percent: 100 }] }, ...changes });
const used = vi.fn(), close = vi.fn();
const props = () => ({ accountId: profile.id, refreshKey: 0, onBusyChange: vi.fn(), onUsed: used });
beforeEach(() => { vi.clearAllMocks(); api.inventory.mockResolvedValue(inventory()); api.prepare.mockResolvedValue({ token: "review-1", credit, retry: false }); api.consume.mockResolvedValue({ code: "reset", windows_reset: 2 }); });
afterEach(cleanup);

it("changes the same button to Confirm and spends only on a distinct activation", async () => {
  const user = userEvent.setup();
  render(<BankedResetSection {...props()} />);
  const use = await screen.findByRole("button", {name:"Use"});
  expect(api.consume).not.toHaveBeenCalled();
  expect(screen.queryByRole("button", {name:"Refresh resets"})).not.toBeInTheDocument();
  await user.dblClick(use);
  expect(screen.getByRole("button", {name:"Confirm"})).toBe(use);
  expect(use).toHaveFocus();
  expect(api.prepare).not.toHaveBeenCalled();
  expect(api.consume).not.toHaveBeenCalled();
  await user.click(use);
  expect(api.prepare).toHaveBeenCalledWith("inactive", "first");
  expect(api.consume).toHaveBeenCalledExactlyOnceWith("inactive", "review-1");
  expect(screen.queryByRole("alertdialog")).not.toBeInTheDocument();
  expect(used).toHaveBeenCalledTimes(1);
});

it("preserves confirmation through WebKit mouse-down focus handling", async () => {
  const user = userEvent.setup();
  const applied = vi.fn();
  render(<BankedResetSection {...props()} onApplied={applied} />);
  const button = await screen.findByRole("button", { name: "Use" });
  await user.click(button);
  // Model WebKit's default mouse-down behavior; jsdom otherwise focuses buttons.
  const notCancelled = fireEvent.mouseDown(button, { button: 0 });
  if (notCancelled) act(() => button.blur());
  fireEvent.mouseUp(button, { button: 0 });
  fireEvent.click(button, { detail: 1 });
  await waitFor(() => expect(api.consume).toHaveBeenCalledExactlyOnceWith("inactive", "review-1"));
  await waitFor(() => expect(applied).toHaveBeenCalledTimes(1));
});

it("keeps an ambiguous token for retry and blocks repeated requests while applying", async () => {
  const user = userEvent.setup();
  let reject!: (error: Error) => void;
  api.consume.mockImplementationOnce(() => new Promise((_, no) => {reject = no;}));
  render(<AccountSettings profile={profile} provider="codex"
    workspace={{id:"test",name:"Test",accent:"#000",accountIds:[profile.id],usage:DEFAULT_WORKSPACE_USAGE}}
    onClose={close} onChanged={vi.fn()} onRename={vi.fn()} bankedReset={props()} />);
  await user.click(await screen.findByRole("button", {name:"Use"}));
  await user.click(screen.getByRole("button", {name:"Confirm"}));
  const applying = screen.getByRole("button", {name:"Applying…"});
  expect(applying).toHaveAttribute("aria-disabled", "true");
  await user.click(applying);
  await user.keyboard("{Escape}");
  expect(close).not.toHaveBeenCalled();
  expect(api.consume).toHaveBeenCalledTimes(1);
  await act(async () => reject(new Error("Result is unknown")));
  await user.click(await screen.findByRole("button", {name:"Retry"}));
  expect(api.prepare).toHaveBeenCalledTimes(1);
  expect(api.consume.mock.calls).toEqual([["inactive","review-1"],["inactive","review-1"]]);
  await waitFor(() => expect(close).toHaveBeenCalledTimes(1));
});

it("closes the editor and refreshes cards after success", async () => {
  const user = userEvent.setup();
  let finish!: (value: {code:string}) => void;
  api.consume.mockReturnValueOnce(new Promise(resolve => {finish = resolve;}));
  const {useState} = await import("react");
  function Editor() {
    const [open, setOpen] = useState(true);
    return <AccountSettings open={open} profile={profile} provider="codex"
      workspace={{id:"test",name:"Test",accent:"#000",accountIds:[profile.id],usage:DEFAULT_WORKSPACE_USAGE}}
      onClose={() => {close();setOpen(false);}} onChanged={vi.fn()} onRename={vi.fn()} bankedReset={props()} />;
  }
  render(<Editor />);
  await user.click(await screen.findByRole("button", {name:"Use"}));
  await user.click(screen.getByRole("button", {name:"Confirm"}));
  expect(close).not.toHaveBeenCalled();
  expect(used).not.toHaveBeenCalled();
  await act(async () => finish({code:"reset"}));
  expect(screen.getByRole("button", {name:"Done"})).toBeInTheDocument();
  await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
  expect(used).toHaveBeenCalledTimes(1);
});

it("keeps the editor open for a no-op response", async () => {
  api.consume.mockResolvedValue({code:"nothing_to_reset",windows_reset:0});
  const user = userEvent.setup();
  const applied = vi.fn();
  render(<BankedResetSection {...props()} onApplied={applied} />);
  await user.click(await screen.findByRole("button", {name:"Use"}));
  await user.click(screen.getByRole("button", {name:"Confirm"}));
  expect(await screen.findByText(/No reset was used/)).toBeInTheDocument();
  expect(applied).not.toHaveBeenCalled();
});

it("keeps focus and requires a second keyboard activation", async () => {
  const user = userEvent.setup();
  const applied = vi.fn();
  render(<BankedResetSection {...props()} onApplied={applied} />);
  (await screen.findByRole("button", {name:"Use"})).focus();
  await user.keyboard("{Enter}");
  expect(screen.getByRole("button", {name:"Confirm"})).toHaveFocus();
  expect(api.consume).not.toHaveBeenCalled();
  await user.tab();
  expect(screen.getByRole("button", {name:"Use"})).toBeInTheDocument();
  screen.getByRole("button", {name:"Use"}).focus();
  await user.keyboard("{Enter}{Enter}");
  await waitFor(() => expect(applied).toHaveBeenCalledTimes(1));
  expect(api.consume).toHaveBeenCalledTimes(1);
});

it("explains unavailable credits and never redeems them", async () => {
  api.inventory.mockResolvedValue(inventory({credits:[{...credit,canUse:false,unavailableReason:"This reset has expired."}]}));
  render(<BankedResetSection {...props()} />);
  const use = await screen.findByRole("button", {name:"Use"});
  expect(use).toBeDisabled();
  expect(use).toHaveAccessibleDescription("This reset has expired.");
  expect(api.consume).not.toHaveBeenCalled();
});

it("retains inventory retry after a read error", async () => {
  api.inventory.mockRejectedValueOnce(new Error("Network unavailable"));
  const user = userEvent.setup();
  render(<BankedResetSection {...props()} />);
  expect(await findErrorToast("Network unavailable")).toBeInTheDocument();
  await user.click(screen.getByRole("button", {name:"Retry"}));
  expect(await screen.findByRole("button", {name:"Use"})).toBeEnabled();
  expect(api.consume).not.toHaveBeenCalled();
});

it("recovers a pending attempt with its original token", async () => {
  api.inventory.mockResolvedValue(inventory({pendingCredit:credit}));
  api.prepare.mockResolvedValue({token:"recovered",credit,retry:true});
  const user = userEvent.setup();
  render(<BankedResetSection {...props()} />);
  await user.click(await screen.findByRole("button", {name:"Check previous attempt"}));
  expect(api.consume).toHaveBeenCalledWith("inactive","recovered");
});
