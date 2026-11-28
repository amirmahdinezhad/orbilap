import { useEffect, useId, useRef, useState } from "react";
import { listen } from "@tauri-apps/api/event";
import { setPanelShortcutRecording, prettyError } from "../api";
import type { PanelShortcutPreferences } from "../types";
import { shortcutFromEvent, shortcutLabel } from "../panelShortcut";
import { Button } from "./ui/button";
import { Switch } from "./ui/switch";
import { AppModal } from "./AppModal";

export function PanelShortcutSettings({ preferences, active, disabled, registrationError, onSave, onEditingChange }: {
  preferences: PanelShortcutPreferences; active: boolean; disabled: boolean; registrationError?: string | null;
  onSave: (preferences: PanelShortcutPreferences) => Promise<boolean>;
  onEditingChange: (editing: boolean) => void;
}) {
  const id = useId();
  const [editing, setEditing] = useState(false);
  const [ready, setReady] = useState(false);
  const [draft, setDraft] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const recorder = useRef<HTMLButtonElement>(null);
  const trigger = useRef<HTMLButtonElement>(null);
  const busy = useRef(disabled);
  busy.current = disabled;
  const toggleEditing = (next: boolean) => {
    setEditing(next);
    if (!next) {
      setError(null);
    }
    onEditingChange(next);
  };

  useEffect(() => {
    if (!active || !editing) return;
    let disposed = false;
    let unlisten: (() => void) | undefined;
    setReady(false);
    // Listen first: the existing registered combination is delivered natively during capture.
    void listen<string>("panel-shortcut-recorded", event => {
      if (!disposed) { setDraft(event.payload); setError(null); }
    }).then(async stop => {
      if (disposed) { stop(); return; }
      unlisten = stop;
      await setPanelShortcutRecording(true);
      if (disposed) { await setPanelShortcutRecording(false); return; }
      setReady(true);
    }).catch(e => { if (!disposed) { setError(prettyError(e)); setEditing(false); onEditingChange(false); } });
    const cancel = () => { if (busy.current) return; setEditing(false); setError(null); onEditingChange(false); };
    const capture = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        // A nested discard confirmation owns Escape until the owner returns to the recorder.
        if (document.querySelector('[role="alertdialog"]')) return;
        event.preventDefault(); event.stopImmediatePropagation(); cancel(); return;
      }
      if (busy.current) return;
      if (event.key === "Tab" || event.repeat || event.isComposing || /^(Meta|Control|Alt|Shift|Dead|Process)$/.test(event.key)) return;
      // Allow Enter/Space to activate the paired actions after tabbing out of the recorder.
      if (event.target !== recorder.current) return;
      event.preventDefault(); event.stopImmediatePropagation();
      const next = shortcutFromEvent(event);
      if (next) { setDraft(next); setError(null); }
      else setError("Hold Command, Control or Option, then press another key.");
    };
    window.addEventListener("keydown", capture, true);
    window.addEventListener("blur", cancel);
    return () => {
      disposed = true; unlisten?.();
      void setPanelShortcutRecording(false).catch(() => {});
      window.removeEventListener("keydown", capture, true); window.removeEventListener("blur", cancel);
    };
  }, [active, editing, onEditingChange]);

  useEffect(() => {
    if (active && editing && ready && !disabled) recorder.current?.focus({ preventScroll: true });
  }, [active, editing, ready, disabled]);

  useEffect(() => {
    if (!active) { setEditing(false); setError(null); onEditingChange(false); }
  }, [active, onEditingChange]);

  const save = async (next: PanelShortcutPreferences) => {
    setError(null);
    if (await onSave(next)) toggleEditing(false);
    else setError("Couldn’t apply the shortcut. Your previous setting is unchanged.");
  };
  return <section className="settings-section settings-choice" aria-labelledby={`${id}-title`}>
    <div className="settings-choice-heading">
      <h3 id={`${id}-title`}>Keyboard shortcut</h3>
    </div>
    <div className="settings-group">
      <div className="setting-row">
        <span className="setting-name" id={`${id}-enabled`}>Enable shortcut</span>
        <Switch aria-labelledby={`${id}-enabled`} checked={preferences.enabled} disabled={disabled || editing}
          onCheckedChange={enabled => void save({ ...preferences, enabled })} />
      </div>
      <div className="setting-row">
        <span className="setting-name">Key combination</span>
        <Button ref={trigger} variant="secondary" disabled={disabled || editing || !preferences.enabled} aria-label={`Change shortcut · ${shortcutLabel(preferences.accelerator)}`}
          aria-haspopup="dialog" onClick={() => { setDraft(preferences.accelerator); setReady(false); setError(null); toggleEditing(true); }}>
          {shortcutLabel(preferences.accelerator)}
        </Button>
      </div>
    </div>
    <AppModal open={active && editing} title="Key combination" cardClass="workspace-action-popup"
      busy={disabled} onClose={() => toggleEditing(false)} returnFocusRef={trigger} initialFocusRef={recorder}
      descriptionId={`${id}-capture-help`}>
      <div className="workspace-form">
        <Button ref={recorder} variant="secondary" disabled={disabled || !ready} aria-label="Record keyboard shortcut"
          aria-describedby={`${id}-capture-help`}>
          {shortcutLabel(draft ?? preferences.accelerator)}
        </Button>
        <div className="action-row">
          <Button variant="secondary" disabled={disabled} onClick={() => toggleEditing(false)}>Cancel</Button>
          <Button variant="default" disabled={disabled || !ready || !draft || draft === preferences.accelerator} onClick={() => draft && void save({ ...preferences, accelerator: draft })}>Save shortcut</Button>
        </div>
        <p className="setting-note" id={`${id}-capture-help`} aria-live="polite">
          Hold Command, Control or Option and press a key. Escape cancels.
        </p>
        {error || registrationError ? <p className="setting-note error" role="alert">{error || registrationError}</p> : null}
      </div>
    </AppModal>
    {!editing && (error || registrationError) ? <p className="setting-note error" role="alert">{error || registrationError}</p> : null}
  </section>;
}
