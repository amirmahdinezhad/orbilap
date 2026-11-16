/** Display metadata only; credential/token expiry is never subscription expiry. */
export interface Subscription {
  id: string;
  service: string;
  plan?: string | null;
  monthlyPriceUsd?: number | null;
  expiresAt?: string | null;
  status?: "active" | "expired" | "unknown" | null;
  billing?: SubscriptionBilling | null;
}

/** Payment state is independent from current subscription access. */
export interface SubscriptionBilling {
  paymentRequired: boolean;
  paymentDueAt?: string | null;
  gracePeriodEndsAt?: string | null;
  checkedAt: string;
}

/** The deadline shown on cards and used for subscription expiry sorting. */
export function subscriptionDeadline(subscription: Subscription | null | undefined): string | null {
  const deadline = subscription?.billing?.paymentRequired
    ? subscription.billing.gracePeriodEndsAt
    : subscription?.expiresAt;
  return deadline && Number.isFinite(Date.parse(deadline)) ? deadline : null;
}

export type PlanTier = "neutral" | "starter" | "plus" | "pro" | "max" | "ultra" | "business";

const GOOGLE_PLANS: Record<string, [string, number | null, PlanTier]> = {
  free: ["Free", 0, "neutral"],
  plus: ["Plus", null, "plus"],
  pro: ["Pro", null, "pro"],
  "pro_(trial)": ["Pro (Trial)", null, "pro"],
  "pro_(paid)": ["Pro (Paid)", null, "pro"],
  ultra: ["Ultra", null, "ultra"],
  ultra_5x: ["Ultra 5x", null, "ultra"],
  ultra_20x: ["Ultra 20x", null, "ultra"],
};

const PLANS: Record<string, Record<string, [string, number | null, PlanTier]>> = {
  chatgpt: {
    free: ["Free", 0, "neutral"], go: ["Go", null, "starter"], plus: ["Plus", 20, "plus"],
    prolite: ["Pro", 100, "pro"], pro_lite: ["Pro", 100, "pro"], pro_100: ["Pro", 100, "pro"],
    pro: ["Pro", 200, "max"], pro_200: ["Pro", 200, "max"], pro_500: ["Pro", 500, "ultra"],
    team: ["Team", null, "business"], business: ["Business", null, "business"],
    enterprise: ["Enterprise", null, "business"], edu: ["Edu", null, "business"],
  },
  claude: {
    free: ["Free", 0, "neutral"], pro: ["Pro", 20, "plus"], max: ["Max", null, "pro"],
    max_5x: ["Max 5×", 100, "pro"], max_20x: ["Max 20×", 200, "max"],
    team: ["Team", null, "business"], enterprise: ["Enterprise", null, "business"],
  },
  "opencode-go": { go: ["Go", 10, "starter"], go_plus: ["Go Plus", 40, "plus"] },
  antigravity: GOOGLE_PLANS,
};

/** Hide only provider-confirmed ended access; billing dates alone never prove it. */
export function isSubscriptionExpired(subscription: Subscription | null | undefined, _now?: number): boolean {
  return subscription?.status === "expired";
}

/** Known plans get a consistent value tier; new plans preserve the provider's label. */
export function describePlan(subscription: Subscription): { label: string; price: number | null; tier: PlanTier } {
  const isGoogle = PLANS[subscription.id] === GOOGLE_PLANS;
  const plan = subscription.plan?.trim();
  const raw = (isGoogle ? plan?.replace(/^google[\s_-]+ai[\s_-]+/i, "") : plan) || undefined;
  const key = raw?.toLowerCase().replace(/[\s-]+/g, "_") ?? "";
  const known = PLANS[subscription.id]?.[key];
  const supplied = subscription.monthlyPriceUsd;
  const price = supplied != null && Number.isFinite(supplied) && supplied >= 0 ? supplied : known?.[1] ?? null;
  const tier = price == null ? known?.[2] ?? "neutral"
    : price >= 500 ? "ultra" : price >= 200 ? "max" : price >= 100 ? "pro"
    : price >= 20 ? "plus" : price > 0 ? "starter" : "neutral";
  return { label: known?.[0] ?? raw ?? "Plan unavailable", price, tier: isGoogle && known ? known[2] : tier };
}

/** Older status payloads still supply plan names through `account`. */
export function accountSubscription(id: string, method: string | null | undefined, account?: string | null): Subscription | null {
  if (id === "codex" && method === "ChatGPT") {
    const key = account?.toLowerCase().replace(/[\s-]+/g, "_") ?? "";
    return { id: "chatgpt", service: "ChatGPT", plan: PLANS.chatgpt[key] ? account : null };
  }
  if (id === "claude" && method === "claude.ai" && account && PLANS.claude[account.toLowerCase()]) {
    return { id: "claude", service: "Claude", plan: account };
  }
  return null;
}
