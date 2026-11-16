import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, expect, it, vi } from "vitest";
import { Select } from "./select";

afterEach(cleanup);

const options = [{ value: "codex", label: "Codex" }, { value: "claude", label: "Claude" }];

it("switches pointer feedback to keyboard focus without changing the selection", async () => {
  const user = userEvent.setup();
  const save = vi.fn();
  render(<Select aria-label="Source" defaultValue="codex" options={options} onValueChange={save} />);
  const trigger = screen.getByRole("combobox", { name: "Source" });
  await user.click(trigger);
  const menu = screen.getByRole("listbox");
  expect(menu).toHaveAttribute("data-input", "pointer");
  expect(screen.getByRole("option", { name: "Codex" })).toHaveAttribute("aria-selected", "true");
  await user.keyboard("{ArrowDown}");
  expect(menu).toHaveAttribute("data-input", "keyboard");
  expect(save).not.toHaveBeenCalled();
  fireEvent.pointerMove(screen.getByRole("option", { name: "Codex" }), { pointerType: "mouse" });
  expect(menu).toHaveAttribute("data-input", "pointer");
  await user.keyboard("{Escape}");
  await waitFor(() => expect(trigger).toHaveFocus());
});

it("opens with immediate keyboard feedback and preserves arrow selection", async () => {
  const user = userEvent.setup();
  const save = vi.fn();
  render(<Select aria-label="Source" defaultValue="codex" options={options} onValueChange={save} />);
  await user.tab();
  await user.keyboard("{Enter}");
  expect(screen.getByRole("listbox")).toHaveAttribute("data-input", "keyboard");
  await user.keyboard("{ArrowDown}{Enter}");
  expect(save).toHaveBeenCalledWith("claude");
});

it("restores a gentle pointer hover after closing with the keyboard", async () => {
  const user = userEvent.setup();
  const save = vi.fn();
  render(<Select aria-label="Source" defaultValue="codex" options={options} onValueChange={save} />);
  const trigger = screen.getByRole("combobox", { name: "Source" });
  await user.tab();
  await user.keyboard("{Enter}{Escape}");
  await waitFor(() => expect(trigger).toHaveFocus());
  expect(trigger).toHaveAttribute("data-input", "keyboard");
  await user.hover(trigger);
  expect(trigger).toHaveAttribute("data-input", "pointer");
  expect(trigger).toHaveAttribute("aria-expanded", "false");
  expect(save).not.toHaveBeenCalled();
});

it("keeps the smooth menu through its exit and cancels an interrupted exit", async () => {
  const cancel = vi.fn();
  const animate = vi.fn(() => ({ cancel, finished: new Promise<void>(() => {}) }));
  Object.defineProperty(HTMLElement.prototype, "animate", { value: animate, configurable: true });
  const view = render(<Select aria-label="Sort" options={options} value="codex" open smoothMotion />);
  await waitFor(() => expect(animate).toHaveBeenCalled());
  view.rerender(<Select aria-label="Sort" options={options} value="codex" open={false} smoothMotion />);
  expect(document.querySelector('.ui-select-content')).toHaveAttribute("aria-hidden", "true");
  expect(document.querySelector('.ui-select-content')).toHaveStyle({pointerEvents:"none"});
  const cancelledOnClose = cancel.mock.calls.length;
  view.rerender(<Select aria-label="Sort" options={options} value="codex" open smoothMotion />);
  expect(cancel.mock.calls.length).toBeGreaterThan(cancelledOnClose);
  expect(screen.getByRole("listbox")).toBeVisible();
  view.unmount();
  delete (HTMLElement.prototype as Partial<HTMLElement>).animate;
});
