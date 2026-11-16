import { describe, expect, it } from "vitest";
import { accountSubscription, describePlan, isSubscriptionExpired } from "./subscriptions";

describe("subscription presentation", () => {
  it.each([
    ["opencode-go", "go", "Go", 10, "starter"],
    ["opencode-go", "go_plus", "Go Plus", 40, "plus"],
    ["chatgpt", "plus", "Plus", 20, "plus"],
    ["chatgpt", "prolite", "Pro", 100, "pro"],
    ["chatgpt", "pro", "Pro", 200, "max"],
    ["chatgpt", "pro_500", "Pro", 500, "ultra"],
    ["claude", "pro", "Pro", 20, "plus"],
    ["claude", "max_5x", "Max 5×", 100, "pro"],
    ["claude", "max_20x", "Max 20×", 200, "max"],
    ["chatgpt", "free", "Free", 0, "neutral"],
    ["chatgpt", "business", "Business", null, "business"],
    ["chatgpt", "enterprise", "Enterprise", null, "business"],
    ["chatgpt", "edu", "Edu", null, "business"],
    ["claude", "team", "Team", null, "business"],
    ["antigravity", "google-ai-plus", "Plus", null, "plus"],
    ["antigravity", "Google AI Pro", "Pro", null, "pro"],
    ["antigravity", "Google AI Pro (Trial)", "Pro (Trial)", null, "pro"],
    ["antigravity", "Google AI Ultra 5x", "Ultra 5x", null, "ultra"],
    ["antigravity", "Google AI Ultra 20x", "Ultra 20x", null, "ultra"],
    ["antigravity", "Ultra", "Ultra", null, "ultra"],
    ["antigravity", "Pro", "Pro", null, "pro"],
    ["antigravity", "Google AI Future Plan", "Future Plan", null, "neutral"],
    ["custom", "Google AI Pro", "Google AI Pro", null, "neutral"],
    ["chatgpt", "future_plan", "future_plan", null, "neutral"],
    ["chatgpt", "  ", "Plan unavailable", null, "neutral"],
  ])("presents %s %s without inventing unknown prices", (id, plan, label, price, tier) => {
    expect(describePlan({ id, service: "Test", plan })).toEqual({ label, price, tier });
  });

  it("supports other amounts and ignores invalid price metadata", () => {
    expect(describePlan({ id: "custom", service: "Custom", plan: "Premium", monthlyPriceUsd: 300 }).tier).toBe("max");
    expect(describePlan({ id: "custom", service: "Custom", monthlyPriceUsd: NaN }).price).toBeNull();
    expect(describePlan({ id: "custom", service: "Custom", monthlyPriceUsd: -10 }).price).toBeNull();
  });

  it("requires provider-confirmed ended access regardless of the billing date", () => {
    const now = Date.parse("2026-10-15T00:00:00Z");
    const base = { id: "chatgpt", service: "ChatGPT" };
    expect(isSubscriptionExpired({ ...base, expiresAt: "2026-10-15T00:00:00Z" }, now)).toBe(false);
    expect(isSubscriptionExpired({ ...base, expiresAt: "2000-01-01T00:00:00Z", status: "active" }, now)).toBe(false);
    expect(isSubscriptionExpired({ ...base, expiresAt: "2000-01-01T00:00:00Z", status: "unknown" }, now)).toBe(false);
    expect(isSubscriptionExpired({ ...base, expiresAt: "2026-10-15T00:00:01Z" }, now)).toBe(false);
    expect(isSubscriptionExpired({ ...base, status: "expired" }, now)).toBe(true);
    expect(isSubscriptionExpired({ ...base, status: "expired", expiresAt: "2099-01-01T00:00:00Z" }, now)).toBe(true);
    expect(isSubscriptionExpired({ ...base, expiresAt: "invalid" }, now)).toBe(false);
    expect(isSubscriptionExpired(base, now)).toBe(false);
    expect(isSubscriptionExpired(null, now)).toBe(false);
    expect(isSubscriptionExpired({ ...base, status: "active", billing: { paymentRequired: true, checkedAt: "2026-10-15T00:00:00Z" } }, now)).toBe(false);
  });

  it("never interprets an organization or account ID as a plan", () => {
    expect(accountSubscription("claude", "claude.ai", "Acme")).toBeNull();
    expect(accountSubscription("codex", "ChatGPT", "account_123")?.plan).toBeNull();
    expect(accountSubscription("codex", "API key", "plus")).toBeNull();
  });
});
