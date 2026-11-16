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
import { AccountUsagePreview, AdditionalLimits, accountPreviewWindows } from "./AccountUsagePreview";
import { LiveAccountUsage, type UsageSnapshot } from "./LiveAccountUsage";

const defaultAccountName = "Antigravity account";

function cardName(account: SetupAccount) {
  const name = account.name.trim();
  if (name && !name.includes("@")) return name;
  const googleName = account.displayName?.trim();
  return googleName && !googleName.includes("@") ? googleName : defaultAccountName;
}

const featuredModels = ["Gemini 4 Carbon", "Gemini 4 Argon"] as const;
const modelOrder = new Intl.Collator("en", { numeric: true, sensitivity: "base" });

function featuredModel(label: string) {
  const model = label.split(" · ")[0].replace(/\s*\([^()]+\)$/, "").trim();
  return featuredModels.find(name => name.toLowerCase() === model.toLowerCase());
}

function AntigravityUsage({ quota, accountName }: { quota: UsageSnapshot; accountName: string }) {
  const windows = (quota.windows ?? []).filter(window => Number.isFinite(window.percent) && window.percent >= 0);
  const models = quota.models ?? [];
  const featured = featuredModels.flatMap(name => {
    const limits = windows.flatMap(window => {
      if (featuredModel(window.window) !== name) return [];
      return [{ ...window, window: window.window.split(" · ").slice(1).join(" · ") || "Reported quota" }];
    });
    const unique = new Map<string, typeof limits[number]>();
    for (const limit of limits) {
      const previous = unique.get(limit.window);
      if (!previous || previous.percent < limit.percent) unique.set(limit.window, limit);
    }
    const measured = [...unique.values()];
    const primary = accountPreviewWindows({ ...quota, windows: measured });
    const ordered = [...primary, ...measured.filter(limit => !primary.includes(limit))];
    return ordered.length || models.some(model => featuredModel(model) === name) ? [{ name, limits: ordered }] : [];
  });
  const extra = windows.filter(window => !featuredModel(window.window)).map(window =>
    /^(?:5-hour|Weekly)$/i.test(window.window) ? { ...window, window: `Gemini · ${window.window}` }
      : { ...window, window: window.window.replace(/^Gemini Models · /i, "Gemini · ") });

  return <>
    {quota.error ? <ErrorToast message={quota.error} /> : null}
    {featured.length ? <div className="account-usage-metrics antigravity-featured" role="group" aria-label="Featured Gemini models">
      {featured.map(({ name, limits }) => <div className="antigravity-featured-model" key={name}>
        {limits.length ? <AccountUsagePreview windows={limits} accountName={`${accountName} · ${name}`} labelPrefix={name.replace(/^Gemini 4 /, "")} />
          : <p className="account-data-note">{name.replace(/^Gemini 4 /, "")} · Usage unavailable</p>}
      </div>)}
    </div> : null}
    {extra.length ? featured.length
      ? <AdditionalLimits windows={extra} accountName={accountName} showRemaining label="Additional limits" />
      : <AccountUsagePreview windows={extra} accountName={accountName} showRemaining />
      : null}
    {!featured.length && !extra.length && !quota.error ? <p className="account-data-note">Usage unavailable</p> : null}
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
  const [loading, setLoading] = useState(true);
  const [retry, setRetry] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [settingsId, setSettingsId] = useState<string | null>(null);
  const settingsAccount = accounts.find((a) => a.id === settingsId && workspace.antigravityAccountIds?.includes(a.id));
  useEffect(() => {
    let active = true;
    setLoading(true); setError(null); setSwitchError(null);
    void antigravityAccounts().then(accounts => { if (active) setAccounts(accounts); })
      .catch(e => { if (active) setError(prettyError(e)); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [workspace.id, refreshKey, retry]);
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
        const quota = await antigravityAccountQuota(a.id, true);
        const windows = quota.windows?.flatMap(window => {
          if (!/^Gemini(?:$|[ .·-])/i.test(window.window) || /\b(?:Claude|GPT)\b/i.test(window.window)) return [];
          // Shared Gemini windows use the same columns and labels as the other cards.
          return [{ ...window, window: window.window.replace(/^Gemini(?: Models)? · (?=5-hour$|Weekly$)/i, "") }];
        });
        const models = [...new Set(quota.models?.flatMap(label => {
          const name = label.trim().replace(/\s*\((?:low|medium|high|xhigh|extra high|extra)\)$/i, "");
          return /^Gemini \d/i.test(name) && !/\b(?:Claude|GPT)\b/i.test(name) ? [name] : [];
        }))].sort((a, b) => modelOrder.compare(b, a));
        return { ...quota, windows, models };
      }} featuredPlaceholder renderUsage={quota => <AntigravityUsage quota={quota} accountName={a.name} />} onLoaded={sets => { if (sets[0]) setLoadedQuotas(previous => ({ key: quotaKey, quotas: { ...(previous.key === quotaKey ? previous.quotas : {}), [a.id]: sets[0] } })); }} />
    </article>)}</AnimatedAccountList>}
    <ModalTarget target={settingsAccount}>{(account, presence) => <AccountSettings {...presence} key={`${workspace.id}:${account.id}`} workspace={workspace} provider="antigravity" profile={account} onClose={() => setSettingsId(null)} onChanged={onChanged} onRename={async (name) => {
      await renameAntigravityAccount(account.id, name);
      setAccounts((old) => old.map((a) => a.id === account.id ? { ...a, name } : a));
    }} />}</ModalTarget>
  </section>;
}
