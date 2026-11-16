import { afterEach, describe, expect, it } from "vitest";
import { accountSortMetrics, loadAccountSort, saveAccountSort, sortAccounts } from "./accountSort";
import type { QuotaSet } from "./api";
const now = Date.parse("2026-11-08T10:00:00Z");
const quota = (windows: QuotaSet["windows"], count?: number): QuotaSet => ({ provider: "codex", windows, resetCredits: count == null ? null : { availableCount: count, planType: "plus" } });
const accounts = [
  { id: "b", name: "Zoe", subscription: { id: "chatgpt", service: "ChatGPT", expiresAt: "2026-12-01T00:00:00Z" } },
  { id: "a", name: "Emma", subscription: { id: "chatgpt", service: "ChatGPT", expiresAt: "2026-11-10T00:00:00Z" } },
  { id: "unknown", name: "Ali", subscription: { id: "chatgpt", service: "ChatGPT", expiresAt: "invalid" } },
];
const ids = (items: typeof accounts) => items.map(item => item.id);
afterEach(() => localStorage.clear());
describe("account sorting", () => {
  it("keeps active-first as the default, without pinning active accounts over an explicit sort", () => {
    expect(ids(sortAccounts(accounts, {mode:"active",descending:false}, "a", {}, now))).toEqual(["a","b","unknown"]);
    expect(ids(sortAccounts(accounts, {mode:"expiry",descending:true}, "a", {}, now))).toEqual(["b","a","unknown"]);
    expect(ids(accounts)).toEqual(["b","a","unknown"]);
  });
  it("places unknown billing dates last in either direction and keeps ties stable", () => {
    expect(ids(sortAccounts(accounts, {mode:"expiry",descending:false}, null, {}, now))).toEqual(["a","b","unknown"]);
    const ties = accounts.map(account => ({...account,subscription:null}));
    expect(sortAccounts(ties, {mode:"expiry",descending:true}, null, {}, now).map(a=>a.id)).toEqual(ids(accounts));
  });
  it("sorts overdue accounts by their grace deadline, leaving an unknown deadline last", () => {
    const [zoe, emma] = accounts;
    const billing = { paymentRequired: true, checkedAt: "2026-11-08T08:00:00Z" };
    const overdue = {
      ...emma,
      subscription: {
        ...emma.subscription,
        expiresAt: "2026-12-06T10:00:00Z",
        billing: { ...billing, gracePeriodEndsAt: "2026-11-13T10:00:00Z" },
      },
    };
    const unknown = { ...overdue, id: "unknown", subscription: { ...overdue.subscription, billing } };
    const candidates = [zoe, unknown, overdue];
    expect(ids(sortAccounts(candidates, { mode: "expiry", descending: false }, null, {}, now))).toEqual(["a", "b", "unknown"]);
    expect(ids(sortAccounts(candidates, { mode: "expiry", descending: true }, null, {}, now))).toEqual(["b", "a", "unknown"]);
  });

  it("waits for the last exhausted primary window, not the earliest reset", () => {
    const q = quota([{window:"5-hour",percent:100,resetsAt:"2026-11-08T11:00:00Z"},{window:"weekly",percent:100,resetsAt:"2026-11-10T10:00:00Z"}]);
    expect(accountSortMetrics(q, now).ready).toBe(Date.parse("2026-11-10T10:00:00Z"));
    expect(accountSortMetrics(quota([{window:"weekly",percent:90}]),now).ready).toBe(0);
    expect(accountSortMetrics(quota([{window:"weekly",percent:100}]),now).ready).toBeNull();
  });
  it("never establishes capacity from failed, missing, malformed, stale or incomplete windows", () => {
    for (const q of [undefined, {provider:"codex",error:"reconnect"}, quota([]), quota([{window:"weekly",percent:NaN}]), quota([{window:"weekly",percent:110}]), quota([{window:"weekly",percent:10,resetsAt:"2026-11-08T09:00:00Z"}])]) {
      expect(accountSortMetrics(q,now).ready).toBeNull(); expect(accountSortMetrics(q,now).capacity).toBeNull();
    }
    expect(accountSortMetrics(quota([{window:"weekly",percent:10}]),now,["weekly","5-hour"]).capacity).toBeNull();
  });
  it("ranks by the tightest remaining primary limit, excluding model-specific limits", () => {
    const q = quota([{window:"5-hour",percent:10},{window:"weekly",percent:75},{window:"spark",percent:100}]);
    expect(accountSortMetrics(q,now).capacity).toBe(25);
  });
  it("sorts usable accounts before blocked accounts and unknowns", () => {
    const quotas = {a:quota([{window:"weekly",percent:100,resetsAt:"2026-11-09T00:00:00Z"}]),b:quota([{window:"weekly",percent:30}])};
    expect(ids(sortAccounts(accounts,{mode:"ready",descending:false},"a",quotas,now))).toEqual(["b","a","unknown"]);
    expect(ids(sortAccounts(accounts,{mode:"capacity",descending:true},null,quotas,now))).toEqual(["b","a","unknown"]);
  });
  it("distinguishes known zero reset credits from unknown and sorts names naturally", () => {
    const quotas = {a:quota([],4),b:quota([],0)};
    expect(ids(sortAccounts(accounts,{mode:"resets",descending:true},null,quotas,now))).toEqual(["a","b","unknown"]);
    expect(ids(sortAccounts(accounts,{mode:"resets",descending:false},null,quotas,now))).toEqual(["b","a","unknown"]);
    expect(ids(sortAccounts(accounts,{mode:"name",descending:false},null,{},now))).toEqual(["unknown","a","b"]);
  });
  it("stores and validates view preferences independently for each workspace", () => {
    saveAccountSort("one",{mode:"resets",descending:true});
    expect(loadAccountSort("one")).toEqual({mode:"resets",descending:true});
    expect(loadAccountSort("two")).toEqual({mode:"active",descending:false});
    localStorage.setItem("orbilap.accountSort.one",JSON.stringify({mode:"injected",descending:true}));
    expect(loadAccountSort("one").mode).toBe("active");
  });
});
