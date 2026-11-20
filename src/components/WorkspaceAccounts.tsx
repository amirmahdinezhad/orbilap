import { ErrorToast } from "./Toast";
import { AccountMoreButton } from "./AccountMoreButton";
import { useAccountSorting } from "../accountSortingContext";
import { sortAccounts } from "../accountSort";
import { AnimatedAccountList } from "./AccountSorting";
import { activeProviderAccountId } from "../accountActivity";
import { useEffect, useMemo, useRef, useState } from "react";
import { codexProfileQuota, prettyError, type QuotaSet } from "../api";
import { codexAccountPreferences } from "../accountPrefs";
import { KeyIcon, RefreshIcon } from "../icons";
import { ProviderLogo } from "../logos";
import { isSubscriptionExpired } from "../subscriptions";
import type { AppSettings, CodexProfile, CodexProfilesState, Workspace } from "../types";
import { Button } from "./ui/button";
import { PlanBadge } from "./PlanBadge";
import { CodexResetNotice } from "./CodexResetNotice";
import { useAccountClock } from "../useAccountClock";
import { AccountQuotaPreview } from "./AccountUsagePreview";
import { AccountSwitchButton } from "./AccountSwitchButton";
import { AccountIdentity } from "./AccountIdentity";
import { LoadingSkeleton } from "./LoadingSkeleton";

const EMPTY_QUOTAS: Record<string, QuotaSet | null> = {};

/** Read saved logins without activation; discard responses from a previous workspace/identity. */
export function useWorkspaceQuotas(profiles: CodexProfile[], workspaceId: string | undefined, refreshKey: number) {
  const identities = new Map(profiles.map(p => [p.id, JSON.stringify([p.id, p.connected, p.active, p.needsActivation])]));
  const scope = JSON.stringify([workspaceId, refreshKey]);
  const requestKey = JSON.stringify([scope, [...identities.values()]]);
  const [snapshot, setSnapshot] = useState<{ key: string; scope: string; identities: Map<string, string>; quotas: Record<string, QuotaSet | null> } | null>(null);
  useEffect(() => {
    let cancelled = false;
    void Promise.all(profiles.filter((p) => p.connected).map(async (profile): Promise<[string, QuotaSet]> => {
      try { return [profile.id, await codexProfileQuota(profile.id)]; }
      catch (error) { return [profile.id, { provider: "codex", error: prettyError(error) }]; }
    })).then((entries) => {
      if (!cancelled) setSnapshot({ key: requestKey, scope, identities, quotas: Object.fromEntries(entries) });
    });
    return () => { cancelled = true; };
  }, [requestKey]); // Publish the complete batch; metadata-only changes do not refetch.
  if (snapshot?.key === requestKey) return snapshot.quotas;
  // Removing membership does not invalidate the remaining accounts' usage.
  // Keep their exact DOM cards mounted so the exit FLIP can animate them rather
  // than measuring nodes that a loading skeleton immediately disconnects.
  if (snapshot?.scope === scope && profiles.every(p => snapshot.identities.get(p.id) === identities.get(p.id))) {
    return Object.fromEntries(Object.entries(snapshot.quotas).filter(([id]) => identities.has(id)));
  }
  return EMPTY_QUOTAS;

}

interface Props {
  workspace: Workspace;
  profiles: CodexProfilesState | null;
  app: AppSettings;
  quotas: Record<string, QuotaSet | null>;
  busy: boolean;
  checkingId?: string | null;
  switchingId?: string;
  onManage: (id: string, hasBankedResets?: boolean) => void;
  onActivate: (id: string) => void;
  onReconnect?: (id: string) => void;
  revealAccountId?: string | null;
  onRevealComplete?: () => void;
}

/** Each workspace card represents a saved account, including inactive logins. */
export function WorkspaceAccounts({ workspace, profiles, app, quotas, busy, checkingId, switchingId, onManage, onActivate, onReconnect, revealAccountId, onRevealComplete }: Props) {
  const sorting = useAccountSorting();
  const accounts = useMemo(() => workspace.accountIds.map((id) => profiles?.profiles.find((p) => p.id === id)).filter((p): p is CodexProfile => !!p), [workspace.accountIds, profiles]);
  const now = useAccountClock(accounts.map(account => account.subscription?.expiresAt));
  const visible = accounts.filter((p) => !isSubscriptionExpired(p.subscription, now));
  const loading = !profiles || visible.some((p) => p.connected && quotas[p.id] === undefined);
  const cards = useRef(new Map<string, HTMLElement>());
  // Wait for quota placeholders and the closing sheet to leave before revealing the card.
  useEffect(() => {
    if (!revealAccountId || loading) return;
    const card = cards.current.get(revealAccountId);
    if (card) {
      card.focus({ preventScroll: true });
      card.scrollIntoView({ block: "center", behavior: window.matchMedia?.("(prefers-reduced-motion: reduce)").matches ? "instant" : "smooth" });
    }
    onRevealComplete?.();
  }, [revealAccountId, loading, onRevealComplete]);
  const missingCodex = profiles?.desktopInstalled === false && profiles.cliInstalled === false;
  const activeId = missingCodex ? null : activeProviderAccountId("codex", workspace, visible);
  const knownWindows = Object.fromEntries(accounts.map((p) => [p.id, codexAccountPreferences(app, p.id).knownWindows]));
  if (profiles ? !visible.length : !workspace.accountIds.length) return null;
  return <section className="workspace-accounts" aria-label="Workspace accounts">
    <ErrorToast message={profiles?.switchError} />
    {profiles ? <h2 className="provider-group-title"><ProviderLogo provider="codex" />Codex <span className="provider-count" aria-label={`${visible.length} Codex ${visible.length === 1 ? "account" : "accounts"}`}>{visible.length}</span></h2> : null}
    {profiles && (workspace.usage.showCodexResets ?? true) ? <CodexResetNotice refreshKey={quotas} settings={{ ...app.codexReset, showProbableResets: workspace.usage.showProbableResets }} /> : null}
    {!loading && visible.length > 0 && !activeId ? <p className="provider-activation-note">{missingCodex ? "Install Codex CLI or Codex app and sign in, then refresh." : (visible.some((profile) => profile.connected)
      ? "Choose an account’s switch button to activate it in Codex."
      : "Reconnect a Codex account before switching.")}</p> : null}
    {loading ? <LoadingSkeleton count={profiles ? visible.length : workspace.accountIds.length} initial={false} /> : <AnimatedAccountList className="workspace-account-list">{sortAccounts(visible, sorting.preference, activeId, quotas, now, knownWindows).map((profile) => {
      const isActive = profile.id === activeId;
      const switchPending = profile.id === checkingId || profile.id === switchingId;
      const quota = quotas[profile.id];
      const needsReconnect = !profile.connected || /session (expired|rejected|could not be renewed)|authentication (failed|required)|(?:invalid|expired|revoked|rejected) (?:token|credentials)|(?:token|credentials) (?:invalid|expired|revoked|rejected)|sign[ -]?in again|reconnect (?:this )?account/i.test(quota?.error ?? "");
      const resetCount = quota?.resetCredits?.availableCount ?? 0;
      const hasBankedResets = !needsReconnect && resetCount > 0;
      return <article key={profile.id} data-account-provider="codex" data-account-id={profile.id} tabIndex={-1} ref={(node) => { if (node) cards.current.set(profile.id, node); else cards.current.delete(profile.id); }} className={`workspace-account account-card${isActive && !needsReconnect ? " is-active" : ""}${needsReconnect ? " is-disconnected" : ""}`} data-connection-state={needsReconnect ? "disconnected" : "connected"} aria-label={`${profile.name} account`}>
        <div className="workspace-account-row"><AccountIdentity active={isActive && !needsReconnect} name={profile.name} email={profile.email} subscriptions={[profile.subscription ?? { id: "chatgpt", service: "ChatGPT", plan: profile.plan }]}>
          <PlanBadge subscription={profile.subscription ?? { id: "chatgpt", service: "ChatGPT", plan: profile.plan }} />
        </AccountIdentity><div className="workspace-account-actions">
          <AccountMoreButton name={profile.name} onOpen={() => onManage(profile.id, hasBankedResets)} />
          {!needsReconnect ? <AccountSwitchButton name={profile.name} active={isActive} pending={switchPending} disabled={busy || missingCodex || !!profiles.switchError} onActivate={() => onActivate(profile.id)} /> : null}
        </div>
        </div>
        {needsReconnect ? <div className="account-connection-notice">
          <div className="account-connection-copy">
            <div className="account-connection-status" role="status" aria-label={`Connection for ${profile.name}`}><KeyIcon size={15} /><span>Reconnect needed</span></div>
            <p className="account-connection-note">Sign in again to restore usage.</p>
          </div>
          <ErrorToast message={!profile.connected ? profile.connectionError : null} />
          {onReconnect ? <Button variant="secondary" size="sm" className="account-reconnect" disabled={busy} onClick={() => onReconnect(profile.id)}><RefreshIcon size={15} />Reconnect</Button> : null}
        </div> : <AccountQuotaPreview quota={quota} accountName={profile.name} showRemaining={workspace.usage.showRemaining} />}

      </article>;
    })}</AnimatedAccountList>}
  </section>;
}
