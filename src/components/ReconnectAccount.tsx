import { BackIcon, RefreshIcon } from "../icons";
import { ErrorToast } from "./Toast";
import { useCallback, useEffect, useRef, useState } from "react";
import { reconnectSetupAccount, prettyError } from "../api";
import type { CodexProfile, CodexProfilesState } from "../types";
import { AppModal } from "./AppModal";
import { Button } from "./ui/button";
import { AccountEnrollment, useAccountEnrollment } from "./AccountEnrollment";

/** Reuse enrollment methods, saving verified credentials only to this account. */
export function ReconnectAccount({ open = true, onExited, profile, onClose, onProfilesChanged, onReconnected }: {
  open?: boolean; onExited?: () => void;
  profile: CodexProfile; onClose: () => void; onProfilesChanged: (profiles: CodexProfilesState) => void;
  onReconnected: () => void;
}) {
  const draft = useAccountEnrollment(true);
  const [saving, setSaving] = useState(false);
  const [attempt, setAttempt] = useState(0);
  const account = draft.accounts[0];
  const attempted = useRef<string | null>(null);
  const savingNow = useRef(false);
  const save = useCallback(async () => {
    if (!account || savingNow.current) return;
    savingNow.current = true; attempted.current = account.id;
    setSaving(true); draft.setError(null);
    try {
      const fresh = await reconnectSetupAccount(await draft.getSession(), account.id, profile.id);
      onProfilesChanged(fresh); onReconnected();
    } catch (error) { draft.setError(prettyError(error)); }
    finally { savingNow.current = false; setSaving(false); }
  }, [account, draft.getSession, draft.setError, profile.id, onProfilesChanged, onReconnected]);
  useEffect(() => {
    if (open && account && attempted.current !== account.id) void save();
  }, [open, account, save]);
  return <AppModal open={open} onExited={onExited} title="Reconnect account" onClose={onClose}
    cardClass="account-enrollment-card" hasUnsavedChanges={draft.editing || !!account} busy={draft.busy || draft.pending || saving || (!!account && !draft.error)} busyMessage="Reconnecting account…"
    detail={<div className="usage-identity"><strong dir="auto">{profile.name}</strong>{profile.email ? <span>{profile.email}</span> : null}</div>}>
    {account ? <section className="settings-section">
      <p className="setting-note" role="status">{saving || !draft.error ? "Reconnecting your account…" : "Your account couldn’t be reconnected."}</p>
      {draft.error ? <ErrorToast message={draft.error} /> : null}
      {draft.error && !saving ? <>
        <Button variant="default" onClick={() => void save()}><RefreshIcon size={16} />Try again</Button>
        <Button variant="ghost" onClick={() => { attempted.current = null; draft.clearVerified(); setAttempt(value => value + 1); }}><BackIcon size={16} />Choose another method</Button>
      </> : null}
    </section> : <AccountEnrollment key={attempt} draft={draft} embedded initiallyOpen reconnecting />}
  </AppModal>;
}
