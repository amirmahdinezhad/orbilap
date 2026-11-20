import { BackIcon, RefreshIcon } from "../icons";
import { ErrorToast } from "./Toast";
import { useCallback, useEffect, useRef, useState } from "react";
import { reconnectSetupAccount, prettyError, type ReconnectResult } from "../api";
import type { CodexProfile } from "../types";
import { AppModal } from "./AppModal";
import { Button } from "./ui/button";
import { AccountEnrollment, useAccountEnrollment } from "./AccountEnrollment";

/** Reuse enrollment methods with a draft bound to the saved account. */
export function ReconnectAccount({ open = true, onExited, profile, onClose, onCompleted }: {
  open?: boolean; onExited?: () => void;
  profile: CodexProfile; onClose: () => void; onCompleted: (result: ReconnectResult) => void;
}) {
  const draft = useAccountEnrollment(profile.id);
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
      onCompleted(await reconnectSetupAccount(await draft.getSession(), account.id, profile.id));
    } catch (error) { draft.setError(prettyError(error)); }
    finally { savingNow.current = false; setSaving(false); }
  }, [account, draft.getSession, draft.setError, profile.id, onCompleted]);
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
