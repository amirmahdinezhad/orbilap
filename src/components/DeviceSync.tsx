import { useEffect, useId, useRef, useState } from "react";
import { prettyError, type QuotaSet, type SetupAccount } from "../api";
import { accountDevices, type DeviceAccount, type DeviceGroup, type DeviceOperation, type DeviceShares, type LinkedDevice } from "../deviceSync";
import { AddIcon, CapacityIcon, CopyIcon, DeviceIcon, RefreshIcon, SaveIcon, TrashIcon, WarningIcon } from "../icons";
import { AppModal } from "./AppModal";
import type { Enrollment } from "./AccountEnrollment";
import { ErrorToast } from "./Toast";
import { Button } from "./ui/button";
import { Tooltip } from "./ui/tooltip";
import { RadioGroup, RadioOption } from "./ui/radio-group";
import { useAccountClock } from "../useAccountClock";
import { deviceManagementEnabled } from "../deviceManagementAvailability";

const percent = new Intl.NumberFormat(undefined, { maximumFractionDigits: 2 });
const time = new Intl.DateTimeFormat(undefined, { dateStyle: "short", timeStyle: "short" });
const tokens = new Intl.NumberFormat();

export function DeviceSettingsEntry({ account, label, session, disabled, onBusyChange }: {
  account: DeviceAccount; label: string; session?: () => Promise<string>;
  disabled?: boolean; onBusyChange?: (busy: boolean) => void;
}) {
  const [open, setOpen] = useState(false);
  if (!deviceManagementEnabled) return null;
  return <>
    <Button type="button" size="sm" variant="secondary" className="device-settings-button" disabled={disabled}
      aria-label={session ? `Devices for ${label}` : undefined}
      onClick={() => setOpen(true)}><DeviceIcon size={16} />Devices</Button>
    {open ? <DeviceSettings account={account} label={label} session={session} onClose={() => setOpen(false)}
      onBusyChange={onBusyChange} /> : null}
  </>;
}

export function EnrollmentDeviceSettings({ draft, onBusyChange }: { draft: Enrollment; onBusyChange: (busy: boolean) => void }) {
  if (!deviceManagementEnabled) return null;
  const selected = draft.accounts.filter((account) => draft.selected.includes(account.id));
  if (!selected.length || draft.editing || draft.pending) return null;
  return <section className="enrollment-devices" aria-label="Device capacity">
    <h3>Device capacity</h3>
    {selected.map((account: SetupAccount) => <div className="device-row" key={account.id}>
      <strong dir="auto">{account.displayName ?? account.name}</strong>
      <DeviceSettingsEntry account={{ id: account.id, provider: account.provider }} label={account.displayName ?? account.name}
        session={draft.getSession} disabled={draft.busy} onBusyChange={onBusyChange} />
    </div>)}
  </section>;
}

function DeviceSettings({ account, label, session, onClose, onBusyChange }: {
  account: DeviceAccount; label: string; session?: () => Promise<string>;
  onClose: () => void; onBusyChange?: (busy: boolean) => void;
}) {
  const [group, setGroup] = useState<DeviceGroup | null>(null);
  const [quota, setQuota] = useState<QuotaSet | null>(null);
  const [mode, setMode] = useState<"create" | "join" | null>(null);
  const [name, setName] = useState("");
  const [endpoint, setEndpoint] = useState("");
  const [setupKey, setSetupKey] = useState("");
  const [joinCode, setJoinCode] = useState("");
  const [capacity, setCapacity] = useState("4");
  const [invitation, setInvitation] = useState<{ code: string; expiresAt: number } | null>(null);
  const [copied, setCopied] = useState(false);
  const [busy, setBusy] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const [revoked, setRevoked] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [editingShares, setEditingShares] = useState(false);
  const [confirm, setConfirm] = useState<LinkedDevice | null>(null);
  const lock = useRef(false);
  const keep = useRef<HTMLButtonElement>(null);
  const roster = useRef<HTMLHeadingElement>(null);
  const description = useId();
  const ready = useRef(false);
  useEffect(() => {
    ready.current = true;
    return () => { ready.current = false; onBusyChange?.(false); };
  }, [onBusyChange]);

  const run = async (operation: DeviceOperation) => {
    if (lock.current) return;
    lock.current = true;
    setBusy(true);
    onBusyChange?.(true);
    setError(null);
    try {
      const sessionId = await session?.();
      const state = await accountDevices({ ...account, sessionId }, operation);
      if (!ready.current) return;
      if (state.state === "connected") {
        setGroup(state.group);
        setCapacity((previous) => operation.action === "status" && group && Number(previous) !== group.capacity
          ? previous : String(state.group.capacity));
        setRevoked(false);
        if (operation.action === "status") setQuota(state.quota);
        if (operation.action === "create" || operation.action === "join") {
          setMode(null);
          setSetupKey("");
          setJoinCode("");
        }
        if (operation.action === "shares") setEditingShares(false);
        if (operation.action === "revoke") { setConfirm(null); requestAnimationFrame(() => roster.current?.focus()); }
      } else if (state.state === "invitation") {
        setInvitation(state);
        setCopied(false);
      } else {
        setGroup(null); setQuota(null); setInvitation(null);
        setRevoked(state.state === "revoked");
      }
      setLoaded(true);
    } catch (failure) {
      if (ready.current) setError(prettyError(failure));
    } finally {
      lock.current = false;
      if (ready.current) { setBusy(false); onBusyChange?.(false); }
    }
  };
  useEffect(() => { void run({ action: "status" }); }, []);
  const devices = group?.devices.filter((device) => device.revokedAt === null) ?? [];
  const count = devices.length;
  const isOwner = Boolean(group?.ownerDeviceId && group.ownerDeviceId === group.deviceId);
  const now = useAccountClock(group?.estimates?.map(estimate => new Date(estimate.validUntil).toISOString()));
  const estimates = group?.estimates?.filter(estimate => estimate.validUntil > now) ?? [];
  const selection = Number(capacity);
  const validCapacity = Number.isInteger(selection) && selection >= Math.max(1, count) && selection <= 64;
  const visibleWindows = quota?.error ? [] : (quota?.windows ?? []).filter(window => Number.isFinite(window.percent));
  const resetMode = () => { setMode(null); setSetupKey(""); setJoinCode(""); setError(null); };
  return <AppModal open title="Devices" cardClass="device-settings" onClose={onClose}
    busy={busy} busyMessage="Updating device settings…" detail={<p className="device-account-label" dir="auto">{label}</p>}>
    {!confirm && !editingShares && error ? <ErrorToast message={error} /> : null}
    {!loaded ? <div className="device-toolbar">
      {busy ? <p role="status">Checking device connection…</p> : <Button size="sm" onClick={() => void run({ action: "status" })}>
        <RefreshIcon size={15} />Retry</Button>}
    </div> : group ? <>
      <div className="device-toolbar">
        <h3 ref={roster} tabIndex={-1}>{count} of {group.capacity} devices</h3>
        <Tooltip content="Refresh devices"><Button size="icon-sm" variant="ghost" aria-label="Refresh devices"
          disabled={busy} onClick={() => void run({ action: "status" })}><RefreshIcon size={15} /></Button></Tooltip>
      </div>
      <div className="device-toolbar">
        <p className="device-muted">{group.ownerDeviceId ? isOwner ? "You manage this group." : "View only · The owner manages this group."
          : "Update the device server to manage this group."}</p>
        {isOwner ? <Button size="sm" variant="secondary" disabled={busy} onClick={() => { setError(null); setEditingShares(true); }}>
          <CapacityIcon size={16} />Edit shares</Button> : null}
      </div>
      <ul className="device-roster">
        {devices.map((device) => {
          const usage = estimates.filter(estimate => estimate.deviceId === device.id);
          const over = usage.some(estimate => estimate.share !== null && estimate.percent > estimate.share);
          const share = group.shares === null ? 100 / Math.max(1, count) : group.shares[device.id];
          return <li key={device.id} className="device-roster-item">
            <div className="device-row"><DeviceIcon size={16} /><div className="device-name">
              <strong dir="auto">{device.name}</strong>
              <span>{device.id === group.deviceId ? "This Mac" : `Synced ${time.format(device.lastSeen)}`}
                {device.id === group.ownerDeviceId ? " · Owner" : ""}</span>
            </div>
            {isOwner && device.id !== group.deviceId && over ? <Button variant="secondary" size="sm"
              aria-label={`Revoke access for ${device.name}`} disabled={busy} onClick={() => setConfirm(device)}>
              <TrashIcon size={16} />Revoke</Button> : null}</div>
            <p className="device-muted">{share === undefined ? "Share not assigned" : `Assigned share: ${percent.format(share)}%`}</p>
            {visibleWindows.map((window) => {
              const resetsAt = Date.parse(window.resetsAt ?? "");
              const sample = device.samples.find(item => item.window === window.window && item.resetsAt === resetsAt);
              return sample && !usage.some(item => item.window === sample.window && item.resetsAt === sample.resetsAt)
                ? <p className="device-usage" key={window.window}>{window.window} · {tokens.format(sample.tokens)} local tokens</p> : null;
            })}
            {usage.length ? usage.map(estimate => <p className="device-usage" key={estimate.window}>
              <span>{estimate.window} · Estimated {percent.format(estimate.percent)}% of limit</span>
              {estimate.share !== null && estimate.percent > estimate.share ? <strong className="device-overage"><WarningIcon size={14} />Over share</strong> : null}
            </p>) : <p className="device-muted">Device estimate unavailable</p>}
          </li>;
        })}
      </ul>
      <section className="device-quota" aria-label="Official account usage">
        <h3>Official account usage</h3>
        {visibleWindows.length ? visibleWindows.map((window) => <div className="device-row" key={window.window}>
          <span>{window.window}</span><strong>{percent.format(window.percent)}% used</strong>
        </div>) : <p className="device-muted">{session ? "Available after saving the account." : "Refresh to load the account limits."}</p>}
        {quota?.asOf ? <p className="device-muted">Observed {time.format(new Date(quota.asOf))}</p> : null}
        {account.provider === "codex" ? <p className="device-muted">Share alerts use estimates from matching local Codex reports. Model, cache and activity outside this group can affect them.</p>
          : <p className="device-muted">This provider reports account usage only. Device share alerts require estimates.</p>}
      </section>
      {isOwner ? <>
      <form className="workspace-form device-form" onSubmit={(event) => {
        event.preventDefault();
        if (validCapacity && selection !== group.capacity) void run({ action: "capacity", capacity: selection });
      }}>
        <label>Device capacity<input type="number" min={count} max={64} required value={capacity} disabled={busy}
          onChange={(event) => setCapacity(event.target.value)} /></label>
        {capacity !== String(group.capacity) ? <div className="action-row">
          <Button type="button" variant="secondary" size="sm" disabled={busy} onClick={() => setCapacity(String(group.capacity))}>Cancel</Button>
          <Button type="submit" size="sm" disabled={busy || !validCapacity}><SaveIcon size={16} />Save capacity</Button>
        </div> : null}
      </form>
      <Button size="sm" variant="secondary" disabled={busy || count >= group.capacity}
        onClick={() => void run({ action: "invite" })}><AddIcon size={16} />Invite a device</Button>
      {count >= group.capacity ? <p className="device-muted">Increase capacity or revoke a device to invite another Mac.</p> : null}
      {invitation ? <div className="workspace-form device-form">
        <label>One-time invitation<input readOnly value={invitation.code} onFocus={event => event.currentTarget.select()} /></label>
        <div className="device-toolbar"><span className="device-muted">Expires {time.format(invitation.expiresAt)}</span>
          <Button size="sm" variant="secondary" disabled={busy} onClick={() => {
            if (!navigator.clipboard) { setError("Select the invitation text to copy it."); return; }
            void navigator.clipboard.writeText(invitation.code).then(() => setCopied(true)).catch(() => setError("Select the invitation text to copy it."));
          }}><CopyIcon size={15} />{copied ? "Copied" : "Copy invitation"}</Button></div>
      </div> : null}
      </> : null}
    </> : mode ? <form className="workspace-form device-form" onSubmit={(event) => {
      event.preventDefault();
      if (mode === "create" && validCapacity) void run({ action: "create", name, endpoint, setupKey, capacity: selection });
      if (mode === "join") void run({ action: "join", name, invitation: joinCode });
    }}>
      <label>Device name<input autoFocus required maxLength={64} placeholder="Work Mac" value={name} disabled={busy} onChange={event => setName(event.target.value)} /></label>
      {mode === "create" ? <>
        <label>Device capacity<input required type="number" min={1} max={64} value={capacity} disabled={busy} onChange={event => setCapacity(event.target.value)} /></label>
        <label>Device server<input required placeholder="https://devices.example.com" value={endpoint} disabled={busy} onChange={event => setEndpoint(event.target.value)} /></label>
        <label>Server setup key<input required type="password" autoComplete="off" value={setupKey} disabled={busy} onChange={event => setSetupKey(event.target.value)} /></label>
      </> : <label>Invitation code<input required autoComplete="off" value={joinCode} disabled={busy} onChange={event => setJoinCode(event.target.value)} /></label>}
      <div className="action-row">
        <Button type="button" size="sm" variant="secondary" disabled={busy} onClick={resetMode}>Cancel</Button>
        <Button type="submit" size="sm" disabled={busy || !name.trim() || (mode === "create" ? !validCapacity || !endpoint.trim() || !setupKey.trim() : !joinCode.trim())}>
          <DeviceIcon size={16} />{mode === "create" ? "Create group" : "Join group"}</Button>
      </div>
      {mode === "create" ? <p className="device-muted">Use the address and setup key for your Orbilap device server.</p>
        : <p className="device-muted">Get a one-time invitation from the owner Mac.</p>}
    </form> : <>
      <p className="device-muted">{revoked ? "This Mac’s connection was revoked. Get a new invitation to reconnect."
        : "Connect your Macs to see usage and manage device access for this account."}</p>
      <div className="action-row">
        <Button size="sm" variant="secondary" onClick={() => setMode("join")}>Use invitation</Button>
        <Button size="sm" onClick={() => setMode("create")}><AddIcon size={16} />New group</Button>
      </div>
    </>}
    {editingShares && group && isOwner ? <DeviceShareEditor devices={devices} shares={group.shares} busy={busy} error={error}
      onClose={() => { setEditingShares(false); setError(null); }}
      onSave={(shares) => void run({ action: "shares", shares })} /> : null}
    {confirm ? <AppModal open title="Revoke device access?" cardClass="account-removal-card" role="alertdialog"
      descriptionId={description} initialFocusRef={keep} busy={busy} onClose={() => setConfirm(null)}>
      <p id={description} className="device-muted">This frees the slot for <strong dir="auto">{confirm.name}</strong> and stops Orbilap sync on that Mac. Provider sign-in is managed separately.</p>
      {error ? <ErrorToast message={error} /> : null}
      <div className="action-row confirmation-actions">
        <Button ref={keep} variant="secondary" disabled={busy} onClick={() => setConfirm(null)}>Cancel</Button>
        <Button variant="destructive" disabled={busy} onClick={() => void run({ action: "revoke", deviceId: confirm.id })}>
          <TrashIcon size={16} />{busy ? "Revoking…" : "Revoke access"}</Button>
      </div>
    </AppModal> : null}
  </AppModal>;
}

function DeviceShareEditor({ devices, shares, busy, error, onClose, onSave }: {
  devices: LinkedDevice[]; shares: DeviceShares | null; busy: boolean; error: string | null;
  onClose: () => void; onSave: (shares: DeviceShares | null) => void;
}) {
  const [mode, setMode] = useState(shares === null ? "equal" : "custom");
  const [fields, setFields] = useState(() => Object.fromEntries(devices.map(device => {
    const value = shares === null ? Math.floor(100 / devices.length) : shares[device.id];
    return [device.id, value === undefined ? "" : String(value)];
  })));
  const values = Object.entries(fields).filter(([, value]) => value !== "");
  const total = values.reduce((sum, [, value]) => sum + Number(value), 0);
  const valid = values.every(([, value]) => /^\d{1,3}$/.test(value) && Number(value) <= 100) && total <= 100;
  return <AppModal open title="Device shares" cardClass="device-settings" onClose={onClose} busy={busy}>
    <form className="workspace-form device-form" onSubmit={(event) => {
      event.preventDefault();
      if (mode === "equal") onSave(null);
      else if (valid) onSave(Object.fromEntries(values.map(([id, value]) => [id, Number(value)])));
    }}>
      <RadioGroup aria-label="Allocation method" value={mode} onValueChange={setMode} disabled={busy}>
        <RadioOption value="equal" label="Equal shares" description="Divide the limit among connected Macs." />
        <RadioOption value="custom" label="Custom shares" description="Assign a percentage to each Mac." />
      </RadioGroup>
      {mode === "custom" ? <>
        {devices.map(device => <label className="device-share-input" key={device.id}>
          <span dir="auto">{device.name}</span>
          <input type="number" inputMode="numeric" min={0} max={100} step={1} aria-label={`Share for ${device.name} (%)`}
            value={fields[device.id] ?? ""} disabled={busy} onChange={event => {
              const value = event.target.value;
              setFields(previous => ({ ...previous, [device.id]: value }));
            }} />
        </label>)}
        <p className="device-muted" role="status">{valid ? `${100 - total}% unassigned` : "Shares must total at most 100%."}</p>
      </> : null}
      {error ? <ErrorToast message={error} /> : null}
      <div className="action-row">
        <Button type="button" size="sm" variant="secondary" disabled={busy} onClick={onClose}>Cancel</Button>
        <Button type="submit" size="sm" disabled={busy || (mode === "custom" && !valid)}>
          <SaveIcon size={16} />Save shares</Button>
      </div>
      <p className="device-muted">Shares apply to each usage window. A blank share leaves that Mac unassigned.</p>
    </form>
  </AppModal>;
}
