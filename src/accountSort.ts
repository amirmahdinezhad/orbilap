import type { QuotaSet } from "./api";
import { isSubscriptionExpired, subscriptionDeadline, type Subscription } from "./subscriptions";
import { canonicalAccountWindow } from "./accountPrefs";
import { activeAccountFirst } from "./accountActivity";

export const ACCOUNT_SORT_OPTIONS = [
  { value: "active", label: "Active first" },
  { value: "expiry", label: "Subscription expiry" },
  { value: "resets", label: "Banked resets" },
  { value: "ready", label: "Available soonest" },
  { value: "capacity", label: "Remaining capacity" },
  { value: "name", label: "Account name" },
] as const;
export type AccountSortMode = typeof ACCOUNT_SORT_OPTIONS[number]["value"];
export interface AccountSortPreference { mode: AccountSortMode; descending: boolean }
export const DEFAULT_ACCOUNT_SORT: AccountSortPreference = { mode: "active", descending: false };
export function defaultSortDirection(mode: AccountSortMode) { return mode === "resets" || mode === "capacity"; }
export function isAccountSortMode(value: unknown): value is AccountSortMode { return ACCOUNT_SORT_OPTIONS.some(option => option.value === value); }
const key = (workspaceId: string) => `orbilap.accountSort.${workspaceId}`;
export function loadAccountSort(workspaceId: string): AccountSortPreference {
  try {
    const value = JSON.parse(localStorage.getItem(key(workspaceId)) ?? "null");
    if (isAccountSortMode(value?.mode) && typeof value.descending === "boolean") return { mode: value.mode, descending: value.descending };
  } catch { /* Storage is optional. */ }
  return { ...DEFAULT_ACCOUNT_SORT };
}
export function saveAccountSort(workspaceId: string, preference: AccountSortPreference) {
  try { localStorage.setItem(key(workspaceId), JSON.stringify(preference)); } catch { /* Keep sorting in memory. */ }
}
interface SortableAccount { id: string; name: string; connected?: boolean; subscription?: Subscription | null }
/** Missing, failed or stale windows never establish usable capacity. All blocking resets must pass. */
export function accountSortMetrics(quota: QuotaSet | null | undefined, now: number, knownWindows: readonly string[] = []) {
  if (!quota || quota.error) return { ready: null, capacity: null, resets: null };
  const resets = quota.resetCredits?.availableCount;
  const creditCount = resets != null && Number.isFinite(resets) && resets >= 0 ? resets : null;
  const windows = (quota.windows ?? []).filter(window => canonicalAccountWindow(window.window));
  if (!windows.length || knownWindows.some(kind => !windows.some(window => canonicalAccountWindow(window.window) === kind))
    || windows.some(window => !Number.isFinite(window.percent) || window.percent < 0 || window.percent > 100
      || (window.resetsAt != null && (!Number.isFinite(Date.parse(window.resetsAt)) || Date.parse(window.resetsAt) <= now)))) {
    return { ready: null, capacity: null, resets: creditCount };
  }
  const blocked = windows.filter(window => window.percent >= 100);
  const deadlines = blocked.map(window => Date.parse(window.resetsAt ?? ""));
  return {
    ready: !blocked.length ? 0 : deadlines.every(Number.isFinite) ? Math.max(...deadlines) : null,
    capacity: 100 - Math.max(...windows.map(window => window.percent)),
    resets: creditCount,
  };
}

/** Sort within a provider; unknown values stay last in either direction, ties retain saved order. */
export function sortAccounts<T extends SortableAccount>(accounts: readonly T[], preference: AccountSortPreference, activeId: string | null | undefined,
  quotas: Record<string, QuotaSet | null | undefined>, now: number, knownWindows: Record<string, string[]> = {}): T[] {
  if (preference.mode === "active") return activeAccountFirst([...accounts], activeId);
  const mode = preference.mode;
  const ranked = accounts.map((account, index) => {
    const metrics = account.connected === false || isSubscriptionExpired(account.subscription, now) ? { ready: null, capacity: null, resets: null }
      : accountSortMetrics(quotas[account.id], now, knownWindows[account.id]);
    const expiry = Date.parse(subscriptionDeadline(account.subscription) ?? "");
    const value = mode === "name" ? account.name : mode === "expiry" ? (Number.isFinite(expiry) ? expiry : null)
      : mode === "resets" ? metrics.resets : mode === "ready" ? metrics.ready : metrics.capacity;
    return { account, index, value };
  });
  return ranked.sort((a, b) => {
    if (a.value == null || b.value == null) return a.value == null && b.value == null ? a.index - b.index : a.value == null ? 1 : -1;
    const comparison = typeof a.value === "string" && typeof b.value === "string" ? a.value.localeCompare(b.value, undefined, { numeric: true, sensitivity: "base" }) : Number(a.value) - Number(b.value);
    return (preference.descending ? -comparison : comparison) || a.index - b.index;
  }).map(item => item.account);
}
