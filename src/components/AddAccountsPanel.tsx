import { Tooltip } from "./ui/tooltip";
import { ErrorToast } from "./Toast";
import { useEffect, useRef, useState } from "react";
import { loadSetupAccounts, prettyError, type AccountProvider, type SetupAccount } from "../api";
import { AddIcon, CheckIcon, DeviceIcon, RefreshIcon, ResetIcon, SpinnerIcon } from "../icons";
import type { AppState, Workspace } from "../types";
import { AccountEnrollment, accountSourceLabel, PROVIDER_LABELS, useAccountEnrollment } from "./AccountEnrollment";
import { PlanBadge } from "./PlanBadge";
import { ActiveAccountBadge } from "./AccountIdentity";
import { Button } from "./ui/button";
import type { DraftStatus } from "./WorkspaceSetup";
import { EnrollmentDeviceSettings } from "./DeviceSync";

/** Verify local accounts for the chosen provider through the same discovery as setup. */
export function AddAccountsPanel({ workspace, onSaved, onStatusChange, onAccountAdded }: { workspace: Workspace; onSaved: (state: AppState) => void; onStatusChange: (status: DraftStatus) => void; onAccountAdded?: () => void }) {
  const draft = useAccountEnrollment();
  const [provider, setProvider] = useState<AccountProvider | null>(null);
  const [localAccounts, setLocalAccounts] = useState<SetupAccount[]>([]);
  const [checking, setChecking] = useState(false);
  const [devicesBusy, setDevicesBusy] = useState(false);
  const [discoveryError, setDiscoveryError] = useState<string | null>(null);
  const generation = useRef(0);
  useEffect(() => () => { generation.current++; }, []);
  const discover = async (id: AccountProvider | null) => {
    const ticket = ++generation.current;
    setProvider(id); setLocalAccounts([]); setDiscoveryError(null); setChecking(!!id && id !== "antigravity");
    // Antigravity goes straight through its official saved-login check, not discovery + methods.
    if (!id || id === "antigravity") return;
    try {
      const accounts = await loadSetupAccounts(await draft.getSession(), id);
      if (ticket === generation.current) setLocalAccounts(accounts.filter((account) => !account.alreadyAdded));
    } catch (error) { if (ticket === generation.current) setDiscoveryError(prettyError(error)); }
    finally { if (ticket === generation.current) setChecking(false); }
  };
  const dirty = draft.selected.length > 0 || draft.editing || !!draft.pending;
  const selectedCount = draft.selected.length;
  useEffect(() => { onStatusChange({ dirty, busy: draft.busy || draft.loading || checking || devicesBusy }); }, [dirty, draft.busy, draft.loading, checking, devicesBusy, onStatusChange]);
  return <section className="workspace-setup provider-add-panel add-accounts-panel" data-motion="pointer"
    onPointerDownCapture={(event) => { event.currentTarget.dataset.motion = "pointer"; }}
    onKeyDownCapture={(event) => { event.currentTarget.dataset.motion = "keyboard"; }}>
    <div className="workspace-setup-scroll">
      <AccountEnrollment embedded initiallyOpen draft={draft} onAdded={onAccountAdded} reviewWorkspace={workspace.name}
        onImportConfirmed={async (accounts) => {
          const ids = [...new Set([...draft.selected, ...accounts.map(account => account.id)])];
          const state = await draft.commit(workspace.name, workspace.accent, workspace.id, ids);
          if (state) onSaved(state);
        }}
        onProviderChange={(id) => void discover(id)}
        providerContent={provider ? <>
          <span className="sr-only" role="status">{checking ? "Verifying local accounts…" : ""}</span>
          {discoveryError ? <div className="provider-local">
            <ErrorToast message={discoveryError} />
            <div><Button size="sm" disabled={draft.busy || draft.pending} onClick={() => void discover(provider)}><RefreshIcon size={16} />Retry local account check</Button></div>
          </div> : null}
          {localAccounts.length > 0 ? <>
            <section className="provider-local" aria-label={`${PROVIDER_LABELS[provider]} accounts on this Mac`}>
              <div className="provider-local-heading"><h3><DeviceIcon size={16} />On this Mac</h3><Button size="icon-sm" variant="ghost" aria-label="Check local accounts again" disabled={checking || draft.busy || draft.pending} onClick={() => void discover(provider)}><RefreshIcon size={15} /></Button></div>
              <div className="provider-local-list">{localAccounts.map((account) => {
                const selected = draft.selected.includes(account.id);
                const unavailable = draft.busy || draft.pending;
                return <div className="provider-local-source" key={account.id}>
                  <div className="provider-local-source-head"><strong>{accountSourceLabel(account)}</strong><span>{selected ? "Selected" : "Available"}</span></div>
                  <div className="provider-local-account"><div className="setup-account-identity"><div className="provider-local-name"><strong dir="auto">{account.displayName ?? account.name}</strong><PlanBadge subscription={account.subscription} />{account.active ? <ActiveAccountBadge /> : null}</div><Tooltip content={account.email}><span>{account.email || PROVIDER_LABELS[account.provider]}</span></Tooltip></div><Button size="sm" disabled={unavailable} aria-pressed={selected} onClick={() => selected ? draft.toggle(account.id) : draft.stage(account)}>{selected ? <CheckIcon size={15} /> : <AddIcon size={15} />}{selected ? "Selected" : "Select"}</Button></div>
                </div>;
              })}</div>
            </section>
            <div className="enrollment-methods-label">Or connect another account</div>
          </> : null}
        </> : null} />
      <EnrollmentDeviceSettings draft={draft} onBusyChange={setDevicesBusy} />
    </div>
    {draft.accounts.length ? <footer className="add-accounts-footer">
      {draft.error ? <ErrorToast message={draft.error} /> : null}
      <div className="add-accounts-actions">
        <div className="add-accounts-selection">
          <span role="status">{selectedCount} selected</span>
          <Button size="sm" variant="ghost" aria-disabled={!selectedCount || draft.busy || draft.pending} onClick={() => {
            if (selectedCount && !draft.busy && !draft.pending) draft.selected.forEach(draft.toggle);
          }}><ResetIcon size={16} />Clear selection</Button>
        </div>
        <Button variant="default" disabled={!selectedCount || draft.busy || checking || draft.pending || draft.editing || devicesBusy} onClick={() => void draft.commit(workspace.name, workspace.accent, workspace.id).then((state) => { if (state) onSaved(state); })}>{draft.busy ? <SpinnerIcon size={16} /> : <AddIcon size={16} />}{draft.busy ? "Saving…" : "Add accounts"}</Button>
      </div>
    </footer> : null}
  </section>;
}
