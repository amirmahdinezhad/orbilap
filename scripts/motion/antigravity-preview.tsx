// Explicit read-only fixture: no provider calls or account data.
import React from "react";
import { createRoot } from "react-dom/client";
import { AntigravityQuotaGroup, AntigravityQuotaGroups } from "../../src/components/AntigravityQuotaGroup";
import { AdditionalLimits } from "../../src/components/AccountUsagePreview";
import { applyDisplayPrefs, DEFAULT_DISPLAY_PREFS } from "../../src/displayPrefs";
import "../../src/index.css";
import "../../src/panel.css";
import "../../src/home.css";
import "../../src/surfaces.css";
import "../../src/orbilap.css";
const theme = new URLSearchParams(location.search).get("theme") === "light" ? "light" : "dark";
applyDisplayPrefs({ ...DEFAULT_DISPLAY_PREFS, theme });
const reset = (minutes: number) => new Date(Date.now() + minutes * 60000).toISOString();
const main = [
  { window: "Gemini Models · Weekly", percent: 30, resetsAt: reset(6 * 1440 + 11 * 60) },
  { window: "Gemini Models · 5-hour", percent: 1, resetsAt: reset(164) },
];
const extra = [
  { window: "Claude and GPT models · Weekly", percent: 50, resetsAt: reset(6 * 1440 + 14 * 60) },
  { window: "Claude and GPT models · 5-hour", percent: 0 },
];
createRoot(document.getElementById("root")!).render(<main className="home-accounts" style={{ maxWidth: 380, margin: "auto", padding: 12 }}>
  <article className="workspace-account account-card">
    <div className="workspace-account-row"><span className="row-title">Antigravity demo</span><span className="plan-badge">Pro</span></div>
    <AntigravityQuotaGroup windows={main} name="Gemini Models" accountName="Demo" />
    <AdditionalLimits windows={extra} accountName="Demo" showRemaining><AntigravityQuotaGroups windows={extra} accountName="Demo" /></AdditionalLimits>
  </article>
</main>);
