import { act, cleanup, render, screen } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { SettingsReveal } from "./settings-reveal";
import { RadioGroup, RadioGroupItem } from "./radio-group";

afterEach(() => { cleanup(); vi.useRealTimers(); delete document.documentElement.dataset.keyboard; });
it("retains outgoing content through collapse and cancels removal on reversal", () => {
  vi.useFakeTimers();
  const child = <input aria-label="Choice" defaultValue="Saved draft" />;
  const view = render(<SettingsReveal open>{child}</SettingsReveal>);
  const input = screen.getByRole("textbox");
  view.rerender(<SettingsReveal open={false}>{null}</SettingsReveal>);
  expect(input).toBeInTheDocument();
  expect(input.closest(".settings-reveal")).toHaveAttribute("inert");
  act(() => { vi.advanceTimersByTime(100); });
  view.rerender(<SettingsReveal open>{child}</SettingsReveal>);
  act(() => { vi.advanceTimersByTime(250); });
  expect(screen.getByRole("textbox")).toBe(input);
  expect(input).toHaveValue("Saved draft");
  view.rerender(<SettingsReveal open={false}>{null}</SettingsReveal>);
  act(() => { vi.advanceTimersByTime(200); });
  expect(input).not.toBeInTheDocument();
});
it("removes closed keyboard content immediately and retains radio dots for reversible fading", () => {
  document.documentElement.dataset.keyboard = "true";
  const view = render(<SettingsReveal open><input aria-label="Choice" /></SettingsReveal>);
  view.rerender(<SettingsReveal open={false}>{null}</SettingsReveal>);
  expect(screen.queryByLabelText("Choice")).not.toBeInTheDocument();
  view.rerender(<RadioGroup value="a"><RadioGroupItem value="a" aria-label="A" /><RadioGroupItem value="b" aria-label="B" /></RadioGroup>);
  const dot = screen.getByRole("radio", { name: "B" }).querySelector(".ui-radio-indicator");
  expect(dot).toHaveAttribute("data-state", "unchecked");
  view.rerender(<RadioGroup value="b"><RadioGroupItem value="a" aria-label="A" /><RadioGroupItem value="b" aria-label="B" /></RadioGroup>);
  expect(screen.getByRole("radio", { name: "B" }).querySelector(".ui-radio-indicator")).toBe(dot);
  expect(dot).toHaveAttribute("data-state", "checked");
});
