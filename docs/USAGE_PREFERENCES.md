# Usage preferences

Orbilap renders menu-bar usage as numeric percentages or horizontal progress
bars, selected per workspace. The existing tray panel remains mounted between
clicks; no embedded release assets or new port are used during development.

## Workspace controls

Workspace settings has General, Usage and Menu bar tabs. Account cards provide separate
rename/removal settings; connection recovery opens its own popup from Usage.
Add account handles new saved logins. Removing the Accounts tab retains every
saved credential and workspace membership.

Display switches default to on. Menu bar usage starts with a provider
picker restricted to providers with accounts in the current workspace, then a
single-account picker. There is no all-accounts option. `usage.menuBarAccountId`
persists that choice; a missing or removed choice falls back to the provider’s
active workspace member, then its first member. Limit toggles belong only to
that account and use its reported or previously learned limit buckets.
Workspace `usage.accountWindows` overrides older account-level window selections.
Empty selections display no percentages. A provider outage preserves selections
and renders missing values as unavailable rather than borrowing another login.

Global settings has General and Updates tabs. General contains the dark/light/system Theme choice and launch/focus/refresh controls. Menu-bar controls live in Workspace settings → Menu bar. The account picker is
followed by Show account initials: `usage.showAccountName` toggles the caption
on the left of percentages or bars, formatted as first/last initials (Emma Brooks → EB).
The tooltip retains the full name.

`usage.menuBarStyle` selects `percentages` (the backwards-compatible default)
or `progress`. Progress renders one horizontal bar per selected limit, stacked
vertically within the same native menu-bar height. A single enabled limit uses a larger 96×22px bar at 2× native scale;
multiple limits use 72px-wide bars stacked within the same menu-bar height. Fill uses the workspace’s remaining/used preference;
warning colors still follow consumed capacity. Missing data renders an
unavailable dash on its track, distinct from a genuine zero. Full values and
limit names remain in the tooltip. Initials stay left-aligned in both styles. No underline is drawn in either mode.

The normal menu-bar tint comes from the active workspace accent, including
initials, limit labels, all available values, progress fills/tracks and the logo.
An accent edit repaints the cached sample immediately. It overrides account
colors for menu-bar presentation only; saved account colors are not rewritten.
Unavailable values keep their muted treatment, and time markers stay neutral.

`usage.warningColors` is the single Limit colors switch. When enabled, only
less than 15% remaining (strictly more than 85% consumed) turns the menu bar red,
using the most consumed selected valid limit. At exactly 15% remaining or above,
keep the normal color. No intermediate colors or configurable levels remain.
Legacy `usage.warningThresholds` values are retained for compatibility but ignored,
including an empty list. Turning the switch off restores normal colors.
Initials, values, window labels, tracks/fills and the tray mark share the hue.
Usage threshold notifications, session-reset alerts and their persisted history
have been removed. Old notification settings are ignored and omitted on save.
Changing colors or captions preserves the cached sample for immediate repaint.
Automatic switching remains
Codex-only, requires explicit source and destination membership, and accepts a
whole-number `usage.autoSwitchRemaining` from 0–100, defaulting to 2. A target
must have more remaining capacity than that threshold in every current window.

The browser success page for CLI-owned Codex login is supplied by Codex itself;
its HTML/title is not an asset of Orbilap.

## Persisted settings

The native settings file retains the existing `refreshIntervalSecs`,
`usageShowRemaining`, `menuBarEnabled`, `menuBarProvider` and `menuBarWindow` fields.
New nested fields are filled from defaults when reading older files.

All percentage displays default to remaining capacity: 100% at the start,
decreasing toward 0% as capacity is consumed. Workspace Usage → Show capacity
remaining controls the workspace menu-bar wording. Legacy popup wording
preferences remain in storage. Existing saved choices are preserved; missing `usageShowRemaining`
values default to `true`. The menu-bar and multi-profile remaining switches
also default to enabled and can be changed independently.

| Object | Fields and defaults |
| --- | --- |
| `usageAppearance` | `monochrome: true`, `showLabels: true`, `showRemaining: true`, `sessionEnabled: true`, `weeklyEnabled: false`, `showTimeMarker: true`, `colorMarkerByPace: true`, `paceAwareColors: false` |
| `multiProfile` | `enabled: false`, `selectedIds: []`, `showWeekly: false`, `showProfileLabel: true`, `monochrome: true`, `showRemaining: true`, `showActiveIndicator: true` |
| `autoSwitchEnabled` | `false` |
| `codexReset` | `showProbableResets: true`, `refetchIntervalSecs: 300` (30–3600 seconds) |

Thresholds are sorted, deduplicated and limited to integers from 1 to 100.
Profile selections retain valid UUIDs. Refresh cadence remains 10–300 seconds.
The existing popup wording preference is independent of menu-bar wording. Codex
always shows remaining capacity, rounded to the nearest whole percent with
half points rounded up (6.5% becomes 7%) in both the popup and native tray.

## Usage bars and pace

Known 5-hour and weekly windows derive elapsed time from their reset timestamp
and duration. Projected usage is consumed percentage divided by the elapsed
fraction. During the first 1% of a period, projection is unavailable. Missing,
expired, malformed or out-of-duration resets have no marker/projection.

Colors use consumed capacity: green below 75%, yellow at 75%, orange at 90%, red
at 95%. Pace-aware bars substitute projected end-of-period usage and add purple
at 125%. Remaining wording inverts the displayed percentage, while status colors
continue to describe consumed capacity. The marker follows the same direction
as the bar and always uses a neutral color; no elapsed-time description is
shown below the bar.
`colorMarkerByPace` remains in saved settings for compatibility but no longer
colors the tick. Menu-bar percentage colors use current consumed capacity.

## Background monitoring

The native monitor polls while menu-bar display or an explicitly enrolled
automatic switch cycle needs quota. No alert-only quota probes or usage-alert
history remain. Auto-switch status notifications are separate and retained.

Auto-switch requires the active Codex session to reach the workspace’s remaining-capacity threshold (default 2% left, or 98% used) with a current reset
timestamp. It walks saved accounts in order, skips unavailable/exhausted session
limits and exhausted known weekly limits, then schedules the existing graceful
immediate Codex restart with active-work confirmation. It attempts at most once per active-account/reset period
in the running monitor, including when the user cancels. No suitable account
means no change. Restart, cancellation and failures retain the existing profile
activation safeguards. Anthropic profile selection uses its CLI launch command.

## Manual login import

Global settings → Updates restores manual checks, release notes, skipping,
progress and install/relaunch. Automatic checks default on for missing preferences
and preserve saved opt-outs. They run on launch and daily with Settings closed,
without downloading or installing. Unseen versions mark Settings and the Updates
tab; opening Updates acknowledges that version persistently. Download and install
remain separate explicit actions. Failed background checks stay quiet and retry
at the next daily opportunity or app launch, or manually when requested.
`orbilap.lastUpdateCheck` records successful checks.
Global reset changes app/display defaults without replacing workspaces or their
account membership, menu-bar settings or alert policies.

The Codex account screen reads current CLI metadata, rescans it, tests only the
Codex usage source, and accepts pasted auth.json. Manual import applies the same
native validator/private-file storage as file import. It saves a profile without
changing the active login. The pasted text is cleared after success and when the
screen closes; credentials are never returned over IPC or written to browser
storage. New profiles may omit their name; renames require a nonempty name.

## Public reset estimates

Workspace Usage has a `Show reset updates` master (`usage.showCodexResets`, default
true). Turning it off unmounts the provider notice and stops its requests.
One notice appears below the Codex heading, never inside each account card.
Upcoming announcements take priority, then confirmed resets from the last 24
hours, then optional possible-reset watches. Completion requires fresh source
metadata; an elapsed countdown alone never confirms a reset.
The dependent `Include reset predictions` toggle adds estimated chances and explicitly explains that predictions are unconfirmed. The independent saved
refetch interval defaults to five minutes; visibility defaults to enabled. The saved
interval controls both the frontend timer and shared native cache, including
failed requests. Announced resets remain visible when estimates are disabled.
Possible resets show the source probability and remaining forecast window, for
example `within 23h, tomorrow at 08:22`. The clock and relative day use the
device's timezone; the deadline is the source's watch expiry, not a confirmed
execution time. The countdown updates while open and disappears at expiry.
The close button persists dismissal of that watch across refetch/restart; an
odds-only update does not reopen it. A different watch can appear again.


## Switching to a limited account

A manual home-card Switch reads the destination's current quota before scheduling
a restart. Exhausted main limits open an Account limit reached warning with the
account name, email and reset countdown (or unavailable/checking-reset wording).
Cancel dismisses without changing anything. Switch anyway explicitly permits
that destination to exceed the capacity check for this restart job only, then
starts an immediate manual switch without a countdown. It is never a saved policy.

Scheduling errors remain inline and can be retried. Pending requests disable the
actions. Changing workspace or removing the destination dismisses the warning;
confirmation validates membership again. Quota errors still prevent scheduling.
The native preflight retains credential/session validation even with the override.
Automatic switches always reject exhausted targets and never pass this override.
Model/reserve buckets do not block the whole account.

After successful manual or automatic switching, a menu bar already displaying
that provider follows the newly active account. Other providers and inactive
workspaces keep their chosen display account. Explicit destination limit choices
remain intact; only unconfigured destinations inherit compatible enabled limits.
Initials use the same font size as percentage digits, retaining their left position.

## Running threads during switching

Both manual and automatic switches have zero grace. After validating the target
login, immediately before quit, Orbilap checks local desktop execution lifecycle
markers in rollout files held open by Codex’s own backend. Saved closed chats,
terminal-only sessions and completed/aborted turns do not count as running work.
A running turn opens a dark Thread in progress popup with Close and switch / Cancel.
An unverified probe instead explains that activity could not be confirmed. Both
pause indefinitely for the user’s decision; no account or app change happens
while waiting. Cancelling does not repeat the same automatic attempt that period.
The confirmation closes Codex gracefully and may interrupt work; it never force
kills a refusing app. Detection covers local desktop rollouts and is dependent on
the installed Codex version; it is not remote/cloud execution monitoring.

Warning yellow adapts to native system appearance: bright yellow (#FFD60A) for
dark surfaces, deeper amber (#8A5300) for light surfaces. Panel CSS theme remains
independent. Both variants exceed 4.5:1 contrast against their tested solid dark
and white backgrounds; translucent wallpaper-dependent surfaces can vary.

Native progress bars now include the same time-position marker as Usage limits
for known 5-hour/rolling and weekly periods with valid future reset timestamps.
The marker follows elapsed time in used mode and remaining time in remaining
mode, independently for each row. Its neutral dark/light outline remains legible
on warning colors and on the unfilled track. It appears in single and stacked
progress layouts; numeric rendering stays unchanged. Missing/expired/malformed
resets, resets farther away than their known period, and unknown durations
(including monthly) do not fabricate a marker, matching the Usage popup.

## Global panel shortcut

Settings → General → Keyboard shortcut controls a machine-wide, opt-in global
shortcut. It defaults off with Command–Shift–O suggested. Click the combination,
hold Command, Control or Option and press a supported key, then choose Save
shortcut. Cancel or Escape retains the previous choice. The switch enables or
releases the native registration immediately while preserving the saved key.
Preferences persist in `panelShortcut: { enabled, accelerator }` in the existing
private settings file. Changing the combination while disabled does not enable it.
Reset to defaults disables the shortcut and restores the suggested combination.

The shortcut opens the mounted tray panel, retaining the current workspace and
screen. On focused home it hides the panel and restores the previous foreground
application; home Escape uses the same path. Dialogs and busy flows stay intact.
Tab / Shift+Tab use normal focus traversal and the existing dialog focus traps.
Capture uses physical key codes so switching typing layouts does not change the
saved key location. Escape and Tab are reserved for cancellation/navigation.

Native registration happens before saving a new enabled combination. An
unavailable key keeps the previous registration and saved settings. A failed
settings write rolls back the registration. At launch, an unavailable saved
shortcut leaves the app usable and reports its error in General. Other global
settings updates preserve the shortcut. Shortcut IPC is restricted to the main
window; the plugin's arbitrary frontend registration commands are not enabled.

## Floating usage

Settings → Display → Floating selects services independently. Their individually selected
Floating limits are segments of one progress ring in one 60-point circle: Codex is white, Claude coral, Antigravity uses its solid brand blue #3186FF. Neighboring segments have a 7% circumference gap with round caps.
Order is stable clockwise from the top. Background stays pure black in both
themes and every interaction state. Native frame is 72 points including transparent padding for
all selection counts. The center shows only the transparent Orbilap glyph; percentages/account/limit
names remain in the accessibility description. The transparent Menu bar glyph remains centered without an app-icon tile. No provider logos, extra counts, modes or popouts.
Rails and gaps expose each segment’s full extent; endpoint dots are removed.
Progress ends are rounded. The center glyph uses static silver shading, no tile
background and proportionally scaled circular artwork.
Unknown/expired readings use muted unfilled tracks with a centered dash when all are unavailable. The existing remaining/used
preference determines each arc. Click to open the panel; drag the ring area.
The native monitor/cache, private positions and settings guards are unchanged.

Floating has no hover tooltips on sectors or the center. The main button keeps
its full accessible summary. Center glyph is 20pt; rails and progress retain
explicit rounded SVG arc ends.

Floating follows the active workspace Limit colors toggle and the same fixed
red rule: less than 15% remaining, regardless of remaining/used display direction.
At 15% or above, or with the toggle off, it keeps its provider color.
Unknown/expired data never produces warning fill. No additional polling or IPC.

Floating provider rows and ring sectors require an active account in the current
workspace. Saved defaults are not a login. Turning Show floating usage off disables
the provider controls and dims the preview. Unavailable providers are hidden while
their saved choices are retained. With no eligible selected provider, hide the orb.

Choose one Floating limit beneath each selected provider (Antigravity groups model
periods like Menu bar). The choice is independent of Menu bar and stays in private
machine preferences per provider. Existing settings keep the first Menu bar limit
until changed. Options come from the current monitor cache through main-only IPC;
no second quota poll or credential probe. Unavailable saved limits stay selected
and render an unfilled reading. Provider/toggle disabled and eligibility rules apply.
