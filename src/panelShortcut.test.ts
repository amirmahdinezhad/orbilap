import { describe, expect, it } from "vitest";
import { canDismissPanel, shortcutFromEvent, shortcutLabel } from "./panelShortcut";

describe("panel shortcut", () => {
  const key = { code: "KeyO", metaKey: true, ctrlKey: false, altKey: false, shiftKey: true };
  it("records physical keys independently of the typing layout", () => {
    expect(shortcutFromEvent(key)).toBe("shift+super+KeyO");
    expect(shortcutFromEvent({ ...key, metaKey: false, ctrlKey: true, code: "Digit1" })).toBe("shift+control+Digit1");
    expect(shortcutLabel("shift+control+alt+super+KeyO")).toBe("⇧ ⌃ ⌥ ⌘ O");
  });
  it("rejects unmodified typing, shift-only, escape, tab and unsupported keys", () => {
    expect(shortcutFromEvent({ ...key, metaKey: false })).toBeNull();
    for (const code of ["Tab", "Escape", "MetaLeft", "IntlBackslash", "Unidentified"]) {
      expect(shortcutFromEvent({ ...key, code })).toBeNull();
    }
  });
  it("never dismisses a dialog or busy panel", () => {
    expect(canDismissPanel(false)).toBe(true);
    expect(canDismissPanel(true)).toBe(false);
    const dialog = document.createElement("div");
    document.body.append(dialog);
    try {
      for (const role of ["dialog", "alertdialog"]) {
        dialog.setAttribute("role", role);
        expect(canDismissPanel(false)).toBe(false);
      }
    } finally { dialog.remove(); }
  });
});
