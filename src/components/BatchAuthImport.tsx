import { Tooltip } from "./ui/tooltip";
import { ErrorToast } from "./Toast";
import { useEffect, useRef, useState, type ReactNode } from "react";
import type { SetupAccount } from "../api";
import { CheckIcon, KeyIcon, NextIcon, RefreshIcon, SpinnerIcon, TickIcon, TrashIcon } from "../icons";
import { AuthFileInput, type AuthFileCandidate } from "./AuthFileInput";
import type { Enrollment } from "./AccountEnrollment";
import { PlanBadge } from "./PlanBadge";
import { Button } from "./ui/button";
import { DeviceSettingsEntry } from "./DeviceSync";

const needsRenewal = (error?: string) =>
  /^session (expired|rejected|could not be renewed)\b/i.test(error ?? "");

type Row = AuthFileCandidate & { id: number; account?: SetupAccount };

/** Review files in memory; native staging verifies them before the existing workspace review. */
export function BatchAuthImport({ draft, onDirtyChange, onReadingChange, onContinue, signInContent }: {
  signInContent: ReactNode;
  onContinue?: (accounts: SetupAccount[]) => Promise<void>;
  draft: Enrollment; onDirtyChange: (dirty: boolean) => void; onReadingChange: (reading: boolean) => void;
}) {
  const [rows, setRows] = useState<Row[]>([]);
  const [reading, setReading] = useState(false);
  const [verifying, setVerifying] = useState(false);
  const [devicesBusy, setDevicesBusy] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const nextId = useRef(0);
  const running = useRef(false);
  const mounted = useRef(false);
  const list = useRef<HTMLUListElement>(null);
  const dropTarget = useRef<HTMLElement>(null);
  useEffect(() => { mounted.current = true; return () => { mounted.current = false; onDirtyChange(false); onReadingChange(false); }; }, [onDirtyChange, onReadingChange]);
  useEffect(() => { onDirtyChange(rows.length > 0); }, [rows.length, onDirtyChange]);
  const locked = draft.busy || verifying || reading || devicesBusy;
  const ready = rows.filter(row => row.file && !row.account && !needsRenewal(row.error));
  const verified = rows.flatMap(row => row.account ? [row.account] : []);
  const showVerify = verifying || (!verified.length && (!rows.length || ready.length > 0)) || ready.some(row => !row.error);
  const append = (files: AuthFileCandidate[]) => {
    setNotice(rows.length + files.length > 20 ? "You can import up to 20 files at a time. Extra files weren’t added." : null);
    setRows(previous => {
      const added = [...previous];
      for (const candidate of files) {
        if (candidate.file && added.some(row => row.file && ("path" in candidate.file! && "path" in row.file
          ? candidate.file.path === row.file.path
          : "credentials" in candidate.file! && "credentials" in row.file && candidate.file.credentials === row.file.credentials))) continue;
        added.push({ ...candidate, id: ++nextId.current });
      }
      return added.slice(0, 20);
    });
  };
  const verify = async () => {
    if (running.current || locked || !ready.length) return;
    running.current = true; setVerifying(true); setNotice(null);
    try {
      const identities = new Set(verified.map(account => account.id));
      let updated = rows.map(row => ready.includes(row) ? { ...row, error: undefined } : row);
      setRows(updated);
      await draft.verifyFiles(ready.map(row => row.file!), (index, result) => {
        if (!mounted.current) return;
        updated = updated.map(row => {
          if (row.id !== ready[index].id) return row;
          if (result.account) {
            if (identities.has(result.account.id)) return { ...row, error: "This account is already in the import list." };
            identities.add(result.account.id);
            return { ...row, error: undefined, account: result.account };
          }
          return { ...row, error: result.error };
        });
        setRows(updated);
      });
      if (!mounted.current) return;
      if (updated.length && updated.every(row => row.account)) draft.addMany(updated.map(row => row.account!));
    } finally { running.current = false; if (mounted.current) setVerifying(false); }
  };
  const renew = (row: Row) => {
    void draft.start("codex", "browser", "", account => {
      if (!mounted.current) return;
      if (account.alreadyAdded || verified.some(item => item.id === account.id)) {
        setNotice(account.alreadyAdded ? "This account is already added to Orbilap." : "This account is already in the import list.");
        return;
      }
      const updated = rows.map(item => item.id === row.id ? { ...item, error: undefined, account } : item);
      setRows(updated);
      if (updated.every(item => item.account)) draft.addMany(updated.map(item => item.account!));
    });
    setNotice(null);
  };

  if (draft.pending) return signInContent;
  return <section ref={dropTarget} className="batch-auth-import" aria-label="Import login files" aria-busy={locked}>
    <AuthFileInput dropTargetRef={dropTarget} value={null} disabled={locked} onChange={() => {}} onFiles={append}
      onReadingChange={value => { setReading(value); onReadingChange(value); }} />
    {notice ? <ErrorToast message={notice} /> : null}
    {rows.length ? <>
      <div className="batch-auth-summary"><strong>{rows.length} {rows.length === 1 ? "file" : "files"}</strong><span role="status">{verifying ? "Verifying accounts…" : verified.length ? `${verified.length} verified` : "Not verified yet"}</span></div>
      <ul className="batch-auth-list" ref={list} tabIndex={-1} aria-label="Selected login files">{rows.map((row, index) => <li key={row.id} className={`batch-auth-row${row.error ? " has-error" : ""}${row.account ? " is-verified" : ""}`}>
        <span className="batch-auth-mark" aria-hidden="true">{verifying && row.file && !row.account && !row.error ? <SpinnerIcon size={17} /> : row.account ? <TickIcon size={17} /> : <KeyIcon size={17} />}</span>
        <div className="batch-auth-identity"><div className="batch-auth-title"><Tooltip content={row.account?.name ?? row.name}><strong dir="auto">{row.account?.name ?? row.name}</strong></Tooltip>{row.account ? <PlanBadge subscription={row.account.subscription} /> : null}</div>
          {row.account ? <span dir="auto">{row.account.email}</span> : <><ErrorToast message={row.error && !needsRenewal(row.error) ? `${row.name}: ${row.error}` : null} /><span>{needsRenewal(row.error) ? "Sign in to ChatGPT again" : row.error ? "Verification failed" : "Ready to verify"}</span></>}
          {row.account ? <DeviceSettingsEntry account={{ id: row.account.id, provider: "codex" }} label={row.account.name}
            session={draft.getSession} disabled={locked} onBusyChange={setDevicesBusy} /> : null}
        </div>
        {needsRenewal(row.error) ? <Button variant="default" size="sm" className="batch-auth-renew" aria-label={`Renew ${row.name}`} disabled={locked} onClick={() => renew(row)}><RefreshIcon size={16} />Renew</Button> : null}
        <Button variant="destructive" size="icon-sm" className="auth-file-remove" aria-label={`Remove ${row.name}`} title="Remove file" disabled={locked} onClick={() => {
          const button = list.current?.querySelectorAll<HTMLButtonElement>("button.auth-file-remove")[index + 1] ?? list.current?.querySelectorAll<HTMLButtonElement>("button.auth-file-remove")[index - 1];
          (button ?? list.current)?.focus(); setRows(previous => previous.filter(item => item.id !== row.id));
        }}><TrashIcon size={16} /></Button>
      </li>)}</ul>
      {rows.some(row => row.error && !needsRenewal(row.error)) ? <p className="batch-auth-help" role="status">Remove files with errors or choose them again. You can continue with verified accounts.</p> : null}
    </> : null}
    <div className="batch-auth-actions">
      <Button className="enrollment-verify" variant={ready.length || verified.length ? "default" : "secondary"}
        disabled={locked || (showVerify ? !ready.length : !verified.length)} aria-busy={verifying || draft.busy}
        onClick={() => {
          if (showVerify) void verify();
          else if (onContinue) void onContinue(verified);
          else draft.addMany(verified);
        }}>
        {verifying || draft.busy ? <SpinnerIcon size={16} /> : showVerify ? <CheckIcon size={16} /> : <NextIcon size={16} />}
        {verifying ? "Verifying…" : draft.busy ? "Saving…" : showVerify ? rows.length <= 1 ? "Verify account" : "Verify accounts" : <>Continue with {verified.length} {verified.length === 1 ? "account" : "accounts"}</>}
      </Button>
    </div>
  </section>;
}
