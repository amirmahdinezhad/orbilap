import { PROVIDER_MARKS, UsageProviderChoice, UsageLimitChoices, UsageLimitsReveal } from "./UsageDisplayControls";
import { ErrorToast } from "./Toast";
import { useEffect, useId, useState } from "react";
import { antigravityAccountQuota, claudeProfileQuota, codexProfileQuota, prettyError, type SetupAccount, type QuotaSet } from "../api";
import { accountWindows, canonicalAccountWindow, codexAccountPreferences } from "../accountPrefs";
import { DEFAULT_CODEX_ACCOUNT_PREFERENCES, type AppSettings, type ClaudeProfile, type CodexProfile, type Workspace, type WorkspaceUsage } from "../types";
import { accountInitials } from "./AccountIdentity";
import { activeProviderAccountId } from "../accountActivity";
import orbilapMark from "../../src-tauri/icons/tray-template.png";
import { LoadingRing } from "./ui/loading-ring";
import { Switch } from "./ui/switch";
import { RadioGroup, RadioOption } from "./ui/radio-group";
import { SettingsDisclosure } from "./ui/settings-disclosure";


function MenuBarSample({ style, remaining }: { style: NonNullable<WorkspaceUsage["menuBarStyle"]>; remaining: boolean }) {
  if (style === "progress") return <span className="menubar-sample-bars" data-remaining={remaining}><i /><i /></span>;
  return <span className={style === "resetTimeline" ? "menubar-sample-timeline" : undefined}>
    <span>{remaining ? 72 : 28}<span className="menubar-sample-unit">%</span></span>
  </span>;
}

type MenuBarProps = {
  workspace: Workspace; app: AppSettings; accounts: CodexProfile[]; claudeAccounts: ClaudeProfile[]; googleAccounts: SetupAccount[];
  busy: boolean; onSave: (patch: Partial<WorkspaceUsage>) => Promise<unknown>;
};
type ProviderGroup = { id: NonNullable<WorkspaceUsage["menuBarProvider"]>; label: string; items: (CodexProfile | ClaudeProfile | SetupAccount)[] };

function MenuBarAppearance({ style, provider, initials, showAppLogo, showLogos, showInitials, remaining, busy, onSave }: {
  style: NonNullable<WorkspaceUsage["menuBarStyle"]>;
  provider: ProviderGroup["id"]; initials: string; showAppLogo: boolean; showLogos: boolean; showInitials: boolean; remaining: boolean;
} & Pick<MenuBarProps, "busy" | "onSave">) {
  const id = useId();
  return <section className="settings-section menubar-appearance" aria-label="Menu bar appearance">
      <figure className="display-preview menubar-preview" aria-label="Menu bar preview · Sample usage">
        <div className="menubar-preview-sample" aria-hidden="true">
          {showAppLogo ? <span className="menubar-preview-mark" style={{ maskImage: `url(${orbilapMark})` }} /> : null}
          {showLogos ? <span className="menubar-provider-mark" style={{ maskImage: `url(${PROVIDER_MARKS[provider]})` }} /> : null}
          {showInitials ? <bdi>{initials}</bdi> : null}
          <MenuBarSample style={style} remaining={remaining} />
        </div>
      </figure>
    <SettingsDisclosure title="Appearance" value={{ resetTimeline: "Reset timeline", percentages: "Percentages", progress: "Progress bars" }[style]}>
      <div className="menubar-format-title" id={`${id}-format`}>Display format</div>
      <RadioGroup className="menubar-format" orientation="vertical" aria-labelledby={`${id}-format`} aria-disabled={busy}
        onValueChange={(value) => { if (!busy) void onSave({ menuBarStyle: value as WorkspaceUsage["menuBarStyle"] }); }} value={style}>
        <RadioOption value="resetTimeline" label="Reset timeline" description="The line shrinks as reset approaches." />
        <RadioOption value="percentages" label="Percentages" description={remaining ? "Shows the percentage remaining." : "Shows the percentage used."} />
        <RadioOption value="progress" label="Progress bars" description="Bars show usage. Markers show reset timing." />
      </RadioGroup>
      <div className="menubar-appearance-options">
        <label className="setting-row"><span className="setting-text"><span className="setting-name">Show app logo</span>
          <span className="setting-desc" id={`${id}-app-logo`}>Always shown when no usage is displayed.</span></span>
          <Switch aria-label="Show app logo" aria-describedby={`${id}-app-logo`} checked={showAppLogo} aria-disabled={busy} onCheckedChange={(showAppLogo) => { if (!busy) void onSave({ showAppLogo }); }} />
        </label>
        <label className="setting-row"><span className="setting-name">Show provider logos</span>
          <Switch checked={showLogos} aria-disabled={busy} onCheckedChange={(showProviderLogos) => { if (!busy) void onSave({ showProviderLogos }); }} />
        </label>
        <label className="setting-row"><span className="setting-name">Show account initials</span>
          <Switch checked={showInitials} aria-disabled={busy} onCheckedChange={(showAccountName) => { if (!busy) void onSave({ showAccountName }); }} />
        </label>
      </div>
    </SettingsDisclosure>
  </section>;
}

function ProviderLimits({ group, account, workspace, app, busy, onSave }: Pick<MenuBarProps, "workspace" | "app" | "busy" | "onSave"> & { group: ProviderGroup; account: ProviderGroup["items"][number] }) {
  const provider = group.id;
  const [quota, setQuota] = useState<QuotaSet | null>(null);
  const accountId = account.id;
  useEffect(() => {
    let current = true;
    const read = provider === "codex" ? codexProfileQuota : provider === "claude" ? claudeProfileQuota : (id: string) => antigravityAccountQuota(id, true);
    void read(accountId).catch((e) => ({ provider, error: prettyError(e) } as QuotaSet)).then((quota) => { if (current) setQuota(quota); });
    return () => { current = false; };
  }, [provider, accountId]);
  if (!quota) {
    return <div className="menubar-provider-details">
      <p className="setting-note menubar-limits-loading" role="status"><LoadingRing size={12} />Loading {group.label} limits…</p>
    </div>;
  }
  const prefs = provider === "codex" ? codexAccountPreferences(app, accountId) : DEFAULT_CODEX_ACCOUNT_PREFERENCES;
  const reported = (quota.error ? [] : quota.windows ?? [])
    .filter((w) => provider !== "antigravity" || Number.isFinite(w.percent) && w.percent >= 0)
    .map((w) => canonicalAccountWindow(w.window) ?? w.window);
  const plan = provider === "codex" && "plan" in account ? account.plan?.trim().toLowerCase() : null;
  const defaultWindows = plan === "plus" ? ["5-hour"] : plan === "pro" ? ["weekly"] : ["5-hour", "weekly"];
  const defaults = workspace.usage.defaultMenuBarLimits
    ? defaultWindows.filter((kind) => reported.includes(kind))
    : [];
  const selected = workspace.usage.accountWindows?.[accountId]
    ?? (prefs.menuBarWindows.length ? prefs.menuBarWindows : defaults);
  const windows = provider === "codex" ? accountWindows(quota, { ...prefs, menuBarWindows: selected })
    : [...new Set(provider === "antigravity" && !quota.error ? reported : [...selected, ...reported])];
  // Keep targets independent of the saved selection order, including during quota outages.
  windows.sort((a, b) => {
    const duration = (label: string) => {
      const value = label.split(" · ").slice(-1)[0].toLowerCase();
      return { "5-hour": 300, weekly: 10080, monthly: 43200 }[value] ?? (/^[1-9]\d*[mhd]$/.test(value) ? Number(value.slice(0, -1)) * ({ m: 1, h: 60, d: 1440 }[value.slice(-1)] ?? 1) : Infinity);
    };
    return duration(a) - duration(b) || a.localeCompare(b);
  });
  return <div className="menubar-provider-details">
    <fieldset className="menubar-limits" aria-label={`${group.label} visible limits`}><legend className="sr-only">Visible limits</legend>
      <UsageLimitChoices provider={provider} windows={windows} selected={selected} disabled={busy}
        accessibleName={`${group.label} menu bar limits`} optionName={label => `Show ${account.name} ${label} limit`}
        onCheckedChange={(kind, enabled) => void onSave({ accountWindows: { ...workspace.usage.accountWindows, [account.id]: enabled ? [...selected, kind] : selected.filter(w => w !== kind) } })} />
      <ErrorToast message={quota.error} />
      {!windows.length ? <p className="setting-note" role="status">No limits reported for this account.</p> : null}
    </fieldset>
  </div>;
}

/** Each selected provider follows its own active workspace login. */
export function WorkspaceMenuBar({ workspace, app, accounts, claudeAccounts, googleAccounts, busy, onSave }: MenuBarProps) {
  const groups: ProviderGroup[] = [
    { id: "codex" as const, label: "Codex", items: accounts.filter((p) => workspace.accountIds.includes(p.id)) },
    { id: "claude" as const, label: "Claude", items: claudeAccounts.filter((p) => workspace.claudeAccountIds == null || workspace.claudeAccountIds.includes(p.id)) },
    { id: "antigravity" as const, label: "Antigravity", items: googleAccounts.filter((p) => workspace.antigravityAccountIds?.includes(p.id)) },
  ].filter((group) => group.items.length > 0);
  const legacy = groups.find((g) => g.id === workspace.usage.menuBarProvider) ?? groups[0];
  const selected = workspace.usage.menuBarProviders ?? (legacy ? [legacy.id] : []);
  const enabled = groups.filter((g) => selected.includes(g.id));
  const exampleGroup = enabled.find((g) => activeProviderAccountId(g.id, workspace, g.items));
  const account = exampleGroup?.items.find((p) => p.id === activeProviderAccountId(exampleGroup.id, workspace, exampleGroup.items));
  const prefs = exampleGroup?.id === "codex" && account ? codexAccountPreferences(app, account.id) : DEFAULT_CODEX_ACCOUNT_PREFERENCES;
  const showInitials = workspace.usage.showAccountName ?? prefs.showProfileLabel;
  const style = workspace.usage.menuBarStyle ?? "percentages";
  if (!groups.length) return <section className="settings-section"><h3 className="settings-subtitle">Menu bar</h3><p className="setting-note">Add an account to this workspace first.</p></section>;
  return <section className="settings-section workspace-menu-bar" aria-label="Menu bar limits">
    <MenuBarAppearance style={style} provider={(exampleGroup ?? enabled[0] ?? groups[0]).id}
      initials={account ? accountInitials(account.name) : "AC"} showInitials={showInitials}
      showAppLogo={workspace.usage.showAppLogo ?? true} showLogos={workspace.usage.showProviderLogos ?? true} remaining={workspace.usage.showRemaining}
      busy={busy} onSave={onSave} />
    <div className="display-provider-section">
    <h3 className="settings-subtitle">Providers & limits</h3>
    <div className="settings-group menubar-providers">
      {groups.map((group) => {
        const activeId = activeProviderAccountId(group.id, workspace, group.items);
        const active = group.items.find((p) => p.id === activeId);
        const checked = selected.includes(group.id);
        return <div className="menubar-provider" key={group.id}>
        <UsageProviderChoice provider={group.id} label={group.label} checked={checked} disabled={busy}
          accessibleName={`Show ${group.label} in menu bar`}
          accountLabel={enabled.length > 1 ? `${group.label} active account` : "Menu bar active account"}
          account={active ? <><span className="sr-only">Active account</span><bdi>{active.name}</bdi></> : `No active ${group.label} account.`}
          onCheckedChange={value => void onSave({ menuBarProviders: (["codex", "claude", "antigravity"] as const).filter(id => id === group.id ? value : selected.includes(id)), displayMode: "active" })} />
        <UsageLimitsReveal open={checked && !!active}>{checked && active ? <ProviderLimits key={JSON.stringify([workspace.id, active.id])} group={group} account={active} workspace={workspace} app={app} busy={busy} onSave={onSave} /> : null}</UsageLimitsReveal>
      </div>; })}
    </div>
    </div>
    {!enabled.length ? <p className="setting-note">Select a provider to show usage in the menu bar.</p> : null}
  </section>;
}
