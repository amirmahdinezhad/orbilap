import { accountCard, afterRemovalFocus, snapRemoval } from "../snapRemoval";
import { ErrorToast } from "./Toast";
import { useRef, useState } from "react";
import { prettyError, removeWorkspaceAccount, type AccountProvider } from "../api";
import type { AppState, Workspace } from "../types";
import { AppModal } from "./AppModal";
import { BankedResetSection, type BankedResetSectionProps } from "./BankedResetSection";
import { Button } from "./ui/button";
import { AccountRemovalDialog } from "./AccountRemovalDialog";
import { TrashIcon, SaveIcon } from "../icons";
import { ProviderLogo } from "../logos";
import { DeviceSettingsEntry } from "./DeviceSync";

interface Props {
  open?: boolean;
  onExited?: () => void;
  workspace: Workspace;
  provider: AccountProvider;
  profile: { id: string; name: string; email?: string | null };
  onClose: () => void;
  onChanged: (state: AppState) => void;
  onRename: (name: string) => Promise<void>;
  bankedReset?: Pick<BankedResetSectionProps, "refreshKey" | "onUsed">;
}

/** Keep account identity and removal separate from workspace preferences. */
export function AccountSettings({ open = true, onExited, workspace, provider, profile, onClose, onChanged, onRename, bankedReset }: Props) {
  const [name, setName] = useState(profile.name);
  const [savedName, setSavedName] = useState(profile.name);
  const [confirmRemove, setConfirmRemove] = useState(false);
  const returnFocus = useRef<HTMLElement | null>(null);
  const [saving, setSaving] = useState(false);
  const [resetBusy, setResetBusy] = useState(false);
  const [devicesBusy, setDevicesBusy] = useState(false);
  const busy = saving || resetBusy || devicesBusy;
  const [error, setError] = useState<string | null>(null);
  const run = async (action: () => Promise<void>) => {
    if (busy) return;
    setSaving(true);
    setError(null);
    try { await action(); }
    catch (e) { setError(prettyError(e)); }
    finally { setSaving(false); }
  };
  const remove = (forget: boolean, pointer: boolean) => run(async () => {
    const next = await removeWorkspaceAccount(workspace.id, provider, profile.id, forget);
    const card = accountCard(provider, profile.id);
    if (card) returnFocus.current = afterRemovalFocus(card);
    // Let the shared sheet exit first so the card's disintegration is visible.
    const delay = Number.parseFloat(getComputedStyle(document.documentElement).getPropertyValue("--orbilap-motion-popup")) || 220;
    onClose();
    await snapRemoval(card, () => onChanged(next), { pointer, delay });
  });
  return <AppModal open={open} onExited={onExited} onClose={onClose} returnFocusRef={returnFocus} title="Account settings" cardClass="account-settings" busy={busy} busyMessage={resetBusy ? "Working with reset credits…" : undefined} hasUnsavedChanges={name.trim() !== savedName} detail={<div className="removal-identity"><ProviderLogo provider={provider} /><div><strong dir="auto">{profile.name}</strong>{profile.email ? <span>{profile.email}</span> : null}</div></div>}>
    {error ? <ErrorToast message={error} /> : null}
    <form className="workspace-form account-edit-form" onSubmit={(e) => {
      e.preventDefault();
      if (!name.trim() || name.trim() === savedName) return;
      void run(async () => {
        await onRename(name.trim());
        setSavedName(name.trim());
      });
    }}>
      <label>Account name<input aria-label="Account name" required maxLength={64} value={name} disabled={busy} onChange={(e) => setName(e.target.value)} /></label>
      <Button type="submit" variant="default" size="sm" disabled={busy || !name.trim() || name.trim() === savedName}><SaveIcon size={16} />{saving ? "Saving…" : "Save"}</Button>
    </form>
    {bankedReset ? <BankedResetSection {...bankedReset} accountId={profile.id} disabled={saving || confirmRemove}
      onBusyChange={setResetBusy} onApplied={onClose} /> : null}
    <DeviceSettingsEntry account={{ provider, id: profile.id }} label={profile.name} disabled={busy}
      onBusyChange={setDevicesBusy} />
    <div className="workspace-remove"><Button variant="destructive" disabled={busy} onClick={() => setConfirmRemove(true)}><TrashIcon size={17} />Remove account</Button></div>
    {confirmRemove ? <AccountRemovalDialog provider={provider} profile={profile} workspace={workspace} busy={busy} onClose={() => setConfirmRemove(false)} onConfirm={(forget, pointer) => void remove(forget, pointer)} /> : null}
  </AppModal>;
}
