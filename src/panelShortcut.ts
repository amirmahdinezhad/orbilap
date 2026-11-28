/** Physical keys keep a shortcut stable across English/Persian keyboard layouts. */
export function shortcutFromEvent(event: Pick<KeyboardEvent, "code" | "metaKey" | "ctrlKey" | "altKey" | "shiftKey">): string | null {
  if (!(event.metaKey || event.ctrlKey || event.altKey)) return null;
  if (!/^(Key[A-Z]|Digit[0-9]|F([1-9]|1[0-9]|2[0-4])|Space|Enter|Backspace|Delete|Arrow(Up|Down|Left|Right)|Home|End|PageUp|PageDown|Minus|Equal|BracketLeft|BracketRight|Backslash|Semicolon|Quote|Comma|Period|Slash|Backquote)$/.test(event.code)) return null;
  return [event.shiftKey && "shift", event.ctrlKey && "control", event.altKey && "alt", event.metaKey && "super", event.code].filter(Boolean).join("+");
}

const KEY_LABELS: Record<string, string> = {
  Space: "Space", Enter: "↩", Backspace: "⌫", Delete: "⌦", ArrowUp: "↑", ArrowDown: "↓", ArrowLeft: "←", ArrowRight: "→",
  Minus: "−", Equal: "=", BracketLeft: "[", BracketRight: "]", Backslash: "\\", Semicolon: ";", Quote: "'", Comma: ",", Period: ".", Slash: "/", Backquote: "`",
};
export function shortcutLabel(accelerator: string): string {
  return accelerator.split("+").map(part => ({ super: "⌘", command: "⌘", control: "⌃", alt: "⌥", shift: "⇧" }[part.toLowerCase()]
    ?? KEY_LABELS[part] ?? part.replace(/^(Key|Digit)/, ""))).join(" ");
}

/** Dialogs retain their current form and busy guards when the global shortcut is pressed. */
export function canDismissPanel(busy: boolean, root: Pick<Document, "querySelector"> = document): boolean {
  return !busy && !root.querySelector('[role="dialog"], [role="alertdialog"]');
}
