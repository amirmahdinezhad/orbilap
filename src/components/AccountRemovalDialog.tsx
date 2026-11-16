import { useId, useRef } from "react";
import type { AccountProvider } from "../api";
import { TrashIcon } from "../icons";
import { ProviderLogo } from "../logos";
import { AppModal } from "./AppModal";
import { Button } from "./ui/button";

/** Only explicit confirmation removes the account from its current workspace. */
export function AccountRemovalDialog({ provider, profile, workspace, busy, onClose, onConfirm, noun = "account" }: {
  provider: AccountProvider;
  profile: { name: string; email?: string | null };
  workspace?: { name: string };
  busy: boolean;
  onClose: () => void;
  onConfirm: (everywhere: boolean, pointer: boolean) => void;
  noun?: "account" | "profile";
}) {
  const keep = useRef<HTMLButtonElement>(null);
  const description = useId();
  return <AppModal open onClose={onClose} title={`Remove ${noun}?`} cardClass="account-removal-card" busy={busy} busyMessage="Removing account…" role="alertdialog" descriptionId={description} initialFocusRef={keep}>
    <div className="removal-identity" id={description}><ProviderLogo provider={provider} /><div><strong dir="auto">{profile.name}</strong>{profile.email ? <span>{profile.email}</span> : null}</div></div>
    <div className="confirmation-actions action-row"><Button ref={keep} disabled={busy} onClick={onClose}>Cancel</Button><Button variant="destructive" disabled={busy} onClick={event => onConfirm(!workspace, event.detail > 0)}><TrashIcon size={16} />{busy ? "Removing…" : "Remove"}</Button></div>
  </AppModal>;
}
