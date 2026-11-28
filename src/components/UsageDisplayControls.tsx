import { type ReactNode } from "react";
import { accountWindowLabel } from "../accountPrefs";
import { limitGroups } from "../accountLimitGroups";
import { SettingsReveal } from "./ui/settings-reveal";
import { Checkbox } from "./ui/checkbox";
import { RadioGroup, RadioGroupItem } from "./ui/radio-group";
import { Switch } from "./ui/switch";
import codexMark from "../../src-tauri/icons/provider-codex.png";
import claudeMark from "../../src-tauri/icons/provider-claude.png";
import antigravityMark from "../../src-tauri/icons/provider-antigravity.png";

export const PROVIDER_MARKS = { codex: codexMark, claude: claudeMark, antigravity: antigravityMark };

/** Both display locations share reversible expansion and collapse. */
export function UsageLimitsReveal({ open, children }: { open: boolean; children: ReactNode }) {
  return <SettingsReveal open={open}>{children}</SettingsReveal>;
}

export function UsageProviderChoice({ provider, label, account, checked, disabled, accessibleName, accountLabel, onCheckedChange }: {
  provider: keyof typeof PROVIDER_MARKS; label: string; account?: ReactNode;
  checked: boolean; disabled: boolean; accessibleName: string; accountLabel: string;
  onCheckedChange: (checked: boolean) => void;
}) {
  return <label className="menubar-provider-choice" aria-disabled={disabled}>
    <span className="menubar-provider-mark" aria-hidden="true" style={{ maskImage: `url(${PROVIDER_MARKS[provider]})` }} />
    <span className="menubar-provider-identity"><span className="setting-name">{label}</span>
      {checked && account ? <span className="menubar-source-account" aria-label={accountLabel}>{account}</span> : null}
    </span>
    <Switch aria-label={accessibleName} checked={checked} disabled={disabled} onCheckedChange={onCheckedChange} />
  </label>;
}

/** Shared labels/layout: Menu bar is multiple choice, Floating is single choice. */
export function UsageLimitChoices({ provider, windows, selected, disabled, accessibleName, optionName, onCheckedChange, single = false }: {
  provider: string; windows: string[]; selected: readonly string[]; disabled: boolean; single?: boolean;
  accessibleName: string; optionName: (label: string) => string;
  onCheckedChange: (key: string, checked: boolean) => void;
}) {
  const choices = limitGroups(provider, windows).map(({ id, model, options }) => <div className="menubar-limit-group" key={id}>
      {model ? <span className="menubar-limit-model">{model}</span> : null}
      <div className="menubar-limit-choices">{options.map(({ key, label }) => <label className="checkbox-row menubar-check menubar-limit" key={key}>
        {single ? <RadioGroupItem value={key} aria-label={optionName(accountWindowLabel(key))} disabled={disabled} /> : <Checkbox aria-label={optionName(accountWindowLabel(key))} checked={selected.includes(key)} disabled={disabled}
          onCheckedChange={checked => { if (!disabled) onCheckedChange(key, checked === true); }} />}
        <span className="checkbox-label">{label}</span>
      </label>)}</div>
    </div>);
  return single ? <RadioGroup className="menubar-limit-options" aria-label={accessibleName} value={selected[0] ?? ""} disabled={disabled}
    onValueChange={key => { if (!disabled) onCheckedChange(key, true); }}>{choices}</RadioGroup>
    : <div className="menubar-limit-options" role="group" aria-label={accessibleName}>{choices}</div>;
}
