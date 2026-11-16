import { Tooltip } from "./ui/tooltip";
import { ErrorToast } from "./Toast";
import { useId, useEffect, useLayoutEffect, useRef, useState, type KeyboardEvent, type ReactNode } from "react";
import * as Dialog from "@radix-ui/react-dialog";
import type { Workspace } from "../types";
import { AddIcon, CheckIcon, CloseIcon, DownIcon, EditIcon, SaveIcon, SpinnerIcon, TrashIcon } from "../icons";
import { prettyError } from "../api";
import { AppModal } from "./AppModal";
import { Button } from "./ui/button";
import { useWorkspacePickerMotion } from "../useWorkspacePickerMotion";

function WorkspaceMark({ workspace }: { workspace: Workspace }) {
  const initials = workspace.name.trim().split(/\s+/).slice(0, 2).map(word => Array.from(word)[0]).join("").toUpperCase();
  return <span className="workspace-mark" aria-hidden="true">{initials || "W"}</span>;
}

/** A keyboard-operated workspace picker with contextual workspace actions. */
export function WorkspaceSwitcher({ workspace, workspaces, busy, status, onSelect, onCreate, onRename, onDelete }: {
  workspace: Workspace; workspaces: Workspace[]; busy: boolean; status: ReactNode;
  onSelect: (id: string) => void; onCreate: (origin?: HTMLElement) => void;
  onRename?: (name: string) => Promise<void>;
  onDelete?: (id: string) => Promise<void>;
}) {
  const { open, motion, closing, setInput, changeOpen, contentRef, overlayRef } = useWorkspacePickerMotion();
  const nameId = useId();
  const deleteDescription = useId();
  const keep = useRef<HTMLButtonElement>(null);
  const confirm = useRef<HTMLButtonElement>(null);
  const [deleteTarget, setDeleteTarget] = useState<Workspace | null>(null);
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const pendingAction = useRef<"create" | Workspace | null>(null);
  const trigger = useRef<HTMLButtonElement>(null);
  const buttons = useRef<(HTMLButtonElement | null)[]>([]);
  const renameInput = useRef<HTMLInputElement>(null);
  const renameButton = useRef<HTMLButtonElement>(null);
  const wasEditing = useRef(false);
  const savingRef = useRef(false);
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(workspace.name);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [instantRename, setInstantRename] = useState(true);
  const latestWorkspaceId = useRef(workspace.id);
  latestWorkspaceId.current = workspace.id;
  useEffect(() => { setEditing(false); setDraft(workspace.name); setError(null); }, [workspace.id]);
  useLayoutEffect(() => {
    if (!open) return;
    if (editing) { renameInput.current?.focus(); renameInput.current?.select(); }
    else if (wasEditing.current) renameButton.current?.focus();
    wasEditing.current = editing;
  }, [editing, open]);
  const requestOpen = (next: boolean) => {
    if (savingRef.current) return;
    if (next) { wasEditing.current = false; setEditing(false); setDraft(workspace.name); setError(null); }
    changeOpen(next);
  };
  const cancelRename = () => { setInstantRename(true); setEditing(false); setError(null); setDraft(workspace.name); };
  const saveRename = async () => {
    if (!onRename || !editing || savingRef.current || busy || closing || !draft.trim()) return;
    if (draft.trim() === workspace.name) { setEditing(false); setError(null); return; }
    const workspaceId = workspace.id;
    savingRef.current = true; setSaving(true); setError(null);
    try {
      await onRename(draft.trim());
      if (latestWorkspaceId.current === workspaceId) setEditing(false);
    } catch (e) {
      if (latestWorkspaceId.current === workspaceId) setError(prettyError(e));
    } finally {
      savingRef.current = false; setSaving(false);
    }
  };
  const confirmDelete = async () => {
    if (!onDelete || !deleteTarget || savingRef.current || busy) return;
    savingRef.current = true; setSaving(true); setDeleteError(null);
    try {
      await onDelete(deleteTarget.id);
      setDeleteTarget(null);
    } catch (e) { setDeleteError(prettyError(e)); }
    finally { savingRef.current = false; setSaving(false); }
  };
  const current = workspaces.filter(item => item.id === workspace.id);
  const others = workspaces.filter(item => item.id !== workspace.id);
  const ordered = [...current, ...others];
  const choose = (id: string) => {
    if (busy || savingRef.current || closing) return;
    requestOpen(false);
    if (id !== workspace.id) onSelect(id);
  };
  const navigate = (event: KeyboardEvent, item: Workspace) => {
    const index = ordered.findIndex(value => value.id === item.id);
    const target = event.key === "ArrowDown" ? (index + 1) % ordered.length
      : event.key === "ArrowUp" ? (index - 1 + ordered.length) % ordered.length
      : event.key === "Home" ? 0 : event.key === "End" ? ordered.length - 1 : null;
    if (target === null || !ordered.length) return;
    event.preventDefault(); buttons.current[target]?.focus();
  };
  const option = (item: Workspace) => {
    const index = ordered.findIndex(value => value.id === item.id);
    const selected = item.id === workspace.id;
    return <button key={item.id} ref={node => { buttons.current[index] = node; }} type="button" role={selected ? "option" : undefined} aria-selected={selected || undefined} disabled={busy || saving}
      className="workspace-choice" onClick={() => choose(item.id)} onKeyDown={selected ? event => navigate(event, item) : undefined}>
      {item.id !== workspace.id ? <WorkspaceMark workspace={item} /> : null}<Tooltip content={item.name}><span dir="auto">{item.name}</span></Tooltip>
      {item.id === workspace.id ? <CheckIcon size={16} /> : null}
    </button>;
  };
  const deleteButton = (item: Workspace, label: string) => onDelete ? (
    <Button size="icon-sm" variant="secondary" className="workspace-manage-trigger" aria-label={label} title={label}
      disabled={busy || saving || closing} onClick={() => { setDeleteError(null); pendingAction.current = item; requestOpen(false); }}><TrashIcon size={16} /></Button>
  ) : null;
  return <><Dialog.Root open={open} onOpenChange={requestOpen}>
    <Dialog.Trigger asChild><button ref={trigger} type="button" role="combobox" aria-label="Workspace" aria-describedby={nameId} disabled={busy} className="workspace-picker" data-motion={motion} data-closing={closing || undefined}
      onPointerDown={() => setInput("pointer")} onKeyDown={() => setInput("instant")} onClick={event => { if (event.detail === 0) setInput("instant"); }}>
      <WorkspaceMark workspace={workspace} /><span className="workspace-picker-copy"><span className="brand-caption">Workspace</span><span className="workspace-picker-name"><strong id={nameId} dir="auto">{workspace.name}</strong><DownIcon className="workspace-picker-chevron" size={16} /></span>{status ? <span className="workspace-picker-status">{status}</span> : null}</span>
    </button></Dialog.Trigger>
    <Dialog.Portal><Dialog.Overlay ref={overlayRef} className="workspace-picker-overlay" data-motion={motion} onPointerDownCapture={() => setInput("pointer")} /><Dialog.Content ref={contentRef} className="workspace-picker-panel" data-motion={motion} data-closing={closing || undefined} aria-describedby={undefined}
      onKeyDownCapture={event => {
        if (deleteTarget) return;
        setInstantRename(true);
        if (event.key !== "Escape") { setInput("instant"); return; }
        // Handle Escape even when the action's tooltip is the top Radix layer.
        event.preventDefault(); event.stopPropagation();
        if (savingRef.current || event.nativeEvent.isComposing) return;
        if (editing && !closing) cancelRename(); else requestOpen(false);
      }} onPointerDownCapture={() => { setInstantRename(false); setInput("pointer"); }}
      onEscapeKeyDown={event => { if (savingRef.current || editing && !closing) event.preventDefault(); }}
      onOpenAutoFocus={event => { event.preventDefault(); buttons.current[0]?.focus(); }} onCloseAutoFocus={event => { if (pendingAction.current) { event.preventDefault(); const action = pendingAction.current; pendingAction.current = null; trigger.current?.focus(); if (action === "create") onCreate(trigger.current ?? undefined); else setDeleteTarget(action); } }}>
      <div className="workspace-picker-head"><Dialog.Title>Workspaces</Dialog.Title><Dialog.Close asChild><Button size="icon-sm" variant="ghost" className="popup-close" disabled={saving} aria-label="Close workspace picker"><CloseIcon size={17} /></Button></Dialog.Close></div>
      <div className="workspace-choices">
        {current.length ? <><p className="workspace-choice-label">Current workspace</p>
          <form className="workspace-current-card" data-editing={editing} data-rename-motion={instantRename ? "instant" : "pointer"} onSubmit={event => { event.preventDefault(); void saveRename(); }}>
            <WorkspaceMark workspace={workspace} />
            <div className="workspace-current-name">
              <div role="listbox" aria-label="Current workspace" aria-hidden={editing} inert={editing}>{current.map(option)}</div>
              <input ref={renameInput} className="workspace-rename-input" aria-label="Workspace name" value={draft} required maxLength={64} dir="auto"
                aria-hidden={!editing} inert={!editing} disabled={busy} readOnly={saving} aria-invalid={!!error}
                onChange={event => { setDraft(event.target.value); setError(null); }} onKeyDown={event => { if (event.key === "Enter" && event.nativeEvent.isComposing) event.preventDefault(); }} />
            </div>
            {!editing && (onRename || onDelete) ? <div className="workspace-current-actions">
              {onRename ? (
                <Button ref={renameButton} size="icon-sm" variant="secondary" className="workspace-manage-trigger"
                  aria-label="Rename" title="Rename"
                  disabled={busy || saving || closing}
                  onClick={event => {
                    setInstantRename(event.detail === 0);
                    setDraft(workspace.name);
                    setError(null);
                    setEditing(true);
                  }}>
                  <EditIcon size={16} />
                </Button>
              ) : null}
              {deleteButton(workspace, "Delete workspace")}
            </div> : null}
            {editing ? (
              <div className="workspace-rename-actions action-row">
                <Button size="sm" variant="secondary" disabled={saving || closing} onClick={cancelRename}>Cancel</Button>
                <Button type="submit" size="sm" variant="default" aria-label="Save workspace name" aria-busy={saving}
                  disabled={busy || saving || closing || !draft.trim()}>
                  {saving ? <SpinnerIcon size={14} /> : <SaveIcon size={16} />}{saving ? "Saving…" : "Save"}
                </Button>
              </div>
            ) : null}
          </form>
          {error ? <ErrorToast message={error} /> : null}
        </> : null}
        {others.length ? <><p className="workspace-choice-label">Other workspaces</p><div role="group" aria-label="Other workspaces">
          {others.map(item => <div key={item.id} className="workspace-other-card" onKeyDown={event => {
            if (event.key === "ArrowRight" || event.key === "ArrowLeft") {
              event.preventDefault();
              event.currentTarget.querySelector<HTMLButtonElement>(event.key === "ArrowRight" ? ".workspace-manage-trigger" : ".workspace-choice")?.focus();
            } else navigate(event, item);
          }}>
            {option(item)}
            {deleteButton(item, `Delete workspace: ${item.name}`)}
          </div>)}
        </div></> : null}
      </div>
      <div className="workspace-create-section"><Button variant="ghost" className="workspace-create" disabled={busy || saving || closing} onClick={() => { pendingAction.current = "create"; requestOpen(false); }}><AddIcon size={18} />New workspace</Button></div>
    </Dialog.Content></Dialog.Portal>
  </Dialog.Root>
    {deleteTarget ? <AppModal open onClose={() => { if (!savingRef.current) setDeleteTarget(null); }} title="Delete workspace?" cardClass="account-removal-card" busy={saving} busyMessage="Deleting workspace…" role="alertdialog" descriptionId={`${deleteDescription}-name ${deleteDescription}`} initialFocusRef={keep} returnFocusRef={trigger}>
      <div className="removal-identity"><WorkspaceMark workspace={deleteTarget} /><div><strong id={`${deleteDescription}-name`} dir="auto">{deleteTarget.name}</strong><span id={deleteDescription}>Workspace settings will be deleted.</span></div></div>
      {deleteError ? <ErrorToast message={deleteError} /> : null}
      <div className="confirmation-actions action-row" onKeyDown={event => {
        if (event.key !== "ArrowRight" && event.key !== "ArrowLeft") return;
        event.preventDefault();
        (event.key === "ArrowRight" ? confirm : keep).current?.focus();
      }}><Button ref={keep} variant="secondary" disabled={saving} onClick={() => setDeleteTarget(null)}>Cancel</Button><Button ref={confirm} variant="destructive" disabled={busy || saving} onClick={() => void confirmDelete()}><TrashIcon size={16} />{saving ? "Deleting…" : "Delete workspace"}</Button></div>
    </AppModal> : null}
  </>;
}
