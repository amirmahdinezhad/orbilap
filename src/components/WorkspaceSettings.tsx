import { ErrorToast } from "./Toast";
import { CheckIcon } from "../icons";
import { useEffect, useId, useState, type ReactNode } from "react";
import { prettyError, setCodexAccountPreferences, updateWorkspace, antigravityAccounts, type SetupAccount } from "../api";
import { codexAccountPreferences } from "../accountPrefs";
import type { AppState, CodexProfilesState, Workspace, WorkspaceUsage, ClaudeProfile } from "../types";
import { Switch } from "./ui/switch";
import { Checkbox } from "./ui/checkbox";
import { RadioGroup, RadioGroupItem } from "./ui/radio-group";
import { TabsContent } from "./ui/tabs";
import { WorkspaceMenuBar } from "./WorkspaceMenuBar";

const EMPTY_CLAUDE_ACCOUNTS: ClaudeProfile[] = [];

function Row({ name, description, descriptionId, children }: { name: string; description?: string; descriptionId?: string; children: ReactNode }) {
  return <div className="setting-row"><div className="setting-text"><span className="setting-name">{name}</span>{description ? <span className="setting-desc" id={descriptionId}>{description}</span> : null}</div>{children}</div>;
}

function SwitchThreshold({ label, value, disabled, onSave }: { label: string; value: number; disabled: boolean; onSave: (value: number) => void }) {
  return <Row name="When remaining reaches">
    <span className="workspace-percent-control">
      <input aria-label={label} type="number" min="0" max="100" defaultValue={value} key={value} disabled={disabled} onBlur={event => {
        const raw = event.currentTarget.value;
        const next = Number(raw);
        if (raw && Number.isInteger(next) && next >= 0 && next <= 100 && next !== value) onSave(next);
      }} />
      <span aria-hidden="true">%</span>
    </span>
  </Row>;
}

interface Props {
  open: boolean; workspace: Workspace; state: AppState; profiles: CodexProfilesState | null;
  onChanged: (state: AppState) => void;
  onBusyChange: (busy: boolean) => void;
  claudeAccounts?: ClaudeProfile[];
}

/** Workspace usage and menu-bar panels within the shared Settings dialog. */
export function WorkspaceSettings({ open, workspace, state, profiles, claudeAccounts = EMPTY_CLAUDE_ACCOUNTS, onBusyChange, onChanged }: Props) {
  const [googleAccounts, setGoogleAccounts] = useState<SetupAccount[]>([]);
  useEffect(() => { if (!open) return; let current = true; void antigravityAccounts().then((a) => { if (current) setGoogleAccounts(a); }).catch(() => {}); return () => { current = false; }; }, [open, workspace.id]);
  const descriptionPrefix = useId();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const accounts = workspace.accountIds.map((id) => profiles?.profiles.find((p) => p.id === id)).filter((p) => !!p);
  const antigravityMembers = (workspace.antigravityAccountIds ?? []).map(id => googleAccounts.find(account => account.id === id)).filter(account => !!account);
  const antigravityRotation = workspace.usage.antigravitySwitchAccounts ?? [];
  useEffect(() => { onBusyChange(busy); }, [busy, onBusyChange]);
  const run = async (action: () => Promise<unknown>) => {
    if (busy) return;
    setBusy(true); setError(null);
    try { await action(); } catch (e) { setError(prettyError(e)); }
    finally { setBusy(false); }
  };
  const saveUsage = (patch: Partial<WorkspaceUsage>) => run(async () => onChanged(await updateWorkspace({ ...workspace, usage: { ...workspace.usage, ...patch } })));
  const toggle = (label: string, checked: boolean, patch: (value: boolean) => Partial<WorkspaceUsage>, description?: string) => {
    const descriptionId = `${descriptionPrefix}-${label.toLowerCase().replace(/ /g, "-")}`;
    return <Row name={label} description={description} descriptionId={descriptionId}><Switch aria-label={label} aria-describedby={description ? descriptionId : undefined} checked={checked} disabled={busy} onCheckedChange={(value) => void saveUsage(patch(value))} /></Row>;
  };
  const colorThresholds = workspace.usage.warningThresholds ?? [75, 90, 95];
  const colorLevels = [75, 90, 95];
  return <>
      {error ? <ErrorToast message={error} /> : null}
      <TabsContent value="usage" className="workspace-usage">
        <section className="settings-section" aria-labelledby={`${descriptionPrefix}-display`}>
          <h3 className="settings-subtitle" id={`${descriptionPrefix}-display`}>Usage display</h3>
          <RadioGroup className="usage-display-cards" aria-label="Usage display" value={workspace.usage.showRemaining ? "remaining" : "used"} disabled={busy} onValueChange={(value) => void saveUsage({ showRemaining: value === "remaining" })}>
            {([['remaining', 'Remaining', '72'], ['used', 'Used', '28']] as const).map(([value, label, percent]) => <RadioGroupItem className="menubar-style usage-display-card" key={value} value={value} aria-label={label}>
              <span className="usage-display-value" aria-hidden="true">{percent}<span>%</span></span>
              <span className={`usage-display-meter is-${value}`} aria-hidden="true"><i /></span>
              <span className="usage-display-label">{label}<CheckIcon className="usage-display-check" size={14} /></span>
            </RadioGroupItem>)}
          </RadioGroup>
        </section>
        <section className="settings-section" aria-labelledby={`${descriptionPrefix}-resets`}>
          <h3 className="settings-subtitle" id={`${descriptionPrefix}-resets`}>Codex resets</h3>
          <div className="settings-group usage-resets-group">
            {toggle("Show reset updates", workspace.usage.showCodexResets ?? true, (showCodexResets) => ({ showCodexResets }), "Announced and recently confirmed resets.")}
            <label className="checkbox-row usage-predictions">
              <Checkbox persistIndicator aria-label="Include predictions" aria-describedby={`${descriptionPrefix}-prediction-help`} checked={workspace.usage.showProbableResets} disabled={busy || !(workspace.usage.showCodexResets ?? true)} onCheckedChange={(checked) => void saveUsage({ showProbableResets: checked === true })} />
              <span><span className="setting-name checkbox-label">Include predictions</span><span className="setting-desc" id={`${descriptionPrefix}-prediction-help`}>Estimates only. Resets aren’t guaranteed.</span></span>
            </label>
          </div>
        </section>
        <section className="settings-section" aria-label="Automatic switching">
          <div className="settings-group">
            {toggle("Auto-switch accounts", workspace.usage.autoSwitchEnabled, (autoSwitchEnabled) => ({ autoSwitchEnabled }), "Switch when the active Codex account nears its usage limit.")}
            {workspace.usage.autoSwitchEnabled ? <>
              <SwitchThreshold label="Switch at remaining percent" value={workspace.usage.autoSwitchRemaining ?? 2} disabled={busy} onSave={autoSwitchRemaining => void saveUsage({ autoSwitchRemaining })} />
              <div className="usage-cycle" role="group" aria-labelledby={`${descriptionPrefix}-accounts`}>
                <span className="settings-subtitle" id={`${descriptionPrefix}-accounts`}>Accounts in rotation</span>
                {accounts.map((p) => { const prefs = codexAccountPreferences(state.app, p.id); const id = `${descriptionPrefix}-cycle-${p.id}`; return <label className="checkbox-row usage-account" key={p.id}><Checkbox persistIndicator id={id} aria-label={`Include ${p.name} in switch cycle`} checked={prefs.autoSwitch} disabled={busy || !p.connected && !prefs.autoSwitch} onCheckedChange={(checked) => void run(async () => onChanged(await setCodexAccountPreferences(p.id, { ...prefs, autoSwitch: checked === true })))} /><span className="checkbox-label">{p.name}</span>{!p.connected ? <small>Disconnected</small> : null}</label>; })}
                {accounts.length < 2 ? <p className="setting-note">Add at least two Codex accounts to use auto-switch.</p> : null}
              </div>
            </> : null}
          </div>
          {workspace.usage.autoSwitchEnabled ? <p className="setting-note">Switches start immediately. Orbilap asks before closing Codex if a thread is running.</p> : null}
        </section>
        {(workspace.antigravityAccountIds?.length || workspace.usage.antigravityAutoSwitch) ? (
          <section className="settings-section" aria-label="Antigravity automatic switching">
            <div className="settings-group">
              {toggle("Auto-switch Antigravity accounts", workspace.usage.antigravityAutoSwitch ?? false, (antigravityAutoSwitch) => ({ antigravityAutoSwitch }), "Switch when a Gemini limit on the active account runs low.")}
              {workspace.usage.antigravityAutoSwitch ? <>
                <SwitchThreshold label="Switch Antigravity at remaining percent" value={workspace.usage.antigravitySwitchRemaining ?? 2} disabled={busy} onSave={antigravitySwitchRemaining => void saveUsage({ antigravitySwitchRemaining })} />
                <div className="usage-cycle" role="group" aria-labelledby={`${descriptionPrefix}-antigravity-accounts`}>
                  <span className="settings-subtitle" id={`${descriptionPrefix}-antigravity-accounts`}>Accounts in rotation</span>
                  {antigravityMembers.map(account => (
                    <label className="checkbox-row usage-account" key={account.id}>
                      <Checkbox persistIndicator aria-label={`Include ${account.name} in Antigravity rotation`} checked={antigravityRotation.includes(account.id)} disabled={busy} onCheckedChange={(checked) => void saveUsage({
                        antigravitySwitchAccounts: checked === true ? [...antigravityRotation, account.id] : antigravityRotation.filter(id => id !== account.id),
                      })} />
                      <span className="checkbox-label">{account.name}</span>
                    </label>
                  ))}
                  {antigravityRotation.length < 2 ? <p className="setting-note">Select at least two Antigravity accounts.</p> : null}
                </div>
              </> : null}
            </div>
            {workspace.usage.antigravityAutoSwitch ? <p className="setting-note">After switching, reopen any running Antigravity or AGY session to use the new account.</p> : null}
          </section>
        ) : null}
      </TabsContent>
      <TabsContent value="menu-bar" className="menubar-settings">
        <section className="settings-section"><div className="settings-group">
          {toggle("Menu bar usage", workspace.usage.menuBarEnabled, (menuBarEnabled) => ({ menuBarEnabled }))}
        </div></section>
        {workspace.usage.menuBarEnabled ? <WorkspaceMenuBar workspace={workspace} app={state.app} accounts={accounts} claudeAccounts={claudeAccounts} googleAccounts={googleAccounts} busy={busy} onSave={saveUsage} /> : null}
        {workspace.usage.menuBarEnabled ? <section className="settings-section menubar-colors" aria-label="Limit colors"><div className="settings-group">
          {toggle("Change colors near limits", workspace.usage.warningColors ?? false, (warningColors) => ({ warningColors }))}
          {workspace.usage.warningColors ? <div className="workspace-limit-colors" role="group" aria-label="Color thresholds">
            <div className="menubar-thresholds">
              {colorLevels.map((level) => {
                const tone = level >= 95 ? "critical" : level >= 90 ? "high" : level >= 75 ? "warning" : "early";
                const name = level >= 95 ? "Critical" : level >= 90 ? "High usage" : level >= 75 ? "Warning" : "Early warning";
                const id = `${descriptionPrefix}-color-${level}`;
                return <label className={`menubar-threshold is-${tone}`} key={level}>
                  <span className="menubar-threshold-dot" aria-hidden="true" />
                  <span className="menubar-threshold-name" id={id}>{name}</span>
                  <span className="menubar-threshold-value">{level}% used</span>
                  <Switch aria-label={`Change color at ${level}% used`} aria-describedby={id} checked={colorThresholds.includes(level)} disabled={busy} onCheckedChange={(enabled) => void saveUsage({ warningThresholds: enabled === true ? colorLevels.filter((n) => n === level || colorThresholds.includes(n)) : colorLevels.filter((n) => n !== level && colorThresholds.includes(n)) })} />
                </label>;
              })}
            </div>

          </div> : null}
          <p className="setting-note">At each enabled level, the icon and usage change to the matching color.</p>
        </div></section> : <p className="setting-note">Turn on menu bar usage to choose its source and appearance.</p>}
      </TabsContent>
  </>;
}
