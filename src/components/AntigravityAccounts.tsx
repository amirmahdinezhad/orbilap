import { RefreshIcon } from "../icons";
import { ErrorToast } from "./Toast";
import { AccountMoreButton } from "./AccountMoreButton";
import { useAccountSorting } from "../accountSortingContext";
import { sortAccounts } from "../accountSort";
import { AnimatedAccountList } from "./AccountSorting";
import { useAccountClock } from "../useAccountClock";
import type { QuotaSet } from "../api";
import { AccountSwitchButton } from "./AccountSwitchButton";
import { AccountIdentity } from "./AccountIdentity";
import { activeProviderAccountId } from "../accountActivity";
import { useEffect, useRef, useState } from "react";
import { activateAntigravityAccount, antigravityAccounts, antigravityAccountQuota, prettyError, renameAntigravityAccount, type SetupAccount } from "../api";
import type { AppState, Workspace } from "../types";
import { ProviderLogo } from "../logos";
import { Button } from "./ui/button";
import { PlanBadge } from "./PlanBadge";
import { toast } from "sonner";
import { LoadingRing } from "./ui/loading-ring";
import { ModalTarget } from "./AppModal";
import { AccountSettings } from "./AccountSettings";
import { LoadingSkeleton } from "./LoadingSkeleton";
import { AdditionalLimits } from "./AccountUsagePreview";
import { AntigravityQuotaGroup, AntigravityQuotaGroups } from "./AntigravityQuotaGroup";
import { LiveAccountUsage, type UsageSnapshot } from "./LiveAccountUsage";

const defaultAccountName = "Antigravity account";

function cardName(account: SetupAccount) {
  const name = account.name.trim();
  if (name && !name.includes("@")) return name;
  const googleName = account.displayName?.trim();
  return googleName && !googleName.includes("@") ? googleName : defaultAccountName;
}

function AntigravityUsage({ quota, accountName }: { quota: UsageSnapshot; accountName: string }) {
  const windows = (quota.windows ?? []).filter(window => Number.isFinite(window.percent) && window.percent >= 0);
  // Only a reported shared Gemini group is primary; never invent a shared quota
  // from individual model limits returned by the fallback catalog.
  const shared = windows.filter(window => /^(?:Gemini(?: Models)? · )?(?:5-hour|Weekly)$/i.test(window.window));
  const extra = windows.filter(window => !shared.includes(window));
  return <>
    {quota.error ? <ErrorToast message={quota.error} /> : null}
    {shared.length ? <AntigravityQuotaGroup windows={shared} name="Gemini Models" accountName={accountName} /> : null}
    {extra.length ? <AdditionalLimits windows={extra} accountName={accountName} showRemaining>
      <AntigravityQuotaGroups windows={extra} accountName={accountName} />
    </AdditionalLimits> : null}
    {!shared.length && !quota.error ? <p className="account-data-note">Gemini usage unavailable</p> : null}
  </>;
}

/** Account-scoped Google usage never falls back to another ambient Google login. */
export function AntigravityAccounts({ workspace, refreshKey, onChanged }: { workspace: Workspace; refreshKey: number; onChanged: (state: AppState) => void }) {
  const sorting = useAccountSorting();
  const switching = useRef(false);
  const currentWorkspace = useRef(workspace.id);
  currentWorkspace.current = workspace.id;
  const [switchingId, setSwitchingId] = useState<string | null>(null);
  const [switchError, setSwitchError] = useState<string | null>(null);
  const switchAccount = async (account: SetupAccount) => {
    if (switching.current) return;
    const targetWorkspace = workspace.id;
    switching.current = true; setSwitchingId(account.id); setSwitchError(null);
    try {
      const { state, launchWarning } = await activateAntigravityAccount(targetWorkspace, account.id);
      if (currentWorkspace.current === targetWorkspace) setAccounts(previous => previous.map(item => ({ ...item, active: item.id === account.id })));
      onChanged(state);
      if (launchWarning) toast.warning(`Switched to ${cardName(account)}. ${launchWarning}`);
      else toast.success(`Switched to ${cardName(account)}.`);
    } catch (error) { if (currentWorkspace.current === targetWorkspace) setSwitchError(prettyError(error)); }
    finally { switching.current = false; setSwitchingId(null); }
  };
  const [loadedQuotas, setLoadedQuotas] = useState<{ key: string; quotas: Record<string, QuotaSet> }>({ key: "", quotas: {} });
  const quotaKey = JSON.stringify([workspace.id, refreshKey, workspace.antigravityAccountIds]);
  const now = useAccountClock();
  const [accounts, setAccounts] = useState<SetupAccount[]>([]);
  const [initialUsage, setInitialUsage] = useState<Record<string, UsageSnapshot>>({});
  const [loading, setLoading] = useState(true);
  const [retry, setRetry] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [settingsId, setSettingsId] = useState<string | null>(null);
  const settingsAccount = accounts.find((a) => a.id === settingsId && workspace.antigravityAccountIds?.includes(a.id));
  useEffect(() => {
    let active = true;
    setLoading(true); setError(null); setSwitchError(null);
    void antigravityAccounts().then(async accounts => {
      if (!active) return;
      const visible = accounts.filter(account => workspace.antigravityAccountIds?.includes(account.id));
      const readings = await Promise.allSettled(visible.map(account => antigravityAccountQuota(account.id, true)));
      if (!active) return;
      // Verification can retire a saved paid plan. Re-read native membership before
      // revealing cards; never infer expiry from a network/authentication error.
      const confirmed = readings.some(reading => reading.status === "rejected")
        ? await antigravityAccounts().catch(() => accounts) : accounts;
      if (!active) return;
      setInitialUsage(Object.fromEntries(visible.map((account, index) => {
        const reading = readings[index];
        return [account.id, reading.status === "fulfilled" ? reading.value
          : { provider: "antigravity", error: prettyError(reading.reason) }];
      })));
      setAccounts(confirmed);
    })
      .catch(e => { if (active) setError(prettyError(e)); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [quotaKey, retry]);
  const activeId = activeProviderAccountId("antigravity", workspace, accounts);
  const visible = accounts
    .filter(account => workspace.antigravityAccountIds?.includes(account.id))
    .map(account => ({ ...account, name: cardName(account) }));
  return <section className="provider-account-group" aria-label="Antigravity accounts">
    <h2 className="provider-group-title"><ProviderLogo provider="antigravity" />Antigravity <span className="provider-count">{loading ? <span role="status" aria-label="Loading Antigravity account count"><LoadingRing size={12} /></span> : error ? "—" : visible.length}</span></h2>
    {switchError ? <ErrorToast message={switchError} /> : null}
    {loading ? <LoadingSkeleton provider="antigravity" count={workspace.antigravityAccountIds?.length ?? 0} initial={false} /> : error ? <div><ErrorToast message={error} /><Button size="sm" onClick={() => setRetry(value => value + 1)}><RefreshIcon size={16} />Retry</Button></div> : <AnimatedAccountList className="workspace-account-list">{sortAccounts(visible, sorting.preference, activeId, loadedQuotas.key === quotaKey ? loadedQuotas.quotas : {}, now).map(a => <article key={a.id} data-account-provider="antigravity" data-account-id={a.id} className={`workspace-account account-card${a.id === activeId ? " is-active" : ""}`} aria-label={a.name === defaultAccountName ? a.name : `${a.name} Antigravity account`}>
      <div className="workspace-account-row"><AccountIdentity active={a.id === activeId} name={a.name} subscriptions={[a.subscription]}>
        <PlanBadge subscription={a.subscription} />
      </AccountIdentity><div className="workspace-account-actions">
        <AccountMoreButton name={a.name} disabled={!!switchingId} onOpen={() => setSettingsId(a.id)} />
        {visible.length > 1 ? <AccountSwitchButton name={a.name} active={a.id === activeId} pending={switchingId === a.id} disabled={!!switchingId} onActivate={() => void switchAccount(a)} /> : null}
      </div></div>
      <LiveAccountUsage identity={`antigravity:${workspace.id}:${a.id}`} accountName={a.name} refreshKey={refreshKey} load={async () => {
        return initialUsage[a.id] ?? await antigravityAccountQuota(a.id, true);
      }} renderUsage={quota => <AntigravityUsage quota={quota} accountName={a.name} />} onLoaded={sets => { if (sets[0]) setLoadedQuotas(previous => ({ key: quotaKey, quotas: { ...(previous.key === quotaKey ? previous.quotas : {}), [a.id]: sets[0] } })); }} />
    </article>)}</AnimatedAccountList>}
    <ModalTarget target={settingsAccount}>{(account, presence) => <AccountSettings {...presence} key={`${workspace.id}:${account.id}`} workspace={workspace} provider="antigravity" profile={account} onClose={() => setSettingsId(null)} onChanged={onChanged} onRename={async (name) => {
      await renameAntigravityAccount(account.id, name);
      setAccounts((old) => old.map((a) => a.id === account.id ? { ...a, name } : a));
    }} />}</ModalTarget>
  </section>;
}
