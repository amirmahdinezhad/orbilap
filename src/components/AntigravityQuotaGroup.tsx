import type { QuotaWindow } from "../api";
import { AccountUsagePreview } from "./AccountUsagePreview";

/** Keep provider grouping and five-hour-first order within the standard home metrics. */
export function AntigravityQuotaGroup({ windows, name, accountName }: {
  windows: QuotaWindow[]; name: string; accountName: string;
}) {
  const periods = windows.map(window => ({ ...window, window: window.window.split(" · ").slice(-1)[0] }));
  const rank = (window: QuotaWindow) => /^(?:5-hour|5h)$/i.test(window.window) ? 0 : /^weekly$/i.test(window.window) ? 1 : 2;
  const label = name === "Gemini Models" ? "Gemini" : name === "Claude and GPT models" ? "Claude & GPT" : name;
  return <AccountUsagePreview windows={periods.sort((a, b) => rank(a) - rank(b))}
    accountName={`${accountName} · ${name}`} labelPrefix={label} showRemaining />;
}

export function AntigravityQuotaGroups({ windows, accountName }: { windows: QuotaWindow[]; accountName: string }) {
  const groups = new Map<string, QuotaWindow[]>();
  for (const window of windows) {
    const family = window.window.includes(" · ") ? window.window.split(" · ").slice(0, -1).join(" · ") : "Other limits";
    const name = /^(?:Claude & GPT \(shared\)|Claude and GPT models)$/i.test(family) ? "Claude and GPT models" : family;
    groups.set(name, [...(groups.get(name) ?? []), window]);
  }
  return <>{[...groups].map(([name, limits]) => <AntigravityQuotaGroup key={name} windows={limits} name={name} accountName={accountName} />)}</>;
}
