import { render, findErrorToast } from "../test/notifications";
import { act, cleanup, fireEvent, waitFor, screen, within } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { AntigravityAccounts } from "./AntigravityAccounts";
import { DEFAULT_WORKSPACE_USAGE } from "../types";
import type { SetupAccount } from "../api";
import { toast } from "sonner";

const { list, activate, usage } = vi.hoisted(() => ({ list: vi.fn(), activate: vi.fn(), usage: vi.fn() }));
vi.mock("../api", async original => ({ ...await original<typeof import("../api")>(), antigravityAccounts: list, activateAntigravityAccount: activate, antigravityAccountQuota: usage }));
afterEach(() => { cleanup(); vi.resetAllMocks(); });
const account = (id: string): SetupAccount => ({ id, provider: "antigravity", name: id, email: `${id}@example.com`, subscription: { id: "google", service: "Google", plan: "Pro" } });
const workspace = { id: "studio", name: "Studio", accent: "#007aff", accountIds: [], antigravityAccountIds: ["one"], usage: DEFAULT_WORKSPACE_USAGE };

it("keeps loading distinct from an error and recovers through Retry", async () => {
  let reject!: (error: Error) => void;
  list.mockImplementationOnce(() => new Promise((_, fail) => { reject = fail; })).mockResolvedValueOnce([account("one")]);
  render(<AntigravityAccounts workspace={workspace} refreshKey={0} onChanged={vi.fn()} />);
  expect(screen.getByLabelText("Loading accounts")).toBeInTheDocument();
  expect(screen.getByRole("status", { name: "Loading Antigravity account count" })).toBeInTheDocument();
  await act(async () => reject(new Error("Offline")));
  expect(await findErrorToast("Offline")).toHaveTextContent("Offline");
  fireEvent.click(screen.getByRole("button", { name: "Retry" }));
  expect(await screen.findByRole("article", { name: "one Antigravity account" })).toBeInTheDocument();
  expect(screen.queryByRole("status", { name: "Loading Antigravity account count" })).not.toBeInTheDocument();
  await waitFor(() => expect(screen.queryByText("Offline")).not.toBeInTheDocument());
});

it("ignores a delayed result from the previous workspace", async () => {
  let resolve!: (accounts: SetupAccount[]) => void;
  list.mockImplementationOnce(() => new Promise(done => { resolve = done; })).mockResolvedValueOnce([account("two")]);
  const view = render(<AntigravityAccounts workspace={workspace} refreshKey={0} onChanged={vi.fn()} />);
  view.rerender(<AntigravityAccounts workspace={{ ...workspace, id: "next", antigravityAccountIds: ["two"] }} refreshKey={0} onChanged={vi.fn()} />);
  expect(await screen.findByRole("article", { name: "two Antigravity account" })).toBeInTheDocument();
  await act(async () => resolve([account("one")]));
  expect(screen.getByRole("article", { name: "two Antigravity account" })).toBeInTheDocument();
  expect(screen.queryByRole("article", { name: "one Antigravity account" })).not.toBeInTheDocument();
});


it("replaces the sign-in prompt when refresh confirms the saved Google account", async () => {
  list.mockResolvedValueOnce([account("one")]).mockResolvedValueOnce([{ ...account("one"), active: true }]);
  const props = { workspace: { ...workspace, usage: { ...workspace.usage, activeAccounts: { antigravity: "one" } } }, onChanged: vi.fn() };
  const view = render(<AntigravityAccounts {...props} refreshKey={0} />);
  await screen.findByRole("article", { name: "one Antigravity account" });
  expect(screen.queryByRole("button", { name: /Switch to/ })).not.toBeInTheDocument();
  expect(screen.queryByText("Experimental")).not.toBeInTheDocument();
  expect(screen.queryByText("Active")).not.toBeInTheDocument();
  view.rerender(<AntigravityAccounts {...props} refreshKey={1} />);
  expect(await within(await screen.findByRole("article", { name: "one Antigravity account" })).findByText("Active")).toBeVisible();
  expect(screen.queryByText(/Choose Switch to use a saved Google account/)).not.toBeInTheDocument();
});

it("switches only the chosen workspace member and blocks duplicate requests", async () => {
  list.mockResolvedValue([account("one"), { ...account("two"), active: true }]);
  let resolve!: (state: unknown) => void;
  activate.mockImplementation(() => new Promise(done => { resolve = done; }));
  const changed = vi.fn();
  render(<AntigravityAccounts workspace={{ ...workspace, antigravityAccountIds: ["one", "two"] }} refreshKey={0} onChanged={changed} />);
  const button = await screen.findByRole("button", { name: "Switch to one" });
  fireEvent.click(button); fireEvent.click(button);
  expect(activate).toHaveBeenCalledTimes(1);
  expect(activate).toHaveBeenCalledWith("studio", "one");
  expect(button).toHaveAttribute("aria-disabled", "true");
  expect(button).toHaveAttribute("aria-busy", "true");
  expect(screen.getByRole("button", { name: "More options for two" })).toBeDisabled();
  await act(async () => resolve({ state: { updated: true }, launchWarning: null }));
  expect(changed).toHaveBeenCalledWith({ updated: true });
  expect((await screen.findByText("Switched to one.")).closest("[data-sonner-toast]")).toHaveAttribute("data-type", "success");
  expect(button).not.toBeInTheDocument();
  expect(within(screen.getByRole("article", { name: "one Antigravity account" })).getByText("Active")).toBeVisible();
  expect(screen.getByRole("button", { name: "Switch to two" })).toBeEnabled();
});

it("keeps the selected account active when the desktop app cannot open", async () => {
  list.mockResolvedValue([account("one"), { ...account("two"), active: true }]);
  const warning = vi.spyOn(toast, "warning").mockImplementation(() => 0);
  activate.mockResolvedValue({ state: { updated: true }, launchWarning: "Could not open Antigravity." });
  const changed = vi.fn();
  try {
    render(<AntigravityAccounts workspace={{ ...workspace, antigravityAccountIds: ["one", "two"] }} refreshKey={0} onChanged={changed} />);
    fireEvent.click(await screen.findByRole("button", { name: "Switch to one" }));
    expect(await within(screen.getByRole("article", { name: "one Antigravity account" })).findByText("Active")).toBeVisible();
    expect(changed).toHaveBeenCalledWith({ updated: true });
    expect(warning).toHaveBeenCalledWith("Switched to one. Could not open Antigravity.");
  } finally {
    warning.mockRestore();
  }
});

it("retains the active account and enables retry after a switch fails", async () => {
  list.mockResolvedValue([account("one"), { ...account("two"), active: true }]);
  activate.mockRejectedValue(new Error("Keychain denied"));
  const changed = vi.fn();
  render(<AntigravityAccounts workspace={{ ...workspace, antigravityAccountIds: ["one", "two"] }} refreshKey={0} onChanged={changed} />);
  fireEvent.click(await screen.findByRole("button", { name: "Switch to one" }));
  expect(await findErrorToast("Keychain denied")).toHaveTextContent("Keychain denied");
  expect(changed).not.toHaveBeenCalled();
  expect(within(screen.getByRole("article", { name: "two Antigravity account" })).getByText("Active")).toBeVisible();
  expect(screen.getByRole("button", { name: "Switch to one" })).toBeEnabled();
});

it("uses a private card title for accounts whose saved name is an email", async () => {
  list.mockResolvedValue([
    { ...account("one"), name: "ONE@example.com", displayName: "Jane Doe" },
    { ...account("two"), name: "two@example.com" },
    { ...account("three"), name: "Studio", displayName: "Google Name" },
  ]);
  render(<AntigravityAccounts workspace={{ ...workspace, antigravityAccountIds: ["one", "two", "three"] }} refreshKey={0} onChanged={vi.fn()} />);
  expect(await screen.findByRole("article", { name: "Jane Doe Antigravity account" })).toBeVisible();
  expect(screen.getByRole("article", { name: "Antigravity account" })).toBeVisible();
  expect(screen.getByRole("article", { name: "Studio Antigravity account" })).toBeVisible();
  expect(screen.getByRole("button", { name: "More options for Jane Doe" })).toBeVisible();
  expect(screen.queryByText(/@example\.com/i)).not.toBeInTheDocument();
});


it("shows available Gemini models and keeps partner limits off the card", async () => {
  list.mockResolvedValue([account("one")]);
  usage.mockResolvedValue({
    provider: "antigravity",
    models: ["Gemini 3.8 Flash (High)", "Gemini 9 Preview", "Gemini 4 Argon", "Gemini 4 Carbon", "Gemini 3.8 Flash (Low)", "chat_23310", "tab_flash_lite_preview", "gemini-3.8-flash-tiered"],
    windows: [
      { window: "Gemini Models · 5-hour", percent: 4 },
      { window: "Gemini Models · Weekly", percent: 5 },
      { window: "Claude & GPT (shared) · Weekly", percent: 10 },
      { window: "Gemini 9 Preview · 5-hour", percent: 20 },
      { window: "Gemini 9 Preview · Weekly", percent: 50 },
      { window: "Gemini 4 Argon · Weekly", percent: 16 },
      { window: "Gemini 4 Carbon · Weekly", percent: 8 },
    ],
  });
  render(<AntigravityAccounts workspace={workspace} refreshKey={0} onChanged={vi.fn()} />);
  const featured = await screen.findByRole("group", { name: "Featured Gemini models" });
  expect(usage).toHaveBeenCalledWith("one", true);
  expect(within(featured).getByText("Carbon · Weekly")).toBeVisible();
  expect(within(featured).getByText("Argon · Weekly")).toBeVisible();
  expect(within(featured).queryByRole("heading")).not.toBeInTheDocument();
  expect(within(featured).queryByText(/Gemini 4/)).not.toBeInTheDocument();
  expect(within(featured).getAllByRole("meter").map(meter => meter.getAttribute("aria-valuenow"))).toEqual(["92", "84"]);
  expect(screen.getAllByRole("meter")).toHaveLength(2);
  const toggle = screen.getByRole("button", { name: /Additional limits/ });
  expect(toggle).toHaveAttribute("aria-expanded", "false");
  fireEvent.click(toggle);
  expect(toggle).toHaveAttribute("aria-expanded", "true");
  expect(screen.queryByText("Gemini 9 Preview, Gemini 3.8 Flash")).not.toBeInTheDocument();
  const extra = screen.getByRole("group", { name: "Usage for one additional limits" });
  expect(within(extra).getByRole("meter", { name: "Gemini · Weekly remaining" })).toHaveAttribute("aria-valuenow", "95");
  expect(within(extra).queryByRole("meter", { name: /Carbon|Argon/ })).not.toBeInTheDocument();
  expect(within(extra).getByRole("meter", { name: "Gemini 9 Preview · Weekly remaining" })).toHaveAttribute("aria-valuenow", "50");
  expect(within(extra).getByRole("meter", { name: "Gemini 9 Preview · 5-hour remaining" })).toHaveAttribute("aria-valuenow", "80");
  expect(screen.queryByText(/chat_23310|tab_flash_lite_preview|flash-tiered/)).not.toBeInTheDocument();
  expect(screen.queryByText(/Claude|GPT/)).not.toBeInTheDocument();
});


it("shows one featured model when the account only reports Argon", async () => {
  list.mockResolvedValue([account("one")]);
  usage.mockResolvedValue({
    provider: "antigravity",
    models: ["Gemini 4 Argon", "Gemini 4 Hydrogen"],
    windows: [{ window: "Gemini 4 Argon · Weekly", percent: 14 }],
  });
  render(<AntigravityAccounts workspace={workspace} refreshKey={0} onChanged={vi.fn()} />);
  const featured = await screen.findByRole("group", { name: "Featured Gemini models" });
  expect(within(featured).getByText("Argon · Weekly")).toBeVisible();
  expect(within(featured).getByRole("meter", { name: "Argon · Weekly remaining" })).toHaveAttribute("aria-valuenow", "86");
  expect(screen.queryByRole("button", { name: "Additional limits" })).not.toBeInTheDocument();
});


it("shows the remaining limits directly when neither Carbon nor Argon is available", async () => {
  list.mockResolvedValue([account("one")]);
  usage.mockResolvedValue({
    provider: "antigravity",
    windows: [
      { window: "Gemini Models · 5-hour", percent: 12 },
      { window: "Gemini Models · Weekly", percent: 34 },
    ],
  });
  render(<AntigravityAccounts workspace={workspace} refreshKey={0} onChanged={vi.fn()} />);
  const preview = await screen.findByRole("group", { name: "Usage for one" });
  expect(within(preview).getAllByRole("meter").map(meter => meter.getAttribute("aria-valuenow"))).toEqual(["88", "66"]);
  expect(screen.queryByRole("button", { name: /Additional limits/ })).not.toBeInTheDocument();
  expect(screen.queryByRole("group", { name: "Featured Gemini models" })).not.toBeInTheDocument();
});
