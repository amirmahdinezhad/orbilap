import { act, cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { PanelShortcutSettings } from "./PanelShortcutSettings";
import { DEFAULT_PANEL_SHORTCUT } from "../types";

const bridge = vi.hoisted(() => ({ capture: vi.fn(), listen: vi.fn(), stop: vi.fn(), received: null as null | ((event: { payload: string }) => void) }));
vi.mock("../api", () => ({ setPanelShortcutRecording: bridge.capture, prettyError: String }));
vi.mock("@tauri-apps/api/event", () => ({ listen: bridge.listen }));
beforeEach(() => {
  vi.clearAllMocks(); bridge.capture.mockResolvedValue(undefined);
  bridge.listen.mockImplementation(async (_: string, callback: typeof bridge.received) => { bridge.received = callback; return bridge.stop; });
});
afterEach(cleanup);
function setup(save = vi.fn().mockResolvedValue(true)) {
  const changed = vi.fn();
  const props = { preferences: { ...DEFAULT_PANEL_SHORTCUT, enabled: true }, active: true, disabled: false, onSave: save, onEditingChange: changed };
  return { ...render(<PanelShortcutSettings {...props} />), save, changed, props, user: userEvent.setup() };
}
async function record(user: ReturnType<typeof userEvent.setup>) {
  await user.click(screen.getByRole("button", { name: /Change shortcut/ }));
  await waitFor(() => expect(bridge.capture).toHaveBeenCalledWith(true));
  const button = screen.getByRole("button", { name: "Record keyboard shortcut" });
  await waitFor(() => expect(button).toBeEnabled());
  return button;
}
it("toggles registration without discarding the saved combination", async () => {
  const { user, save } = setup();
  await user.click(screen.getByRole("switch", { name: "Enable shortcut" }));
  expect(save).toHaveBeenCalledWith({ ...DEFAULT_PANEL_SHORTCUT, enabled: false });
});
it("records, saves and resumes the global shortcut; capture itself never changes preferences", async () => {
  const { user, save } = setup(); const button = await record(user);
  fireEvent.keyDown(button, { key: "ح", code: "KeyP", ctrlKey: true, altKey: true });
  expect(save).not.toHaveBeenCalled();
  expect(screen.getByRole("button", { name: "Record keyboard shortcut" })).toHaveTextContent("⌃ ⌥ P");
  await user.click(screen.getByRole("button", { name: "Save shortcut" }));
  expect(save).toHaveBeenCalledWith({ enabled: true, accelerator: "control+alt+KeyP" });
  await waitFor(() => expect(bridge.capture).toHaveBeenLastCalledWith(false));
});
it("cancels capture with Escape, keeps plain typing invalid and permits Tab to the paired actions", async () => {
  const { user, save } = setup(); const button = await record(user);
  fireEvent.keyDown(button, { key: "x", code: "KeyX" });
  expect(screen.getByRole("alert")).toHaveTextContent("Hold Command");
  expect(screen.getByRole("button", { name: "Save shortcut" })).toBeDisabled();
  button.focus(); await user.tab();
  expect(screen.getByRole("button", { name: "Cancel" })).toHaveFocus();
  await user.keyboard("{Escape}");
  expect(screen.queryByRole("button", { name: "Cancel" })).not.toBeInTheDocument();
  expect(save).not.toHaveBeenCalled();
});
it("captures the already-registered key through the native event instead of hiding the panel", async () => {
  const { user } = setup(); await record(user);
  act(() => bridge.received?.({ payload: "control+KeyK" }));
  expect(screen.getByRole("button", { name: "Save shortcut" })).toBeEnabled();
});
it("contains recording and paired actions in a popup and restores focus after cancellation", async () => {
  const { user, save } = setup();
  const trigger = screen.getByRole("button", { name: /Change shortcut/ });
  await record(user);
  const popup = screen.getByRole("dialog", { name: "Key combination" });
  expect(within(popup).getByRole("button", { name: "Record keyboard shortcut" })).toHaveFocus();
  expect(within(popup).getByRole("button", { name: "Cancel" }).parentElement)
    .toBe(within(popup).getByRole("button", { name: "Save shortcut" }).parentElement);
  await user.click(within(popup).getByRole("button", { name: "Cancel" }));
  await waitFor(() => expect(trigger).toHaveFocus());
  expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  expect(save).not.toHaveBeenCalled();
});
it("locks dismissal and recording while saving", async () => {
  const { user, props, rerender } = setup();
  const button = await record(user);
  fireEvent.keyDown(button, { key: "p", code: "KeyP", metaKey: true });
  rerender(<PanelShortcutSettings {...props} disabled />);
  fireEvent.keyDown(button, { key: "Escape" });
  fireEvent(window, new Event("blur"));
  expect(screen.getByRole("dialog", { name: "Key combination" })).toBeInTheDocument();
  expect(screen.getByRole("button", { name: "Cancel" })).toBeDisabled();
});
it("retains the editor on conflict and reports an unavailable startup shortcut", async () => {
  const { user, rerender, props } = setup(vi.fn().mockResolvedValue(false));
  const button = await record(user);
  fireEvent.keyDown(button, { key: "p", code: "KeyP", metaKey: true });
  await user.click(screen.getByRole("button", { name: "Save shortcut" }));
  expect(screen.getByRole("alert")).toHaveTextContent("previous setting is unchanged");
  expect(screen.getByRole("button", { name: "Record keyboard shortcut" })).toBeInTheDocument();
  await user.click(screen.getByRole("button", { name: "Cancel" }));
  rerender(<PanelShortcutSettings {...props} registrationError="This shortcut is unavailable." />);
  expect(screen.getByRole("alert")).toHaveTextContent("unavailable");
});
it("stops capture when losing focus or leaving General and ignores repeated keys", async () => {
  const { user, unmount, save } = setup(); const button = await record(user);
  fireEvent.keyDown(button, { key: "p", code: "KeyP", metaKey: true, repeat: true });
  expect(screen.getByRole("button", { name: "Save shortcut" })).toBeDisabled();
  fireEvent(window, new Event("blur"));
  expect(screen.queryByRole("button", { name: "Cancel" })).not.toBeInTheDocument();
  await record(user); unmount();
  expect(bridge.capture).toHaveBeenLastCalledWith(false);
  expect(save).not.toHaveBeenCalled();
});

it("disables the combination while the shortcut is off", async () => {
  const { user, props, rerender } = setup();
  rerender(<PanelShortcutSettings {...props} preferences={DEFAULT_PANEL_SHORTCUT} />);
  const trigger = screen.getByRole("button", { name: /Change shortcut/ });
  expect(trigger).toBeDisabled();
  await user.click(trigger);
  expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  expect(bridge.capture).not.toHaveBeenCalled();
});
it("shows the saved combination on opening and waits for a change before saving", async () => {
  const { user } = setup();
  const recorder = await record(user);
  expect(recorder).toHaveTextContent("⌘ ⇧ O");
  expect(screen.getByRole("button", { name: "Save shortcut" })).toBeDisabled();
  expect(screen.getByRole("dialog")).toHaveAttribute("data-input", "pointer");
});
