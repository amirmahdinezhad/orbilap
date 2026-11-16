# Device management prototype

A device group gives one saved provider account a shared list of Macs in Orbilap.
The Mac that creates the group is its owner. Only that Mac can change capacity,
assign shares, invite and revoke. Other Macs can see the roster, shares and
usage. Capacity limits group membership. An offline Mac keeps its slot.

## Resume in a new chat

**Status: deferred on 2026-11-16.** The app keeps the code but hides every
Devices entry. Device IPC rejects requests before resolving account identity.
Account enrollment does not bind devices, and the monitor does not read device
links, sync usage or send notifications. Existing links, credentials, receipts
and coordinator databases are retained. The separately run coordinator is
available for isolated tests; the app does not launch it.

Use this prompt in a new Orbilap chat:

> Resume device management. Read docs/DEVICE-SYNC.md and use the grilling
> skill to settle the open decisions.

Start with the `grilling` skill and the decisions below. Check the repository
and tests for facts; bring product tradeoffs to the owner one round at a time.
Prepare the rollout only after the review is settled.

| Decision | Prototype behavior | Question for the review |
| --- | --- | --- |
| Ownership and recovery | Creating Mac owns the group. Legacy groups use the earliest active Mac. The coordinator checks owner credentials for every mutation. | How should the owner transfer control or recover a lost or offline Mac? |
| Allocation | Equal by connected count or custom whole percentages up to 100%. Unallocated shares can stay in reserve. A new Mac in custom mode starts unassigned. | How should changes take effect mid-window, and should unassigned Macs have a temporary default? |
| Attribution | Uses official account quota and local Codex token ratios from fresh, matching windows. Claude and Antigravity do not have device estimates. | Which coverage and accuracy are good enough to act on? How should model weighting, cached tokens, and untracked or cloud activity be shown? |
| Overage and revocation | Owner can revoke only with a current overage. This removes Orbilap access and frees the slot; provider sign-in is separate. | Should the owner also be able to remove a lost Mac, a Mac without telemetry or a Mac under its share? |
| Alerts | One notification per device and reset window, sent to the affected Mac and the owner. The app currently checks in the background. | Should alerts repeat or offer dismissal, quiet hours, or an in-panel history? How should stale or resolved alerts behave? |
| Setup and rollout | Self-hosted HTTPS coordinator, scoped invitations, SQLite migration and owner recovery still require validation on real hardware. | Who runs the server, and what setup, backup, abuse and upgrade paths belong in the first public release? |

### Code, design and verification

- The UI lives in [DeviceSync.tsx](../src/components/DeviceSync.tsx) and
  [deviceSync.ts](../src/deviceSync.ts). Its entry points are account settings,
  Add Accounts, workspace setup and verified batch imports. Use the shared
  radio rows and horizontal Cancel/Save and Cancel/Revoke rows. Only the owner
  sees management actions. Warn with the theme's existing threshold color,
  keep account quota separate from device estimates, and focus Cancel first
  in the revoke confirmation.
- [device_sync.rs](../src-tauri/src/device_sync.rs) handles the local link,
  native bridge, monitoring and alerts. [device_usage.rs](../src-tauri/src/device_usage.rs)
  collects Codex reports. [device-sync.mjs](../scripts/device-sync.mjs) is the
  coordinator and owns enrollment, capacity, shares and authorization.
- The parked switches are `deviceManagementEnabled` in
  [deviceManagementAvailability.ts](../src/deviceManagementAvailability.ts)
  and `ENABLED` in the native bridge. Keep both off for ordinary builds.
- Retained evidence: [2.5.0 device sync review](releases/2.5.0.security.md),
  [2.6.0 ownership and alerts notes](releases/2.6.0.md), and
  [2.6.0 security review](releases/2.6.0.security.md). These describe prototypes.
  Automated testing covers owner/reader permissions, legacy migration, capacity
  races, 10/90 shares, stale reports and alert recipients. It does not establish
  real cross-Mac delivery.
- Before re-enabling, test two physical Macs from enrollment through restart,
  migration, share changes, missing and stale reports, resets, alerts with the
  tray closed and revocation. Verify keyboard focus, pointer, reduced motion,
  and both themes at native tray width. Run the device, frontend, Rust and
  release security checks in [AGENTS.md](../AGENTS.md).

## Start the prototype server in an isolated environment

Use Node.js 22.13 or later on a machine the Macs can reach. Run the service under
a dedicated user and save its database on persistent local storage.

```sh
mkdir -m 700 -p ~/.orbilap-device-sync
(umask 077; openssl rand -hex 32 > ~/.orbilap-device-sync/setup.key)
ORBILAP_DEVICE_SETUP_KEY_FILE="$HOME/.orbilap-device-sync/setup.key" pnpm run device:serve
```

Run the key generation command only for initial setup or intentional rotation.
The service listens on `127.0.0.1:8788` by default. Front it with an HTTPS reverse
proxy on a hostname reachable by all the Macs, using a certificate they trust.
Forward only `POST /v1/devices` and preserve the JSON body and authorization
headers. Keep request-body and authorization logging off. HTTP connections from
Orbilap are allowed to literal loopback addresses for local testing only. Set
`ORBILAP_DEVICE_PORT` or `ORBILAP_DEVICE_DB` to override the server defaults. The
SQLite database defaults to `~/.orbilap-device-sync/devices.sqlite`. Back it up as
private account data.

## Prototype setup and flow

For an enabled internal prototype only:

1. Add or select a verified account. Open **Devices → New group**. Enter the
   server address, setup key, a device name and the maximum number of Macs.
2. Select **Invite a device**. On the other Mac, add the same provider account
   and choose **Devices → Use invitation**. Invitations work once and expire
   in 15 minutes. Send the code only to your own device.
3. On the owner Mac, open **Devices → Edit shares**. Equal shares divide each
   account window by the number of connected devices. Custom shares can assign
   10% to one Mac and 90% to another. The sum can be less than 100% to leave a
   reserve. Newly connected Macs have no custom share until the owner assigns one.
4. If a Mac has a current estimate above its share, the owner can select
   **Revoke**. Revoking blocks that Mac’s Orbilap sync credential and frees its
   slot. Manage its provider sign-in separately.

Creating or joining a group is a separate confirmed action during account
enrollment. If you exit enrollment after connecting the Mac, finish adding the
same provider account to resume its connection. The 2.6.0 prototype introduced owner controls. Restarting that coordinator on
an existing database migrates older groups. The earliest still-connected Mac becomes
their owner. Invitations issued by other Macs before the upgrade expire.
Back up the database before migration.

## Read consumption

Official percentages are for the entire account. For Codex, Orbilap can also
total input and output tokens in local, account-scoped sessions. All Macs need
records for the same 5-hour or weekly reset window to display an estimate.
Orbilap multiplies the official used percentage by each device's fraction of the
tracked tokens. It withholds that calculation when a report is missing or stale.
The total can miss cloud tasks and old or unavailable logs. Different models,
cache usage and task types can consume the provider allowance at different rates.

In Codex groups, the owner reports the official account-level percentage. The
coordinator compares each device’s estimate to its share when the owner’s quota
and all matching reports are fresh. It shows an overage in Devices and queues
one macOS notification per device and window on the affected Mac and owner Mac.
Orbilap must be running and allowed to send macOS notifications for delivery.

Claude and Antigravity show the roster, shares and account usage. Orbilap needs
per-device estimates to detect overages and allow usage-based revocation.
Provider credentials, prompts and transcripts stay on their Macs. The coordinator
stores device names, timestamps, allocation, aggregate Codex token counts,
official account percentages reported by the owner, and hashed account and device
identifiers.
