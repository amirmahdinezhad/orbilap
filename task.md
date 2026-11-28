# Orbilap 1.1.0 release preparation

2026-11-28 · Done; published with owner-accepted native verification limits.

Owner requested pushing all accumulated changes and publishing a new GitHub
release, then explicitly approved 1.1.0 and its reviewed notes, accepting the
disclosed native visual and installed-copy upgrade verification limits. Proposed minor version 1.1.0 includes the optional floating orb,
configurable global shortcut, update indicators, provider corrections and
Display settings refinements. Manifests synchronized; English notes and security
review are in docs/releases/1.1.0.md and 1.1.0.security.md.

Acceptance: push reviewed source; after owner approval of 1.1.0 and its notes,
tag the exact source, build/sign separate Apple Silicon and Intel packages,
verify both DMGs/updater archives and tamper rejection, publish through the
approved command, and confirm unauthenticated feed/downloads. Native visual
and installed-copy updater checks remain outstanding and are not claimed.

Published https://github.com/amirmahdinezhad/orbilap/releases/tag/v1.1.0
from tag v1.1.0 at e6ea03939e0cce2058455c45c58adf8e2caa2838. Both local
architecture builds, signed updater archives, compressed DMGs, checksums,
matching app binaries and tamper rejection passed. The approved publication
path reverified the downloaded draft and confirmed the unauthenticated public
feed plus both DMG/archive hashes. See the version security report for scope
and remaining owner-accepted native/upgrade/physical Intel limitations.

TypeScript, 551 Vitest tests, 20 script security tests, 8 release tests,
locked offline Cargo check and full Rust rerun passed (317 unit, 8 integration,
10 opt-in ignored). Initial loaded Rust run exceeded an existing 600ms loopback
test budget; unchanged isolated and full reruns passed. Security gate passed
again on synchronized 1.1.0 manifests; other-platform findings retained in report.
Frontend production JS/CSS gzip increased 10,794 bytes (4.6%) versus v1.0.4
with the same toolchain. Temporary comparison checkout removed.

Dev restart built 1.1.0 in 7.88s; fresh debug PID 88879 remains running.
Vite 5174 returned HTTP 200 and served the floating module; native WebKit PID
89008 connected before the 17:16:29 HMR touch. Native visual automation and
live browser DOM inspection unavailable/not performed; use only an existing
debug process for owner QA, never launch installed production by name.

# Display limit label spacing

2026-11-28 · Implemented; native visual acceptance Review.

Owner requested more space between Gemini and its limit options in both
Floating and Menu bar. The shared UsageLimitChoices grid now uses a 1rem
column gap (previously 6px), preserving aligned Gemini / Claude & GPT rows,
control geometry, selection and wrapping. Applied emil-design-eng and animate:
static spacing only; recorded in docs/DESIGN.md.

TypeScript passed. Full Vitest suite passed: 551 tests / 49 files, exit 0
(/tmp/orbilap-spacing-vitest.log). Initial runs were interrupted by concurrent
project dev restarts; the final run used two workers. Dev restart succeeded,
native build finished in 0.17s and fresh debug PID 78961 was observed running.
Vite returned HTTP 200 on 5174 and served the new gap. Native WebKit had an
established connection and CSS HMR updates were recorded at 17:10 Tehran.
Native UI inspection timed out; both-theme tray-width visual checks remain
unverified. Owner check: Settings → Display, compare Gemini label spacing in
Menu bar and Floating. Latest native dev app left running.

# Dev app relaunch after Quit

2026-11-21 · Done

**Acceptance criterion.** Choosing Quit Orbilap in the macOS dev app stops
the debug app and Vite. Both stay stopped until dev is started explicitly.

An isolated `launchctl submit` job exited successfully and still ran a second
time. Registering the dev supervisor with `RunAtLoad` enabled and `KeepAlive`
disabled keeps it independent of the invoking terminal and stops it after Quit.

The native webview invoked the same Quit command as the panel after startup
with both `pnpm run dev:restart` and `pnpm run run`. After 12 seconds, the
debug app and the listener on port 5174 were absent and launchd still reported
a single run. The installed Orbilap process was running throughout. The
TypeScript check and all 494 Vitest tests passed.

To repeat, run `pnpm run dev:restart`, choose Quit Orbilap from the dev panel,
and wait 12 seconds. `pnpm run dev:status` should report that dev has stopped.

# macOS menu-bar crash during usage refresh

2026-11-21 · Done

**Acceptance criterion.** Reset Timeline and Progress Bars render their
fractional fills and reset markers without aborting the native process.

macOS recorded `SIGABRT` for the installed Orbilap 1.0.2 at 22:11 and
22:20 Tehran time. Launching that bundle reproduced a Rust main-thread
panic from inverted floating-point clamp bounds. The installed workspace
uses Reset Timeline. Narrow timeline fills and fractional progress markers
both reached the same rounded-bar rasterizer. The renderer is identical
between the 1.0.2 and 1.0.3 tags.

The rasterizer now computes its clamp bounds relative to each bar's origin.
A synthetic narrow Reset Timeline fill aborted against the 1.0.2 renderer
and drew successfully after the change. The native Progress Bars regression
also failed before the fix and now checks the actual marker pixel.

TypeScript, 494 Vitest tests, offline Cargo check, and 299 locked offline
Rust tests passed. Ten opt-in Rust tests were skipped. Vite returned HTTP
200 on port 5174, Tauri built, and macOS reported the current dev panel
visible at tray width with a WebKit connection to Vite.
The same dev PID was still running 88 seconds after startup, with no new
Orbilap crash report during the observation.

The fix shipped in v1.0.4. Percentages bypasses the rounded bars in earlier
versions and can be selected under Settings → Menu bar.

# Orbilap 1.0.4 release review

2026-11-21 · Done

The proposed patch release includes the menu-bar crash fix and the dev
supervisor Quit fix. TypeScript, Vitest, locked offline Rust and release tests
passed. The security gate passed for both macOS architectures. The English
release notes and security review are in `docs/releases/`.

The owner approved v1.0.4. Commit `7108a7f` and its annotated tag were pushed.
Both single-architecture builds came from that tagged commit. The approved
publication command reran security checks, verified the draft assets and
published the release as latest. It confirmed public downloads and checksums
for both DMGs and both updater archives. Both signatures rejected modified
archives.

The native Settings → Updates test window showed 1.0.4 and reported that
the app was current. The updater downloaded the public release for a
disposable Apple Silicon 1.0.3 copy and installed 1.0.4 only after a separate
install call. Physical Intel execution and relaunch from the installed app
were outside this verification. The 1.0.4 native dev panel is running on
port 5174.

Public release: <https://github.com/amirmahdinezhad/orbilap/releases/tag/v1.0.4>.

# Codex plan-aware menu-bar defaults

2026-11-24 · Review (native visual check outstanding)

**Acceptance criterion.** With no explicit limit selection, a Codex Plus
account shows its reported 5-hour limit and a Pro account shows its reported
weekly limit. Provider logos and the app logo default on. Saved logo opt-outs
and explicit account/workspace limit selections survive unchanged.

The settings checkboxes and native tray now use the plan-specific defaults.
Unknown plans and other providers retain their reported-window defaults;
legacy workspaces with automatic limits disabled retain that preference.
The existing app-logo default, manual opt-out and empty-usage fallback remain.
No control geometry, theme tokens or motion changed. DESIGN.md records the rule.

**Verification.** TypeScript passed; all 496 Vitest tests in 45 files passed
on the final run. An earlier run passed the assertions but reported a React
scheduler callback after jsdom teardown; a complete rerun exited successfully.
The locked offline Rust suite passed 299 tests with 10 opt-in tests ignored.
Native renderer regressions exercise Plus/Pro selection, provider logos and
both app-logo states in all three display styles. Offline Cargo check and the
production frontend build passed. Compared with HEAD using the same build
command/dependencies, production JavaScript increased from 623,584 to 623,683
bytes (+99), or 198,222 to 198,271 gzip bytes (+49). The temporary baseline
checkout was removed.

The latest source is served on port 5174. A connected WebKit client and a fresh
HMR update for WorkspaceMenuBar.tsx were observed. The final clean dev restart
is left running. Direct native UI inspection was unavailable: the computer-use
service could not identify the standalone dev app, and browser preview returned
"native pipe closed before response". Visual checks in both themes, pointer
and keyboard interaction, and reduced-motion inspection remain for review.
No accounts or saved appearance choices were changed for verification.

**Owner check.** Open the dev tray panel → workspace settings → Menu bar.
For an account without a saved override, Plus should select only 5-hour and
Pro only Weekly. Both logo switches should start on. Switch either off and
reopen settings to verify persistence. Existing explicit selections stay as-is.

# Google paid-plan expiry reconciliation

2026-11-24 · Review (native account-panel verification unavailable)

**Acceptance criterion.** After an authenticated Google usage refresh confirms
`currentTier.id = free-tier` with no paid tier, the former Pro account leaves
the paid account list and the existing 30-second cleanup removes its workspace
references. Network/authentication errors, missing metadata, unknown tiers,
legacy tiers and exhausted quota must not revoke a saved connection.

The previous usage verification rejected non-paid accounts but discarded that
subscription observation, leaving the saved Pro metadata active indefinitely.
Identity-checked subscription observations now persist atomically in an
owner-only `subscription.json` inside the managed account home. Lists and the
existing expiry cleanup consume that state. Re-enrollment with a confirmed
paid plan replaces an older free observation. A paid tier takes precedence
over a free current tier; an explicit free-tier ID cannot masquerade as Pro
through its display name. No UI styling, controls, motion or frontend source
changed; no dependency or app-version changes were made.

Schema reference: Google's Gemini CLI `LoadCodeAssistResponse` and `UserTierId`
(<https://github.com/google-gemini/gemini-cli/blob/main/packages/core/src/code_assist/types.ts>),
reviewed 2026-11-24. Unknown/legacy values remain conservative rather than being
interpreted as expired access.

**Verification.** TypeScript passed; all 496 Vitest tests passed. Locked offline
Cargo check and all 300 Rust tests passed (10 opt-in tests ignored). The new
synthetic regression exercises Pro → free, stale index replacement, unknown
and error responses, renewal/re-enrollment, the actual expiry cleanup,
last-login cleanup and repeat cleanup. No live credentials were used as test
fixtures. Existing identity verification finishes before recording observations;
trusted HTTPS endpoints, per-request bearer tokens and error redaction remain.
The native development build succeeded and Vite returned HTTP 200 on port 5174.
The latest dev app is left running. Direct native inspection failed because
Sky Computer Use returned `native pipe closed before response`; live account
state and visual panel behavior remain unverified. No live private account data
was exported or manually edited. This task does not change frontend bundle size.

**Security.** `pnpm run test:security` passed all 19 tests.
`pnpm run security:check` passed policy checks, the JavaScript dependency audit
and redacted working-tree/history secret scans, but failed the macOS Rust audit
on existing dependencies: cookie 0.18.2 (RUSTSEC-2026-0594; fixed in >=0.18.3)
and url 2.5.8 (RUSTSEC-2026-0592; fixed in >=2.5.9). Dependency remediation
and a fresh full security gate are required before release. No release was
prepared or published. Independent Codex Security review was unavailable in
the current toolset.

**Owner check.** Open the development tray panel and refresh accounts with
Google reachable. When Google confirms free access, the former paid account
should disappear within the existing cleanup interval (30 seconds after the
response). A request error should preserve the connection. The installed
release is unchanged.


# Positive remaining quota displayed as zero

2026-11-25 · Review (direct native panel inspection unavailable)

**Acceptance criterion.** Positive remaining quota below 0.5% must display 1%,
and 100% or more used must display 0% remaining. The home card, accessible
meter, Codex usage dialog and native menu-bar labels agree. Existing rounding
above the minimum, used-mode behavior and exhaustion decisions are preserved.

**Implementation.** Nearest-integer rounding previously turned 0.1% remaining
into 0%. A shared frontend formatter and matching Rust formatter preserve a
minimum of 1 for positive remaining quota. Raw provider usage, sorting, warning
thresholds and reset/exhaustion logic remain unchanged. Existing uncommitted
workspace-default and Google subscription changes were preserved.

**Verification.** TypeScript passed; 45 Vitest files / 505 tests passed.
`cargo check --offline --locked` and `cargo test --offline --locked` passed:
293 unit tests plus 8 integration tests, with 10 opt-in tests ignored.
Regression cases cover 99.5, 99.51, 99.9, 99.999, 100 and 101 percent used
across the card/meter and native menu-bar labels; the dialog covers low
remaining values and true zero. `git diff --check` passed.

`pnpm run dev:restart` completed. Vite serves the updated AccountUsagePreview
on port 5174; the native build finished and fresh debug PID 19051 was observed.
A WebKit client had established connections to 5174 before touching the frontend
file; a fresh HMR update for AccountUsagePreview.tsx followed. Latest native dev
app is left running. Direct native inspection failed because Computer Use
could not target the standalone debug executable (bundle identifier resolves
to multiple packaged apps); browser preview failed with "native pipe closed
before response". The exact account value and both-theme native visual checks
could not be independently verified. No live account data was modified for QA.

**Skills.** Applied the installed Emil design-engineering guidance and animate's
motion gate: this is a numeric readout correction, so no new motion is needed.
Existing shared controls and theme/focus/pointer behavior are preserved.

**Owner check.** Open the development tray panel with the affected GPT account.
When the provider reports positive remaining capacity under half a percent,
the card and menu bar should show 1%; exhausted capacity should still show 0%.
Refresh the same account before comparing with GPT. This change is local only.

# Expire confirmed Codex reset notices

2026-11-25 · Review (direct native inspection unavailable)

**Acceptance criterion.** An upcoming reset notice disappears at its deadline.
Confirmed regular resets and banked credits never replace it with a history
banner, including after refresh or reopening the panel. Predictions observed
before a confirmed reset cannot reappear; a newer valid prediction or future
announcement remains eligible.

Removed the 24-hour confirmed-history banner from CodexResetNotice. Existing
notice controls, shared styles and immediate expiry behavior remain in place;
Emil's interaction review required no new motion. DESIGN.md records the rule.

**Verification.** TypeScript passed and all 508 Vitest tests in 45 files passed.
Regression coverage includes regular/banked deadlines, subsequent confirmation,
refresh/remount, stored history, older/newer predictions and future announcements.
Comparable production builds with identical current source/dependencies except
this component reduced JavaScript from 623,777 to 623,531 bytes (-246), and gzip
from 198,309 to 198,246 bytes (-63). Temporary comparison files were removed.
Vite served the changed component on port 5174; a connected WebKit client and
fresh HMR update were observed. Clean restart succeeded, the native dev build
completed and a fresh debug app PID was present. The app is left running.

Direct native visual checks in both themes and live browser snapshot remain
unverified: Computer Use timed out for Orbilap, its bundle ID was ambiguous and
the standalone debug executable was rejected as an app. Browser preview failed
with "native pipe closed before response". No account data was changed for QA.

**Owner check.** Open the development tray panel. The old Reset confirmed card
should be absent. Future reset notices should disappear when their countdown
reaches the deadline and remain absent after refreshing or reopening the panel.

# Antigravity shared quota presentation

2026-11-25 · Review (native visual verification outstanding)

**Acceptance criterion.** Match the owner's 25 November Antigravity quota
reference: Gemini Models shows Weekly Limit Remaining before Five Hour Limit
Remaining, with remaining percentages, circular meters and reset explanations.
Claude and GPT models appears inside Additional limits with the same order.
Use measured account-scoped values; missing readings never become 100% capacity.

**Implementation.** The Rust card parser now retains reported partner groups
instead of dropping third-party buckets. Catalog fallback retains available
Claude/GPT readings under their actual reported model names; it does not infer
shared capacity. The frontend preserves shared Gemini groups as the main view
and puts other reported groups in the existing disclosure. Carbon/Argon no
longer receive featured columns. A reusable provider-quota group owns row,
ring, deadline tooltip and skeleton geometry. No dependencies or account
credentials changed. Existing unrelated local work was preserved.

**Reference and design.** Owner screenshot and the official Plans documentation,
https://antigravity.google/docs/plans (read 25 November), which explicitly
identifies shared Gemini quota and five-hour/weekly limits. The screenshot
establishes the partner grouping and weekly-first presentation. Applied the
installed emil-design-eng and animate skills. Static quota data needs no new
motion; Additional retains its shared pointer animation, immediate keyboard
response and reduced-motion rules.

| Before | After | Why |
| --- | --- | --- |
| Featured Carbon/Argon columns | Reported shared Gemini Models rows | Match the provider's current shared quota presentation |
| Partner readings discarded | Claude and GPT models in Additional | Preserve measured partner capacity and reset information |
| Column skeleton | Matching row/ring skeleton | Keep loading geometry consistent with the final content |

**Verification.** TypeScript, all 508 Vitest tests in 45 files, and the production build passed. One full run passed its assertions but reported a React scheduler callback after jsdom teardown in CliProviders.test.tsx; the final complete rerun exited successfully. The locked offline
Rust suite passed 303 tests (including the isolated environment test and eight
CLI tests), with 10 opt-in tests ignored; locked offline Cargo check passed.
Security behavioral tests passed 19/19. The automated security gate passed JS
dependency audit, redacted working-tree/history secret scans and policy checks,
but failed the supported-target Rust audit on existing dependencies:
`cookie` 0.18.2 / RUSTSEC-2026-0594 (fixed in >=0.18.3) and `url` 2.5.8 /
RUSTSEC-2026-0592 (fixed in >=2.5.9). These remain unresolved and block release
approval; no release or version change was requested. New quota-parser fixtures
use synthetic data; provider requests, trusted endpoints, authentication,
account mutation commands and credential storage were not changed by this task.
Production JavaScript compared with the pre-task working tree increased from
623,531 to 624,635 bytes (+1,104), gzip 198,246 to 198,603 (+357), using the same
build command and dependencies. The standalone QA entry is excluded from normal
production builds.

The final clean dev restart succeeded on port 5174 with fresh native PID 67296.
Vite served the new quota component and explicit synthetic preview. A native
WebKit connection was established before touching the new component; Vite
logged its HMR update at 02:27:37. The Tauri log reports a successful dev build.
Direct visual inspection could not be completed: browser preview returned
"native pipe closed before response"; the native controller could not target
the unbundled dev binary and reported ambiguous installed bundle IDs. Both-theme
visual checks, native pointer/keyboard checks and reduced-motion visual checks
remain outstanding. No live account data was exported or screenshotted.

**Owner check.** Open the running dev tray panel and inspect an Antigravity
account. Gemini Models should show Weekly then Five Hour remaining with reset
countdowns. Expand Additional limits to see Claude and GPT models. Check both
themes, Tab focus on meters (exact reset tooltip), keyboard disclosure and
reduced motion. A read-only synthetic example is also available at
http://localhost:5174/scripts/motion/antigravity-preview.html; append
?theme=light for the light theme. No provider requests or account writes occur
on that fixture page.

# Antigravity home-card style correction

2026-11-25 · Review (native visual verification outstanding)

**Owner clarification.** Follow Antigravity's quota grouping while matching the
visual style of Orbilap's other cards. This supersedes the circular-meter and
bordered-row treatment in the preceding task.

**Acceptance criterion.** Shared Gemini limits use the existing home metric
columns, percentage typography, progress bars and reset tooltips. Weekly stays
before 5-hour. Claude/GPT shared limits stay in Additional with the same style.

**Implementation.** AntigravityQuotaGroup now delegates to AccountUsagePreview;
labels are Gemini · Weekly / 5-hour and Claude & GPT · Weekly / 5-hour. Removed
the bespoke circular-meter renderer, reset paragraphs and all related CSS.
All accounts use the standard loading skeleton. Provider grouping, measured
values and backend parsing remain as implemented in the preceding task.
The read-only synthetic preview now renders those same shared components.
Applied emil-design-eng and animate: reuse existing states and disclosure
motion; no additional animation or control overrides.

| Before | After | Why |
| --- | --- | --- |
| Circular meters and bordered rows | Existing home progress metrics | Match the owner's other account cards |
| Dedicated row skeleton | Standard account skeleton | Preserve shared loading and loaded geometry |

**Verification.** TypeScript and production build passed. JavaScript decreased
from 624,635 to 622,267 bytes (-2,368), gzip from 198,603 to 197,786 (-817),
compared with the immediately preceding working tree using the same build and
dependencies. No Rust, authentication or account-data behavior changed in this
correction. The previous task's dependency security findings remain recorded.
Final full-suite and live-dev evidence is recorded below.

**Owner check.** Open the Antigravity card in the dev tray panel and compare its
labels, percentages and progress bars with Codex/Claude. Expand Additional to
see Claude/GPT limits. Check both themes, meter tooltip focus and keyboard
expansion. Direct native visual verification remains unavailable through the
current UI tooling, as recorded in the preceding task.

Final checks: all 508 Vitest tests in 45 files passed; TypeScript passed. Clean
restart succeeded with native PID 72478, successful Tauri dev build and Vite
serving AccountUsagePreview from the updated Antigravity component on port
5174. WebKit had an established connection before the component was touched;
the resulting HMR update was recorded in /tmp/orbilap-vite-5174.log. The browser
preview retry again failed with "native pipe closed before response", so direct
visual inspection in both themes remains outstanding. The latest native dev
app is left running. git diff --check passed.

# Antigravity limit order

2026-11-25 · Review (native visual verification outstanding)

**Owner decision / acceptance criterion.** Show 5-hour before Weekly in both
the main shared Gemini metrics and the Additional Claude/GPT metrics. This
supersedes weekly-first ordering recorded above. Keep the standard card style.

The shared Antigravity group sorter now ranks 5-hour/5h, Weekly, then any other
reported periods. Existing integration assertions cover both main and Additional
order. No geometry, motion, theme, backend or saved preference changes.
DESIGN.md records the updated decision. Final checks follow below.

Checks: TypeScript, all 508 Vitest tests in 45 files and the production build
passed. Clean dev restart succeeded on 5174 with new native PID 74811 and a
successful Tauri build; the served component contains the five-hour-first
sorter. The latest dev app is left running. Native visual inspection remains
unverified because of the UI tooling failure recorded above.
A native WebKit connection was established before the final touch; Vite logged
the AntigravityQuotaGroup HMR update, confirming delivery to a connected client.

# Local owner-test package of pending changes

2026-11-26 · Review (owner installation and tray-panel testing outstanding)

**Request / acceptance criterion.** Produce a fresh local installable build of
pending changes so the owner can test before separately authorizing publication.
Keep the existing 1.0.4 version; do not push, tag or publish.

**Scope.** Existing workspace/menu-bar defaults, positive remaining-percent
rounding, expired Codex notices, confirmed-free Antigravity expiry cleanup and
shared Antigravity limits (5-hour then Weekly, partner limits under Additional).
Fixed the two previously recorded supported-target dependency audit findings:
cookie 0.18.3, url 2.5.9 and form_urlencoded 1.2.3 in Cargo.lock.

**Checks.** Frozen install; TypeScript; 508 Vitest tests; 19 security script tests;
8 release tests; release configuration check; locked offline Cargo check and
302 Rust tests passed (10 opt-in tests ignored). Fresh security gate passed for
both macOS architectures. Advisory/npm recheck confirmed picomatch 4.0.7 is still
latest and GHSA-fc5q-39xc-vjpf is withdrawn. Details and residual limits are in
`docs/releases/1.0.4.security.md` under the dated local-candidate section.

Clean dev restart succeeded, with Vite on 5174, successful native build and PID
33890. Served AntigravityQuotaGroup includes five-hour ordering. Native WebKit
was connected before a source touch; fresh HMR logged at 14:48:49 host time.
Direct visual/native account checks remain unavailable through current UI tools.
The first concurrent packaging process was stopped by dev restart cleanup;
packaging was rerun after restart. No installed app/account data was replaced.

**Owner test.** Quit the installed Orbilap before launching the fresh copy to
avoid single-instance forwarding. Install/open the Apple Silicon test DMG.
Check Antigravity Gemini and Additional limits show 5-hour before Weekly; compare
card and menu-bar percentages near exhaustion; confirm expired reset banners
stay absent after refresh/reopen. Check workspace menu-bar settings and both
themes. Review real account expiry only with disposable accounts. Report the
result before choosing a public version and authorizing publication.

**Artifact verification.** Fresh Apple Silicon DMG saved to
`release-artifacts/local-test-20261126-145007/Orbilap_1.0.4_test_20261126-145007_aarch64.dmg`
(8,192,190 bytes). `hdiutil verify` passed; the read-only mounted app passed
strict deep code-signature verification, contains only arm64, matches the built
binary byte-for-byte and includes both Assets.car and icon.icns. The temporary
verification mount was ejected. SHA256:
`88c8594084a9f282ae42a89fe9ec94a9da52ef97576e384e50e79f01f8900aae`.
The output folder includes local English test notes, build-input SHA256 manifest
and checksum. Final security gate, release configuration check and diff check
passed after recording the local candidate. No GitHub operations were performed.

# Omit expired Google accounts on first open

2026-11-26 · Review (real expired-account native verification outstanding)

**Owner report / acceptance criterion.** The local test package briefly showed
the expired Google card, then an expiry error without limits; manual Refresh
removed it. On first load, verify before revealing the card and omit a
confirmed-expired account automatically, without that intermediate error.

AntigravityAccounts now keeps the existing loading skeleton while visible
workspace accounts run their first parallel usage/plan checks. If a check
fails, it re-reads the native account list, whose persisted verified billing
state already excludes confirmed-expired accounts. Only that native list
controls removal: network/authentication errors and a failed list recheck
preserve the original account. Successful and failed readings are reused when
rendering retained cards, with no second quota request. Workspace/refresh
changes discard pending verification results. Background workspace-reference
cleanup keeps its existing native behavior. No Rust, credential storage,
provider endpoint, account deletion policy or app-version changes in this fix.

Applied the installed Emil design engineering guidance and animate decision
gate: reuse existing skeleton/list states and add no animation, theme overrides
or controls. DESIGN.md records the initial-loading behavior. Tests cover a
pending first check, expired card/error omission without refresh, transient
failure retention and single-request reuse, and a workspace change during
verification.

**Verification so far.** TypeScript and the 13 Antigravity component tests
passed. Locked offline Rust suite passed 302 tests (10 opt-in ignored).
19 security script tests and the fresh Apple Silicon/Intel security gate passed;
non-macOS findings remain as printed by the gate. No secrets or account exports
were used in fixtures. The production build passed. Compared with the exact
pre-fix frontend in a temporary isolated copy using the same dependencies and
build command, JavaScript changed from 622,305 to 622,686 bytes (+381), gzip
197,802 to 197,946 (+144). The temporary copy was removed.

Clean dev restart succeeded on port 5174, native build completed and fresh
PID 40367 was observed. Served AntigravityAccounts.tsx contains the initial
Promise.allSettled verification. A native WebKit connection to 5174 was
established before touching the component for HMR. Browser preview could not
connect (`native pipe closed before response`). Sky can inspect an installed
`tauri://localhost` panel, but cannot independently select the standalone dev
process; that installed view does not verify this source change. No installed
app, DMG, version, tag or public release was replaced by this fix.

**Owner check.** In a build containing this change, open a workspace with a
Google account whose plan has ended. It should show loading, then omit that
account without an expiry toast or Refresh. With a transient Google connection
failure, the account should remain and show its existing retryable error.

**Final checks.** All 511 Vitest tests in 45 files passed. The first full-suite
process was stopped by the mandated dev restart; the complete rerun exited 0.
Vite logged the connected-client AntigravityAccounts HMR update at 15:00:00
host log time. git diff --check passed. The latest native dev app remains
running. First-open expiry behavior is covered by synthetic component/native
billing tests; end-to-end verification with a disposable expired Google account
in the native panel remains for review.

# Additional limits disclosure spacing

2026-11-26 · Review (native visual verification outstanding)

**Acceptance criterion.** The Additional limits title is closer to its expanded
child metrics than to the preceding metrics, or at least equally spaced. Match
the owner's screenshot while retaining the shared account-card style.

**Change.** Applied emil-design-eng to the shared disclosure spacing. The normal
home account preview's 12px top margin was also applying inside the expanded
body, adding to the child's 8px inset. Remove that margin within Additional
limits for all home cards. Keep the child inset and existing geometry, theme
tokens, keyboard focus, pointer behavior, reduced-motion and disclosure timing.
No new animation or dependency was added.

| Before | After | Why |
| --- | --- | --- |
| Child preview adds a 12px top margin above its existing inset | No preview top margin inside Additional | Visually associate the title with its children instead of the previous section |

**Verification.** TypeScript and production build passed. Comparable production
CSS changed from 222,829 to 222,916 bytes (+87), gzip 38,015 to 38,023 (+8).
JavaScript stayed 622,686 bytes (gzip differs by 2 bytes between build outputs).
No Rust or account-data changes. Final test and live-dev results follow below.

**Owner check.** Open the dev tray panel, expand an account's Additional limits,
and compare the gap above and below its title in both themes. The child metrics
should sit 12px closer to the title. Verify keyboard expansion and that the
existing focus outline is unobscured. Native visual verification remains for
review if the UI controller is unavailable.

Final checks: all 511 Vitest tests in 45 files passed, alongside TypeScript and
production build. Clean dev restart succeeded on 5174 with fresh native PID
44331 and a successful Tauri dev build. Served CSS contains the corrected
margin rule. Native WebKit connections were established before touching
home.css for HMR. Browser preview again returned "native pipe closed before
response", leaving direct both-theme/native visual checks outstanding. The
latest native dev app remains running.

# Remove Additional limits count

2026-11-26 · Review (native visual verification outstanding)

**Acceptance criterion.** No account card shows a count badge next to Additional
limits. The disclosure still opens the same reported limits.

Removed the count from the shared AdditionalLimits trigger, so all callers use
only the existing chevron and label. Updated the existing disclosure tests to
expect the accessible name without a numeric suffix. DESIGN.md records the
rule. Applied emil-design-eng: remove redundant visual weight while preserving
spacing, focus, keyboard, pointer and reduced-motion behavior. No new motion.

| Before | After | Why |
| --- | --- | --- |
| Additional limits plus numeric badge | Chevron and Additional limits label | Owner requested removal across account cards |

Owner check: open any account card with extra limits; confirm no count appears
and expand the disclosure. Final automated and live-dev results follow below.

TypeScript, all 511 Vitest tests in 45 files, and production build passed.
JavaScript decreased from 622,686 to 622,603 bytes (-83), gzip from 197,948 to
197,929 (-19), compared with the preceding build using the same dependencies.
Clean dev restart succeeded on 5174 with native PID 46210 and a successful
Tauri build. Served AccountUsagePreview source no longer contains provider-count.
Direct native visual inspection remains unavailable through the UI controller
as recorded in the preceding task; the latest native dev app is left running.
With native WebKit connected, touching AccountUsagePreview produced a fresh
Vite HMR update. No accounts, saved preferences or provider data were changed.

# Banked reset balance on account cards

2026-11-26 · Review (native/light-theme visual checks outstanding)

**Acceptance criterion.** Connected Codex account cards with a positive reported
reset balance show the existing Layers icon and count beside the subscription
deadline, or beside the fallback email. Zero, unknown and disconnected balances
are omitted. The balance has a tooltip and an accessible description, keeps the
existing account actions, and adds no provider request or animation.

**Change.** The owner approved the emil-design-eng proposal for muted inline
metadata. Added a reusable secondary metadata slot to AccountIdentity and passed
the existing quota balance from WorkspaceAccounts. The icon and count remain
together in the metadata row; a quiet dot separates them from existing text.
DESIGN.md records the pattern. Existing quota-loading and reconnect tests now
check account-scoped counts, live updates, zero/unknown balances and disconnected
accounts. No Rust, credentials, provider endpoints or saved account data changed.

| Before | After | Why |
| --- | --- | --- |
| Reset credits require opening account options | Muted Layers icon and count beside the deadline/email | Show the useful balance without another card row or action |
| Secondary identity content is fixed | Optional shared metadata slot | Reuse the existing identity layout and theme tokens |

**Verification.** TypeScript and all 511 Vitest tests in 45 files passed on the
initial completed implementation. Production build passed. Before concurrent
account-switch copy edits, the comparable build increased JavaScript by 338 bytes
(84 gzip) and CSS by 353 bytes (72 gzip); no dependency was added. The separate
read-only fixture passed an explicit TypeScript check including its source.
The actual WorkspaceAccounts component rendered in Dia at a 430px container in
dark mode, with synthetic balances of 3, 1 and 0. Screenshot and accessibility
tree confirmed inline positive balances, the email fallback and no zero marker.
Local screenshot: `/tmp/orbilap-reset-balance-preview-dark.png`.

The required dev restart succeeded on 5174. Latest observed native PID 49604
has a successful Tauri dev build. Served WorkspaceAccounts source includes the
balance. With preview tabs no longer connected and a native WebKit client
established, touching WorkspaceAccounts produced fresh HMR and the expected
Fast Refresh fallback through App. The native app remains running.
The browser connector failed with `native pipe closed before response`; Sky
cannot target the standalone dev binary. Native visual, light-theme and direct
tooltip/focus/reduced-motion checks remain for review. The new balance has no
motion and reuses the existing tooltip behavior.

**Owner check.** Open the DEV tray panel and inspect a connected Codex account
with reset credits. Its secondary row should show Layers and the correct count;
hover for the available-reset description. Check light and dark themes and that
More/Switch keyboard focus is unchanged. For synthetic examples only, open
`http://localhost:5174/scripts/motion/reset-balance-preview.html`; add
`?theme=light&width=380` for the narrow light preview. The sample never calls a
provider or changes account data. Final checks on the concurrent working tree
are recorded below.

Final source checks passed: TypeScript, all 511 Vitest tests in 45 files,
production build and git diff --check. The final combined working-tree build is
622,885 bytes of JavaScript (197,996 gzip) and 223,269 bytes of CSS (38,095 gzip).
The final dev restart and live status are recorded below.

Final dev restart succeeded with native PID 51470 and a successful Tauri build.
Vite returned HTTP 200 on port 5174, with native WebKit connections established
before the final WorkspaceAccounts HMR touch. The dev app is left running.

# Remove Codex switch instruction

2026-11-26 · Review (native visual inspection unavailable)

**Acceptance criterion.** Omit “Choose an account’s switch button to activate
it in Codex.” while preserving account switch buttons and installation and
reconnection guidance. Applied emil-design-eng to the existing home surface;
no new controls, styles or motion. DESIGN.md records the copy decision.

**Verification.** TypeScript passed and all 511 Vitest tests in 45 files passed.
The existing switching tests still exercise activation and busy locking.
Clean dev restart succeeded, native build finished and fresh app PID 49604
was observed. Port 5174 serves the updated component without the removed text.
An established WebKit connection and a fresh WorkspaceAccounts HMR update were
observed. The native dev app remains running. Live browser/native visual
inspection (including both themes) was unavailable because the UI service
returned “native pipe closed before response”. No version bump or publication.

# Neat Refresh for banked resets

2026-11-28 · Review (direct native visual check unavailable)

**Acceptance criterion.** Use the Neat Refresh glyph for every Banked reset
symbol through the shared BankedResetsIcon, preserving sizes, theme colors,
accessible names, confirmation and existing pointer/keyboard behavior.

Compared the owner's refresh.svg with the installed @neaticons/react 1.6.0
rounded-stroke and sharp-stroke Refresh components. Refresh exists, but neither
matches the supplied dashed arc exactly. Reused the installed rounded-stroke
Refresh and reported this difference to the owner. All four BankedResetsIcon
callers (card balance, sorting, reset section and announcement) now inherit it.
Removed the unused Layers import. DESIGN.md records the replacement. Applied
emil-design-eng; this static glyph replacement requires no new motion.

| Before | After | Why |
| --- | --- | --- |
| Layers for banked credits | Shared Neat Refresh | Follow the owner's refresh-symbol direction consistently |

**Verification.** TypeScript and all 511 Vitest tests in 45 files passed.
Production build and git diff --check passed. Comparable production JavaScript
changed from 622,885 to 622,062 bytes (-823), gzip 197,996 to 197,799 (-197).
CSS remains 223,269 bytes (38,095 gzip). No dependency, Rust, account-data or
credential changes. Existing busy/check/retry icons retain their state meaning.
CUA inventory returned no surfaces with `native pipe closed before response`;
Sky returned `Invalid app: com.7skylab.orbilap.dev`. Direct native both-theme
visual and pointer/focus checks remain for review. Live restart evidence follows.

**Owner check.** Open the DEV tray panel. Check a positive banked-reset balance,
Sort → Banked resets, the reset Use action, and a banked-credit announcement
when one is available. All use the same rounded-stroke Refresh. Check both
appearances; no credit needs to be consumed to inspect the glyph.

Live verification: dev restart completed a fresh native build in 50.83 seconds;
new PID 63751 is running. Vite returned HTTP 200 on 5174 and the served icons
module contains `BankedResetsIcon = neat(Refresh)`. Only native WebKit clients
were established before touching icons.tsx for HMR. The latest native dev app
is left running. Direct browser/native visual inspection remains unavailable.

# Restore disconnected account warning outline

2026-11-28 · Review (native visual verification unavailable)

**Acceptance criterion.** Codex cards requiring reconnection show a complete
1px warning outline in both themes, and connected cards retain their existing
appearance. The final shared card stylesheet now adds a warning-token inset
outline to is-disconnected, matching active-card geometry without layout shifts.
Applied emil-design-eng; no motion or control changes. DESIGN.md records the rule.

| Before | After | Why |
| --- | --- | --- |
| Neutral card edge when disconnected | Theme warning outline | Make reconnection state visible on the full card |

**Verification.** TypeScript passed; all 511 tests in 45 files passed. Diff
whitespace check passed. dev:restart was invoked; its calling process exited 143,
but the independent launchd supervisor restarted Vite and successfully compiled
and launched the native app (PID 69628; build completed in 3.50s). Port 5174
serves the new outline rule. An established native WebKit connection and fresh
orbilap.css HMR were observed; browser clients were also present, so native-only
HMR isolation was not completed. Native app remains running. CUA inventory
failed with native pipe closed before response, and Sky could not resolve the
dev app. Both-theme native visual, keyboard/pointer and live-page inspection
remain unverified. No Rust, account data, credentials or version changes.

**Owner check.** Open the DEV tray panel and inspect a Reconnect needed card
in dark and light themes; the yellow warning edge should surround the card.


## Disconnected card warning edge — 2026-11-28

Status: review (native visual verification unavailable). Restore the warning
edge on home Codex cards with is-disconnected, using the shared home-warning
theme token and the existing inset shadow geometry. Retain the neutral surface
and Reconnect needed text/icon. No new motion, dependencies or credential changes.
Applied emil-design-eng; no interaction needs animate.

| Before | After | Why |
| --- | --- | --- |
| Disconnected cards retain neutral edges | Shared warning inset edge | Make reconnection state visible in both themes without shifting layout |

TypeScript and 511 tests across 45 files passed. Restart built native dev in
3.50 seconds, PID 69628. Served CSS contains the disconnected selector.
WebKit connections and a fresh CSS HMR update at 08:52:03 were observed;
browser clients were also present, so native-only HMR was not isolated.
CUA returned no surfaces (native pipe closed); Sky reported Invalid app.
Live browser snapshot and native both-theme focus/pointer/reduced-motion checks
remain unverified. Acceptance: open a disconnected card in the DEV tray panel
in both themes, confirm warning edge and Reconnect needed remain visible,
and verify connected/active cards retain their existing edges.

Final verification after removing a redundant duplicate selector: TypeScript
and all 511 tests passed again. Final dev restart built successfully in 0.67s,
with fresh native PID 71256; served CSS includes the warning rule.
The latest native dev app is left running on port 5174. git diff --check passed.

## Follow-up visual verification — 28 November 2026

Continued at the owner's request. CUA still reports no enabled surfaces
(`native pipe closed before response`), and Sky cannot select the dev bundle
(`Invalid app: com.7skylab.orbilap.dev`). Used Sky's supported Dia control to
inspect the existing read-only reset-balance fixture, with the real
WorkspaceAccounts component and synthetic accounts. Both dark and light themes
at a 380px container show the new Refresh glyph beside positive balances,
without wrapping the icon/count or adding a card row. Zero credits remain
unmarked. Accessible image names report 3 and 1 banked resets available.
Tab from the active card reaches its circular More button with visible focus
and the More options tooltip; the balance introduces no extra Tab stop.
Screenshots are local evidence only:
`/tmp/orbilap-refresh-dark-380.png`, `/tmp/orbilap-refresh-light-380.png`,
`/tmp/orbilap-refresh-light-keyboard.png`. Closed the temporary preview tab.
No product source or preferences changed in this follow-up. Native visual
inspection, reset-count hover tooltip, reduced-motion interaction and the
other three native icon surfaces remain unverified; keep the task in Review.

Follow-up checks: TypeScript and all 511 Vitest tests in 45 files passed again.
The requested dev restart was interrupted (exit 143) while the shared dev
runtime restarted; the resulting supervisor is healthy, Vite returns HTTP 200,
a fresh native build finished in 0.66 seconds, and native PID 72880 is running.
Native WebKit connections were established before the final icons.tsx HMR touch.
No product source was edited by this verification follow-up.

# Dev-only reconnection card preview

2026-11-28 · Review (native visual check unavailable)

**Acceptance criterion.** Show a synthetic disconnected Codex card in the dev
tray so the owner can inspect the warning border. Enabled the ignored local
.env.development.local flag VITE_ORBILAP_PREVIEW_RECONNECT=1. DEV and the flag
must both be true; production excludes the fixture. The real card renderer
shows Reconnect preview (DEV), with no management menu and disabled Reconnect.
It does not enter native account storage or quota fetching. Applied
emil-design-eng; reused static controls and warning styling, no new motion.

**Verification.** TypeScript and git diff --check passed. Clean dev:restart
exited 0; native build finished in 0.66s and fresh PID 72880 was observed.
Vite returned the updated component on port 5174; native WebKit had an
established connection before the WorkspaceAccounts HMR touch, and a fresh
HMR entry was logged. Other browser clients were present, so native-only
HMR isolation remains unverified. Sky cannot resolve the dev app, and the
prior CUA inventory failed; direct both-theme visual inspection remains for
the owner. Dev stays running. No saved account or credential changes.

**Owner check.** Open the DEV tray panel and find Reconnect preview (DEV).
Check the warning outline in both themes. Disable the preview by removing the
local flag or setting it to 0 and restarting dev.

Full Vitest verification: all 511 tests in 45 files passed (21.15s).

# Remove accepted dev reconnection preview

2026-11-28 · Owner accepted the card appearance ("اوکیه") and requested
removing the synthetic preview. Removed the fixture, rendering exceptions,
local-only environment flag and current DESIGN preview instructions. Historical
verification evidence above is retained. The real disconnected-card warning
outline remains. Reused the existing home design per emil-design-eng; no new
interaction or motion. Owner's visual approval resolves the preview appearance
review; independent keyboard/both-theme inspection was not available.

TypeScript and git diff --check passed. Served WorkspaceAccounts source on
5174 contains neither RECONNECT_PREVIEW nor the synthetic card name.


## Pro banked reset incorrectly unavailable — 2026-11-28

Owner reported a Pro account with four credits and a disabled Use button, while
redemption in Codex worked. Supplied screenshot shows the generic unsupported-plan
message (screenshot balance is one); no provider response was supplied.

Found and corrected a reproducible false-negative path: Pro coverage was derived
from displayed usage windows and became empty when Weekly was omitted. Known
Pro variants now use their existing Weekly reset coverage independently of the
usage snapshot. Retain explicit provider unsupported flags, credit expiry,
identity binding, confirmation, fresh revalidation and durable retry IDs.
The screenshot cannot distinguish a missing bucket from provider support=false
or an unrecognized plan string; do not claim the historic response was reproduced.

Added synthetic regression cases for all four recognized Pro variants, four-credit
balance, zero applicable count, missing Weekly/all windows, and explicit provider
rejection. No real credit redeemed, credentials read or provider requests issued.
Reviewed docs/SECURITY.md account identity, explicit mutation confirmation, request
scoping and retry attack surfaces. No change to endpoints or credential handling.
Status: review pending native check with a disposable Pro account.

Dev restart exited 0; after another project check released the Cargo artifact
lock, the native build completed in 46.06s and new PID 74941 launched. Native
WebKit was established before touching WorkspaceAccounts for HMR. Initial
Vitest run had 510 passes and one quick-switch timing failure (Account switch
label absent); a complete rerun was started. Direct live page/native visual
inspection remains unavailable through the previously failing UI services.

Verification: TypeScript passed; 511 Vitest tests in 45 files passed. Locked
offline cargo check passed; Rust suite: 295 unit tests and 8 integration tests
passed, 10 live/opt-in tests ignored. test:security passed 19 tests;
security:check passed Apple Silicon and Intel dependency audits, policy and
redacted secret scans. It reported existing other-target zip advisories,
unmaintained chrono/proc-macro-error/zbus_names/zvariant/zvariant_derive, glib
unsoundness and yanked async-executor; these are outside macOS build trees.
No actual credit was consumed to verify this fix. Native UI automation remained
unavailable in this chat, so real account verification remains for review.
Owner check: reopen Account settings for a Pro account with an available credit;
Use should be enabled even when Weekly usage is absent. Inspect without Confirm
to avoid spending a credit. Explicit provider rejection/expiry must still block.

# Align the banked-reset icon and count

2026-11-28 · Review (native visual check unavailable)

**Acceptance criterion.** The Refresh glyph and count share a visual center,
with the number on the same baseline as adjacent metadata in both themes.

Applied emil-design-eng to the card's existing inline balance. Its number now
uses the metadata baseline instead of centering the full balance within the
row. The SVG is block-level and raised by 0.0625rem to align the painted icon
with the digits rather than the font's line box. The adjustment is scoped to
the card metadata and adds no animation or interaction changes. DESIGN.md
records it.

| Before | After | Why |
| --- | --- | --- |
| Balance centered as a whole within text metadata | Balance shares the metadata baseline | Keep the count aligned with adjacent text |
| SVG centered on full line height | Static 0.0625rem upward optical correction | Center the visible glyph on the numeral |

**Verification.** TypeScript, all 511 Vitest tests in 45 files, production
build and git diff --check passed. CSS increased from 223,390 to 223,470 bytes
(+80), gzip 38,103 to 38,123 (+20). Concurrent unrelated source edits decreased
JavaScript by 31 bytes; this change edits CSS only. Inspected the actual card
fixture at a 380px container in light and dark themes through Dia/Sky. Synthetic
balances of 3 and 1 show the correction; zero remains hidden. Screenshots:
`/tmp/orbilap-reset-align-light.png` and `/tmp/orbilap-reset-align-dark.png`.
Closed the temporary tab before native HMR verification. No account data or
Rust changed. Direct native inspection remains unavailable through the UI
controller, as recorded above; restart/live results follow.

**Owner check.** Open the DEV tray panel and compare the reset icon and count
beside the subscription deadline or email. Check both appearances.

Final live restart: Vite returned HTTP 200 on port 5174; a fresh native dev
process (PID 77873) is running. Latest source is left running. No src frontend
files changed for this fix; native visual redemption check remains unverified.

Live checks passed: dev restart completed the native build in 4.29 seconds,
fresh native PID 77873 is running, and Vite returned HTTP 200 on 5174. Served
home.css includes the alignment rule. Native WebKit connections were established
without preview clients before touching home.css; Vite logged a fresh CSS HMR
update. The latest native dev app remains running.

Complete Vitest rerun passed: 511 tests in 45 files (22.94s). A concurrent
restart then completed; latest native PID 77873 is running, and native WebKit
was established before a final WorkspaceAccounts HMR touch. The synthetic
card is absent from the served source; the dev app remains running.

# Use the owner's exact dashed reset SVG

2026-11-28 · Review (native visual inspection unavailable)

**Acceptance criterion.** Every Banked reset symbol uses the owner's supplied
refresh.svg, including its dashed arc, rather than an approximate library glyph.

Replaced the shared BankedResetsIcon with the original two SVG paths, 24px
viewBox, rounded caps and joins, 1.5 stroke width and 3 3 dash pattern. Inline
stroke widths preserve the supplied weight against global icon styling. The
only visual adaptation is currentColor in place of the fixed near-white color,
so the supplied glyph remains visible in both themes. All four existing callers
inherit it: account balances, sorting, reset Use action and announcements.
The earlier alignment correction remains; no motion or control behavior changed.
This explicit owner choice supersedes the Neat Refresh substitution.
DESIGN.md records the exact asset selection. Applied emil-design-eng.

| Before | After | Why |
| --- | --- | --- |
| Approximate Neat Refresh | Owner-supplied dashed SVG | Follow the exact asset requested |

**Verification.** Both path strings and the dash pattern were compared directly
with the original file and match. TypeScript, all 511 Vitest tests in 45 files,
production build and git diff --check passed. Compared with the immediately
preceding build, JavaScript increased from 622,062 to 622,639 bytes (+577), gzip
197,793 to 197,943 (+150); CSS is unchanged. The light 380px read-only card
preview renders the actual supplied glyph with synthetic balances of 3 and 1.
Screenshot: `/tmp/orbilap-exact-reset-light.png`. Native visual verification is
still unavailable through the UI controller as recorded above. No Rust, provider
requests, credentials or account-data code changed in this task.

**Owner check.** Open the DEV tray panel and inspect the Banked reset balance,
sort option and reset Use action. They should show the supplied counterclockwise
arrow with a dashed lower-left arc. Ordinary refresh actions keep their existing
glyph. Final dark-theme/live evidence follows.

The dark 380px preview also shows the supplied dashed glyph; local screenshot:
`/tmp/orbilap-exact-reset-dark.png`. Closed the temporary preview tab. Final dev
restart succeeded with a 0.61s native build and fresh PID 79876. Vite returns
HTTP 200 on 5174 and serves the original 3 3 dash pattern. Only native WebKit
clients were established before touching icons.tsx; the fresh HMR update was
logged. The latest native dev app is left running. Native visual inspection
remains unverified; both-theme browser card inspection passed.

# Center the supplied dashed reset icon on the number

2026-11-28 · Review (native visual verification unavailable)

**Acceptance criterion.** The number no longer appears below the supplied
reset icon; both share a visual center while adjacent metadata keeps its baseline.

The previous 0.0625rem upward SVG translation remained after replacing the Neat
glyph with the owner's taller, full-circle dashed SVG. Removed that obsolete
translation and retained the existing inline-flex centering, block SVG and
metadata baseline. Applied emil-design-eng and updated DESIGN.md; this static
correction adds no motion, controls or changes to the supplied SVG paths.

| Before | After | Why |
| --- | --- | --- |
| Dashed glyph raised 0.0625rem above its flex center | Native SVG position, centered beside the number | Remove the old library-specific offset causing the number to look low |

**Verification.** TypeScript, all 511 Vitest tests in 45 files, production build
and git diff --check passed. Comparable production CSS decreased from 223,470
to 223,438 bytes (-32), gzip 38,123 to 38,115 (-8); JavaScript bytes are unchanged.
Viewed the actual synthetic card fixture at a 380px container in light mode at
100% and 150% browser zoom, and dark mode at 100%. The enlarged preview showed
the obsolete vertical shift before removal and the centered result afterwards.
Screenshots: `/tmp/orbilap-dashed-align-light-150.png` and
`/tmp/orbilap-dashed-align-dark.png`. Browser zoom restored to 100% and the
preview tab closed. No product settings, account data or Rust were changed.
Direct native visual verification remains unavailable as recorded above.

**Owner check.** Open the DEV tray panel and compare the reset count with the
center of the dashed-circle glyph. Check the deadline and fallback-email rows
in both themes. Final native build/HMR evidence follows.

Live verification: clean dev restart built successfully in 0.71 seconds and
fresh native PID 81930 remains running. Vite returned HTTP 200 on 5174 and
serves the block SVG rule without the old translation. Native WebKit clients
were established with no preview tab connection before the final home.css
touch; a fresh HMR update was logged. The latest native dev app is left running.
# OrbitHUD feature comparison

2026-11-28 · Done (source comparison; no implementation adopted)

**Acceptance criterion.** Compare OrbitHUD's implemented capabilities with the
current Orbilap working tree, identify real gaps and distinguish roadmap or
unverified distribution claims. Preserve existing local work and account data.

**Result.** [Full comparison](docs/ORBITHUD-COMPARISON.md) records the reviewed
OrbitHUD commit `22509ae52a461caf5b1bd2d3618a76ddceee2b13` and public v1.2.7
assets. Main differences are persistent/compact/desktop quota surfaces,
external-auth filesystem watchers, opt-in quota notifications, local Antigravity
token counting, provider/group filtering and Windows/Linux installers. Usage
notifications were deliberately removed from Orbilap; this review does not
reverse that decision. Package-manager publication was not confirmed. Planned
analytics, additional providers, hotkeys and WidgetKit are not counted as shipped.
Recommendations are proposals only; no feature or platform scope was changed.

**Verification.** OrbitHUD compiled with Swift; 19 XCTest tests passed. Its
cross-platform quota/provider, bounds, updater helper, alert and release-stats
suites passed. Anonymous GitHub/AUR checks established the public-artifact and
package-manager limitations documented in the report. No real provider account
was used and no OrbitHUD UI/update/install flow was exercised.

Orbilap TypeScript passed and all 511 Vitest tests in 45 files passed. The first
Vitest invocation was interrupted by an early dev restart; the full rerun exited
0. The clean restart succeeded, Vite returned HTTP 200 on port 5174, native dev
compilation finished and fresh debug PID 86461 was observed. The dev app remains
running. This documentation-only review changed no frontend/Rust code; no
served-source change, HMR change or native UI behavior was claimed as verified.
The temporary external checkout and Swift build output were removed after
recording the pinned sources and results. Existing uncommitted work was retained.

**Owner review.** Read the comparison's implemented-differences table and
suggested discussion. No additional implementation or release approval is needed
to consider this research task complete.


# Unread update dots and explicit download/install

2026-11-28 · Done (owner-approved local test)

**Acceptance criterion.** An unseen newer version marks the home Settings
button and Updates tab with a quiet dot. Opening General or closing Settings
keeps it; rendering the offered release in Updates acknowledges that version
and clears both markers. The offer stays available, with separate Download and
Install & relaunch actions. Seen versions survive relaunch; newer versions get
a fresh dot. Skip suppresses only that release during background checks.

**Change.** Applied emil-design-eng and animate's frequency/purpose gate:
shared UpdateDot is static, pointer-inert and decorative; its parent control's
accessible name/tooltip announces Update available. Reused the circular home
Settings button, Radix tabs, update card, notes dialog, action-row and existing
motion/reduced-motion behavior. Dots sit outside label/glyph layout. A painted
Updates tab acknowledges the offered version using a cancellable animation
frame; opening Settings retains the current tab. Persisted acknowledgements in
orbilap.seenUpdateVersions with a validated, failure-tolerant storage reader.

Discovery now defaults on for missing preferences and preserves saved false
choices. It runs on app launch and once per day while running, with a 15-second
check timeout. Background failures remain silent and retain an existing offer.
Removed automatic downloads. Only explicit Download and Install & relaunch
invoke those operations. Superseded native updater resources are closed;
results arriving after unmount are discarded/closed. Tauri's trusted HTTPS
feed, signed archive verification and capabilities are unchanged. No Rust,
account-data or credential handling was changed by this task. DESIGN.md,
RELEASING.md and USAGE_PREFERENCES.md document the approved check-only flow.

| Before | After | Why |
| --- | --- | --- |
| Temporary update toast, no persistent discovery signal | Version-scoped dots on Settings and Updates | Let users follow the notice without interrupting account work |
| Automatic check downloads immediately | Silent discovery, explicit Download, explicit Install & relaunch | Keep each consequential action under user control |
| Opening Settings resets the selected tab | Retain the current tab and clear only after Updates renders | Acknowledge viewing the release, not opening preferences |

**Verification.** TypeScript, the standalone preview TypeScript check, all 517
Vitest tests across 45 files, production build and git diff --check passed.
Regression coverage includes home-to-Updates navigation, General/close retention,
painted-tab acknowledgement, persistence across remounts, a later release,
explicit opt-outs, quiet offline failure, daily checks while closed, skipped
releases, manual download/install separation and accessible header/tab labels.
Comparable production JavaScript increased from 622,639 to 624,040 bytes (+1,401),
gzip 197,941 to 198,382 (+441). CSS increased from 223,438 to 223,917 (+479),
gzip 38,115 to 38,208 (+93). No dependency was added. Confirmed the synthetic
update text is excluded from production JavaScript.

**Security scope.** All 19 security script tests passed. security:check passed
against the current source for both Apple Silicon and Intel macOS, with no JS
advisories or Gitleaks findings. The locked offline Rust run passed 304 tests;
10 opt-in tests were ignored. The gate also printed findings outside macOS
build trees (zip, chrono, proc-macro-error, zbus_names, zvariant/derive, glib,
yanked async-executor); these are not cleared for other platforms by this work.
Logs: /tmp/orbilap-update-security-tests.log, /tmp/orbilap-update-security.log,
/tmp/orbilap-update-rust.log and /tmp/orbilap-update-full.log. Actual signed
archive download/installation and physical Intel execution were not performed;
this is a local feature test, not release approval.

**Visual/interaction evidence.** Sky controlled Safari/WebKit using the real
HomeHeader and SettingsModal in a same-origin iframe, giving the previews actual
430×600 dark and 380×600 light viewports with synthetic workspace data. Verified
both header/tab dots, retention after General/Close, acknowledgement on Updates,
ready release information and Download, notes/Escape/return focus, simulated
progress, Install & relaunch only after download, and the safe preview-complete
state. Light-theme End-key tab navigation reaches Updates and clears the marker.
Local screenshots: /tmp/orbilap-update-dot-home-dark.png,
/tmp/orbilap-update-dot-tab-dark.png, /tmp/orbilap-update-offer-dark.png,
/tmp/orbilap-update-ready-dark.png, /tmp/orbilap-update-home-light.png,
/tmp/orbilap-update-tab-light.png, /tmp/orbilap-update-offer-light-keyboard.png.
Preview tabs were closed before native HMR verification. Direct standalone
native selection still fails with Invalid app: com.7skylab.orbilap.dev; browser
visual evidence does not claim direct native inspection. OS reduced-motion
interaction remains an owner check; the new marker has no animation.

**Owner check.** The final dev app runs with VITE_ORBILAP_PREVIEW_UPDATE=1.
Click the DEV tray icon, then the dotted Settings button. General should open
with a dotted Updates tab. Close/reopen to confirm the dot remains; enter
Updates to reveal Preview 9.9.9 and clear both dots. Inspect What's new, then
choose Download and afterwards Install & relaunch. These preview operations
only simulate their progress and never install or relaunch the app; updater
acknowledgements/skips/check timestamps are not written in preview mode.
Restart with the same flag to repeat from an unread offer. Run ordinary
pnpm run dev:restart to return to real check behavior. For synthetic browser
QA use /scripts/motion/updates-preview.html?theme=dark (or theme=light&width=380)
on localhost:5174. No version bump, tag, push or release was made.

**Final live status.** Clean dev restart with VITE_ORBILAP_PREVIEW_UPDATE=1
succeeded; Tauri finished the native build in 0.53 seconds and fresh native PID
1729 is running under the independent launchd supervisor. Vite returns HTTP 200
on 5174. Served SettingsModal includes the active synthetic-update flag and
HomeChrome includes UpdateDot. After closing QA tabs, the sole established
client was native WebKit before touching HomeChrome; Vite logged a fresh HMR
update. The latest native app remains running with a fresh unread preview for
the owner's test. Final source checks and the both-architecture security gate
were rerun after the last production-code change and passed.

**Owner acceptance — 28 November 2026.** After testing the local preview, the
owner reported that it worked correctly. This closes the pending owner UI review
for the update-notice feature. The report does not claim a real signed-package
upgrade, physical Intel execution or an explicit OS reduced-motion test. Earlier
automated/security evidence and its limitations remain above. Returned the dev
app to ordinary update discovery by restarting without the synthetic-update
environment flag. This acceptance does not authorize a version bump or release.

Post-acceptance normal dev restart passed: Vite returned HTTP 200 on 5174,
Tauri finished the build in 0.50 seconds, and fresh native PID 15116 remains
running. Served environment no longer enables VITE_ORBILAP_PREVIEW_UPDATE.
Only the task record and dev runtime changed; the prior passing 517-test,
TypeScript and security results are retained, with no new source behavior.

# Configurable global panel shortcut

2026-11-28 · Review (interactive native UI/device verification outstanding)

**Acceptance criterion.** Settings → General lets the owner enable/disable a
global panel shortcut and record a different combination. The selected key
persists across launches. Registration conflicts or settings-write failures
preserve the previous working choice. Shortcut activation opens the existing
panel immediately; focused home can hide and restore the previous application,
while dialogs/imports/busy flows retain their guards.

**Implementation.** Added the official Rust `tauri-plugin-global-shortcut`,
locked at 2.4.0, with native registration and a narrow main-window recorder/hide
bridge. No arbitrary frontend registration permissions were added. Preferences
are opt-in, default off, with Command–Shift–O suggested. General reuses the shared
Switch/Button/section controls and a horizontal Cancel / Save shortcut action row.
Physical key codes support typing-layout changes. Escape cancels recording;
plain typing, modifier-only combinations and Tab/Escape shortcuts are rejected.
The existing registered combination can be recorded through its native event.
Capture ends on blur, closing/leaving General and webview reload. Settings reset
disables the shortcut and restores the suggested key. Startup registration
failures remain visible in General without preventing app startup.

The existing global Tab blocker was removed so native traversal and Radix focus
traps operate. Home Escape uses the guarded hide path. Repeated presses are
suppressed until release and queued events from disabled/replaced keys are
ignored. App-owned native registration uses reserve-new-before-release-old;
actual persistence failure rolls back the registration. Existing local source,
account changes, update-notice work and dependency security fixes were preserved.
No version bump, commit, release or publication was performed.

**Design.** Applied the existing `emil-design-eng` guidance and `animate` gate.
Keyboard-driven panel opening/capture adds no animation. Shared button geometry,
circular icon controls, theme tokens and pointer/reduced-motion behavior remain.
DESIGN.md records the new setting and supersedes earlier Tab suppression.

**Verification.**

- TypeScript passed. All 527 Vitest tests in 47 files passed on the full final
  run. Tests cover physical-key recording, invalid/repeated input, native capture
  of the current combination, enablement, save/cancel, conflict recovery, blur/
  unmount cleanup, nested discard-confirmation Escape handling, API payloads, restored Tab traversal and dialog preservation.
- Locked offline Rust suite passed: 302 library tests and 8 integration tests;
  10 opt-in library tests ignored. The isolated-environment child test also passed.
  Registration regressions exercise conflicts, replacement, actual settings-write
  failure rollback, unrelated settings preservation and repeat/disabled events.
- `cargo check --offline --locked` passed for the host and for
  `x86_64-apple-darwin`. Physical Intel execution was not tested.
- Native OS registration smoke tests used an isolated private temporary data
  directory and synthetic provider homes. In the real Tauri native process,
  enable registered Control–Option–F18; a separately reserved Control–Option–F19
  caused a conflict without changing the old registration/settings; changing to
  Control–Option–F20 released F18; disabling released F20. Re-enabling F18 persisted
  and a fresh native process registered it on startup, then disabled it successfully.
  Both processes exited 0 and reported `passed: true`. Temporary debug-only
  instrumentation was removed before the final source build/dev restart.
- `pnpm run test:security` passed 19/19. `pnpm run security:check` passed JS audit,
  redacted working-tree/history scans, IPC/CSP/updater policy and the resolved
  Apple Silicon/Intel dependency audit. It still reports other-target findings
  involving zip, chrono, proc-macro-error, zbus_names/zvariant, glib and a yanked
  async-executor outside the supported macOS build trees. No security release
  approval or claim of complete vulnerability absence is implied.
- Comparable production builds: JavaScript 624,040 → 628,754 bytes (+4,714),
  aggregate gzip 198,382 → 200,172 (+1,790). CSS unchanged at 223,917 bytes
  (38,208 aggregate gzip). No frontend dependency or bespoke CSS was added.
- Clean `pnpm run dev:restart` succeeded. Vite returned HTTP 200 on 5174,
  served the new control source and Tauri recorded `Finished dev profile`.
  Fresh debug app PID 31670 was observed and is left running. Established
  WebKit connections to 5174 were present before touching the component for HMR; a fresh
  `hmr update /src/index.css, /src/components/PanelShortcutSettings.tsx` was logged.

**Verification limits.** Computer Use could not target the standalone dev app:
Orbilap's installed bundle ID was ambiguous and the debug path/dev ID were rejected.
Both browser-preview entry points returned `native pipe closed before response`.
Consequently no native visual inspection in both themes, live browser snapshot,
physical global keypress from another application or previous-application focus
restoration was independently observed. Unit/native registration results do not
substitute for those interactive checks. No real account credentials were changed
for QA. This task remains Review for the stated native/device checks.

**Owner check.** In the DEV tray panel open Settings → General → Keyboard
shortcut. Enable it, return to an editor and press Command–Shift–O. Home should
open instantly; a second press on home should hide it and return focus. Reopen
Settings, click the combination, record a different modified key and Save shortcut.
Check it works and the old key no longer triggers Orbilap. Cancel another recording,
then disable/re-enable and relaunch to check persistence. A shortcut pressed with
a dialog open must preserve it. Check the control at tray width in both themes,
Tab/Shift+Tab, Escape and reduced motion. Keep the setting off if not wanted.

# Left-click native tray menu

2026-11-28 · Review (interactive native check outstanding)

**Request and acceptance.** Match the owner's Telegram screenshot: left-click
on the menu-bar icon opens a native menu containing Show Orbilap and Quit.
Show Orbilap opens/focuses the existing mounted panel. Quit exits through the
existing quit_app path. This owner request supersedes direct left-click toggling.

**Implementation.** Tauri's existing native Menu/MenuItem APIs supply the menu;
no dependency, permission, frontend, account-data or version change. Removed the
superseded toggle helper. Applied emil-design-eng and animate's frequency gate:
retain OS-provided appearance, keyboard/dismissal and motion behavior, with no
custom animation. The optional global shortcut remains a direct panel entry.

**Verification.** pnpm exec tsc --noEmit passed. pnpm exec vitest run passed all
527 tests in 47 files. cargo check --offline --locked and cargo test --offline
--locked passed (302 library tests, 8 integration tests, 10 opt-in tests ignored).
The initial concurrent checks were interrupted by dev:restart's project-process
cleanup; the complete checks above were rerun after restart and passed.
pnpm run dev:restart succeeded, Vite returned HTTP 200 on port 5174, the native
log recorded Finished dev profile and Running target/debug/orbilap, and fresh
native PID 41749 was running. No src/ changes, so served-source/HMR checks do not
apply to this Rust-only change. No production frontend bundle delta.

**Limits and owner check.** Computer Use could not target the native dev process:
the bundle identifier was ambiguous between installed/mounted bundles, the debug
executable path was rejected, and the app-name query timed out. Consequently
actual menu presentation, Show/Quit selection, keyboard dismissal, both themes
and reduced-motion behavior remain unobserved. Click the DEV menu-bar icon,
choose Show Orbilap, reopen and dismiss with Escape, then choose Quit and verify
exit. Restart with pnpm run dev:restart afterward to leave development running.
No release or publication performed. Existing unrelated working changes preserved.

# Local shortcut test package

2026-11-28 · Review (owner installation and physical shortcut test outstanding)

**Acceptance criterion.** Produce a fresh installable local Apple Silicon build
from the current pending source for the owner's test, preserving version 1.0.4,
installed apps/account data and the public release.

**Scope.** Configurable global panel shortcut, pending quiet update-discovery
changes and existing account/quota UI fixes. Floating usage is still a proposal
and is not included. No version bump, commit, push, tag, install or publication.

**Verification.** TypeScript passed, all 527 Vitest tests in 47 files passed,
302 Rust library and 8 integration tests passed (10 opt-in ignored; isolated
child environment check also passed), 19 security/script tests, 8 release helper
tests, frozen dependency install and release configuration check passed. Fresh
security gate passed for both supported macOS architectures; other-target
findings and manual verification limitations are in the dated security report.
Rechecked picomatch advisory/npm: advisory withdrawn, 4.0.7 remains latest and
already resolved. No expired exception was used.

The first packaging process was interrupted by a separate dev restart, and a
concurrent gate script test was interrupted. Complete reruns passed. To preserve
a stable candidate, the successful build used a fixed separate source snapshot
with every build-input SHA256 matched to the tested working tree. The snapshot
was removed after artifact verification; no temporary QA source remains.

**Artifact.** `release-artifacts/local-test-20261128-102737/Orbilap_1.0.4_local-test_AppleSilicon.dmg`
(7,038,816 bytes). SHA256: `daad53dcbbf72a6c0b37b264d7ced74ef0d82007120a7e785371968928194f28`.
DMG integrity and strict deep ad-hoc signature verification passed. The mounted
app is arm64 only, reports 1.0.4, contains Assets.car/icon.icns and matches the
built executable byte-for-byte. The read-only verification mount was detached.
Input hashes, provenance, checksum and local test notes accompany the DMG.
This local artifact is not notarized and has no signed updater archive.

**Owner check.** Quit the older installed production Orbilap before opening the
fresh copy, to prevent single-instance forwarding. Open the DMG and copy/run
Orbilap.app. Settings → General → Keyboard shortcut defaults off with
Command–Shift–O suggested. Enable, record/change/save, cancel a new recording,
disable/re-enable and relaunch. From an editor, test opening/focused-home hiding
and return of focus; a dialog must remain intact. Check both themes and Tab.
The package uses the normal production account/settings location; do not run
two production copies together. The separate DEV app may remain running.
Physical input/focus return, native visuals and owner installation remain for
review because UI automation could not independently verify them.

Final local-package handoff: security gate and release configuration check passed
after recording the artifact. Fresh native dev PID 45537 was observed after
`Finished dev profile` (5.58s); Vite returned HTTP 200 on port 5174 and the
launchd supervisor remained independent. The latest native dev app is running.
Final build-input hashes still match the verified package candidate.

# Quit-only menu-bar menu

2026-11-28 · Review (physical native menu check outstanding)

Owner request: left-clicking the menu-bar icon must show only Quit.
Removed Show Orbilap and its menu handler; retained the existing native menu
and quit path. Updated DESIGN.md. Applied emil-design-eng and animate guidance:
retain native styling, keyboard navigation and system motion; no custom animation.

Verification: TypeScript passed; 533 Vitest tests in 48 files passed.
cargo check --offline --locked passed; locked offline Rust suite passed
(308 library and 8 integration tests; 10 opt-in ignored).
Initial test runs were interrupted by dev restart; complete reruns passed.
Final pnpm run dev:restart succeeded; Vite HTTP 200 on 5174,
Finished dev profile and Running target/debug/orbilap observed, fresh PID 63910.
No src/ changes or production bundle change.
Native computer APIs are unavailable in this session, so actual menu display,
keyboard dismissal, both themes and Quit selection remain unverified.
Owner check: click the DEV tray icon and confirm the single Quit item.
Existing unrelated work preserved; no release or publication.

# Restore normal tray click to open the panel

2026-11-28 · Review (physical native interaction check outstanding)

Owner clarification supersedes the preceding quit-only left-click behavior:
normal left-click opens/focuses the existing mounted panel; right-click shows
only Quit. Disabled native menu on left-click and restored the left-button-up
handler using show_panel. Quit and existing panel state remain unchanged.
Updated DESIGN.md; native styling/motion retained per emil-design-eng/animate.

Verification: TypeScript and all 533 Vitest tests (48 files) passed.
cargo check --offline --locked and cargo test --offline --locked passed
(308 library, 8 integration; 10 opt-in ignored; isolated child test passed).
pnpm run dev:restart succeeded; Vite HTTP 200 at 5174, native Finished dev
profile and Running target/debug/orbilap observed with fresh PID 69897.
No src/ change, so frontend served-source/HMR checks do not apply.
Native computer APIs are unavailable; physical left-click opening, right-click
menu, theme/keyboard dismissal and Quit selection remain owner checks.
Latest native dev app left running; no release or publication.


# Floating usage window and local test package

2026-11-28 · Review (owner physical drag/device verification outstanding)

**Acceptance criterion.** Settings → General enables/disables an optional compact
floating usage window and chooses Codex, Claude or Antigravity. The surface follows
the selected service's live active account in the current workspace and reuses
Menu bar limit selection, ordering, remaining/used wording and plan defaults. It
stays above ordinary applications without taking focus, moves from its header,
opens the existing panel from the readout, and hides without quitting. Preserve
provider behavior and account data; provide an installable local test build.

**Implementation.** The native monitor now publishes a minimal read-only sample
to a lazily created 320×158 secondary webview; no second credential/quota polling
loop is added. It works when the selected menu-bar provider is hidden. Account,
workspace, provider and preference changes invalidate old readings. Missing,
expired and failed readings stay unknown; an explicit empty limit selection is
respected. The window is non-key/non-focusable with macOS all-Spaces and fullscreen
auxiliary behavior. Native orderFrontRegardless avoids focus stealing during
show/refresh. Position uses private storage, flushes on exit and recovers into
available monitor working areas. Hide only persists enabled=false, retaining
service and position. Click preserves existing dialogs and reveals the matching
home card when appropriate. No dependency or app version change.

Applied emil-design-eng and animate: shared home materials/tokens, provider logos,
Switch/Select, Button and Progress, circular Hide button, fixed compact layout,
no new frequent-action animation, shared pointer/reduced-motion behavior. Dragging
has a dedicated mouse-down header, separate from the open button. The final native
drag command is synchronous and label-guarded; its webview still receives only
event listen/unlisten plugin permissions. All account/settings/updater commands
are excluded by the native application boundary.

**Verification.** TypeScript and all 533 Vitest tests (48 files) passed. Locked
offline Rust passed 308 library and 8 integration tests, with 10 opt-in ignored;
the isolated environment child passed. Offline host/Intel checks passed. Tests
cover low positive remaining capacity, unavailable/expired values, event/read
ordering, stale initial snapshots, setting/service preservation, separate open/
hide/drag actions, identity/workspace restrictions, IPC guards and bounds recovery.
All 20 security/script tests and the fresh supported-macOS security gate passed;
other-target findings and manual limits are in docs/releases/1.0.4.security.md.
The picomatch advisory remains withdrawn, and latest/locked npm version is 4.0.7.

Real native QA used an isolated app identity, private temporary data and synthetic
accounts. Actual secondary-webview listen/snapshot/ready IPC succeeded. Native
checks confirmed non-key/non-focused display, all-Spaces/fullscreen-auxiliary flags,
offscreen recovery, position persistence and showing without foreground activation.
Screenshots verified the card in dark and light themes. Clicking the reading opened
the existing main panel. Hide made the surface disappear, persisted false with
provider=claude retained, and left the process alive. Synthetic QA evidence is in
release-artifacts/floating-usage-qa-20261128. Temporary native instrumentation,
synthetic HTML entry point and source harness were removed before packaging.

The fast automated drag gesture did not demonstrate physical movement and AppKit
reported movement completed without beginning. Earlier apparent position changes
came from the bounds-recovery smoke test and are not accepted as drag evidence.
The final header prevents default mouse handling and calls the native drag API;
owner physical dragging remains a required check. Actual fullscreen switching,
monitor unplug/reconnect, native Settings keyboard/reduced-motion behavior, physical
Intel execution and live provider/update installation were not exercised. The
browser-preview transport was unavailable; the secondary native webview itself
was visually inspected. No real credentials were used for QA.

Comparable production bundle totals: JavaScript 628,754 → 636,791 bytes (+8,037),
aggregate gzip 200,172 → 206,484 (+6,312); CSS 223,917 → 226,272 (+2,355), aggregate
gzip 38,208 → 38,665 (+457). Entry routing lazy-loads the floating view and main
application separately. No frontend dependency added. Existing unrelated working
changes, the global shortcut, update notices and current tray behavior are preserved.

**Owner check.** Quit the previous production copy before opening the local DMG.
In Settings → General → Floating usage, enable Show floating usage and choose a
service with an active account in the current workspace. Compare the card against
Menu bar limits; switch account/workspace/service and themes. Drag the header
slowly, relaunch to check position persistence, click a reading to open home, and
use Hide to verify only the floating surface turns off. Re-enable in General.
Check a full-screen app and monitor changes. The separate DEV app remains running.
This is an owner-test build, with no commit, push, tag, installation or publication.


**Packaged result.** `release-artifacts/local-test-20261128-110407/Orbilap_1.0.4_floating-test_AppleSilicon.dmg`
(7,017,664 bytes), SHA256 `c03c41fa06862f47fa253450879b1f0b7702747899597aec4dd9a7376fe0de8a`. DMG integrity, strict deep ad-hoc
signature verification, arm64-only architecture, 1.0.4 metadata, packaged icons
and built/mounted binary equality all passed. The read-only verification mount
was detached. Every recorded build-input hash matched the tested working tree.
The isolated source snapshot was removed after verification. Artifact directory
contains the input manifest, provenance, checksum, test notes and verification logs.

Final clean dev restart passed: `Finished dev profile`, fresh native PID 71715,
Vite HTTP 200 on 5174, served floating settings/controller source and an established
native WebKit connection. Touching the settings component after establishing that
connection produced a fresh `hmr update /src/index.css, /src/components/FloatingUsageSettings.tsx`.
The latest native DEV app remains running. Release configuration, 8 release helper
tests and frozen dependency installation passed. No version bump or publication.


# Floating usage display densities

2026-11-28 · Review (owner physical device checks remain)

**Acceptance criterion.** Let the owner choose a full card, a compact card or a
small floating pill in General settings, save that choice and change the actual
native footprint immediately without changing the service or usage data.

**Implementation.** Added the shared Display Select under Floating usage, editable
while disabled. Full card (320×158 logical points including transparent padding)
remains the migration/reset default. Compact (256×108) keeps account/labels/progress;
Mini (196×52) keeps the service logo, first selected limit and +count of other
limits. The full identity/status/readings remain in the hover and accessibility
summary. Missing/expired readings remain unknown. The circular Hide action stays
visible. The logo serves as Mini's drag handle; reading click still opens home.
Preference validation accepts known densities and falls back to Full for missing/
future values. Snapshot events carry mode, and native creation/repaint resizes
the same unfocused window then recovers its monitor bounds. A mode-only change
repaints cached samples without invalidating generations or waking quota probes.
Provider/enablement changes preserve the selected density.

Applied emil-design-eng and animate to the existing shared controls/materials.
Keyboard selection, native resizing and repeated data updates are immediate with
no new animation; existing motion and reduced-motion rules remain. DESIGN.md and
USAGE_PREFERENCES.md document each density and the native sizes. No dependency,
permission, credential flow, port or app version change.

**Verification.** TypeScript passed; all 537 Vitest tests (48 files) passed.
Locked offline Rust: 310 library and 8 integration tests passed; 10 opt-in ignored;
isolated child passed. Host and Intel offline checks passed. New coverage checks
legacy/unknown preferences, persisted modes, shared readings, empty Mini state,
keyboard mode selection with enablement/service preserved, native-event density
changes, no extra probe/generation invalidation and bounds recovery when enlarging.
20 security/script tests and the fresh supported-macOS security gate passed.
Existing other-platform audit findings remain outside the macOS union.

An isolated QA app used synthetic accounts and separate private storage. The
actual shared General control was operated at 430-point tray width with native
IPC. Full → Compact → Mini and back to Compact were selected by keyboard. Native
samples confirmed sizes 320×158, 256×108 and 196×52, focused=false/visible=true,
identity retained and readings 28/54 unchanged. Mode persisted to the private
settings file with enabled=true/provider=claude. Compact and Mini were visually
inspected in dark/light themes; all readings, +1 and circular Hide fit the native
window. Main readout opening and theme propagation worked. Evidence:
release-artifacts/floating-modes-qa-20261128. Temporary QA entry points, app bundle
and native source hooks were removed before packaging. No real credentials or
installed settings were used for QA.

Actual OS reduced-motion toggling, physical dragging, monitor unplug/fullscreen
transitions and physical Intel execution remain manual checks. The previous fast
automated drag limitation is retained; this task does not claim to resolve it.
The standalone browser transport remains unavailable, but native webview content
and both new densities were inspected directly.

Comparable production totals from the preceding floating candidate: JS 636,791 →
637,999 bytes (+1,208), gzip 206,484 → 206,804 (+320); CSS 226,272 → 227,611 (+1,339),
gzip 38,665 → 38,837 (+172). No added dependency or duplicated asset.

**Owner check.** Settings → General → Floating usage → Display offers Full card,
Compact and Mini. Switch while enabled and while disabled, change service and
relaunch to check preservation. Mini uses the first selected Menu bar limit;
+count indicates more. Hover for all readings; drag its logo; click the reading
to open the existing panel. Check Full near a screen edge after enlarging Mini.
The former local DMG predates these modes; use the new local package or current
DEV app. No public release, commit, tag, push or version bump is authorized.

Final source checks repeated after removing synthetic QA hooks: TypeScript, all
537 frontend tests, 310 Rust library and 8 integration tests and both architecture
checks passed. Fresh security gate passed with the same outside-target findings.
Clean dev restart built successfully in 9.34 seconds with fresh native PID 91991,
Vite HTTP 200 on 5174 and a connected native WebKit client. Served settings include
the Display picker and served preview includes Mini. HMR logged a fresh index.css
update after touching the settings source. Release configuration and helper tests
passed. Latest native DEV app is left running.

After touching src/main.tsx with only the native WebKit client connected, Vite
logged `hmr update /src/main.tsx, /src/index.css` at 11:50:43 Tehran. The mode
implementation is live in the latest dev webview.


Local display-mode DMG: `release-artifacts/local-test-20261128-115025/Orbilap_1.0.4_display-modes_AppleSilicon.dmg`
(7,025,892 bytes), SHA256 `a88b47e9d73cf64944b7d8a55b1113b2ce5b2854073f78f01cca875f0f153840`. DMG integrity, strict deep ad-hoc
signatures, arm64-only architecture, 1.0.4 metadata, icon assets, mounted/built
binary equality and build-input SHA256 equality passed. Mount detached; immutable
source snapshot removed. Verification/provenance/input hashes/checksum/test notes
and logs accompany the artifact. This package is not notarized and contains no
signed updater archive. No installed app or account data changed; no publication.


# Visual floating-display picker

2026-11-28 · Done (local native verification)

**Acceptance criterion.** Show what Full, Compact and Mini look like before the
owner chooses a display, including while the floating surface is disabled.

Replaced the mode Select with shared visual RadioOption controls. All three
production-card previews appear together, with name, description, selected radio
mark and clearly labeled sample data. Samples use the chosen provider logo and
current theme. FloatingUsagePreview gains a decorative mode with span controls;
shared Progress supports inline markup so preview radios contain no nested
buttons, focus stops or invalid block controls. Clicking anywhere on the sample
selects its density; arrow keys/Space and shared disabled/focus states apply.
It preserves the existing saved mode, service and enablement contract and does
not create windows, invoke IPC, fetch quota data, or enable the floating feature.
Existing normal RadioOption/Progress use keeps its prior markup and behavior.

Applied emil-design-eng and animate to the changed settings/shared surfaces:
reuse home tokens, native-density previews and circular Hide decoration, with
instant selection and no new motion. The shared preview pattern is documented
in DESIGN.md; no new dependency, permission or Rust source change.

**Verification.** TypeScript passed and all 539 Vitest tests in 48 files passed.
Coverage includes keyboard selection, whole-sample selection, disabled locks,
service/enablement preservation, changed logos, no nested/focusable controls and
no native calls from previews. Existing selected/unknown/expired/native-event
coverage remains passing. Full production build, all 20 security/script tests and
fresh security gate passed for both supported macOS dependency trees; existing
other-target findings remain outside the supported build union. No credentials
were used or changed. No dependency or account boundary changed.

An isolated Tauri QA app loaded the actual settings component at tray width.
All three samples fit horizontally and can be compared by scrolling. Dark/light
native screenshots were inspected. Clicking Mini selected it while enablement
stayed off; Up selected Compact and moved focus. The existing shared radio focus,
hover and selected states remained visible; sample controls did not execute.
Evidence is in release-artifacts/floating-visual-qa-20261128. Temporary fixture
entry points, native QA source/binary/app/data were removed after verification.
OS reduced-motion was not toggled; this change adds no animation. Earlier physical
drag/fullscreen/monitor limitations remain for the actual floating window.

Comparable production totals: JS 637,999 → 639,422 bytes (+1,423), aggregate gzip
206,804 → 207,464 (+660); CSS 227,611 → 228,452 (+841), gzip 38,837 → 38,981 (+144).
Samples render the same production component rather than duplicate screenshots
or assets. The setting picker uses local synthetic values marked Sample usage.

**Owner check.** Open Settings → General → Floating usage. Under Display, compare
Full card, Compact and Mini, then click the preferred sample or use arrow keys/
Space. It saves through the existing settings path. Show floating usage stays
under your control. Change Service/theme to see the samples update. The native
floating window still uses your real active account and Menu bar limit selection.

Final clean restart succeeded: native build finished in 11.49 seconds, fresh DEV
PID 4544, Vite HTTP 200 on 5174 and served source includes the visual sample picker.
Only a native WebKit client was established before touching src/main.tsx; Vite
logged a fresh page reload at 12:02:13 Tehran. The latest native DEV app remains
running. Locked offline Rust was rerun: 310 library and 8 integration passed,
10 opt-in ignored and isolated child passed; host/Intel checks passed.


Visual-picker local DMG: `release-artifacts/local-test-20261128-120244/Orbilap_1.0.4_visual-picker_AppleSilicon.dmg`
(7,026,460 bytes), SHA256 `54f723b7bcf97e5b15aae98c3f4b92ffd8a592960e04f3dd6208f03b7affdca2`. DMG integrity, strict deep ad-hoc
signatures, arm64-only architecture, 1.0.4 metadata, packaged icons, mounted/built
executable equality and tested build-input hashes passed. Verification mount was
detached. Immutable source snapshot removed; input/provenance/checksum/test notes
and verification logs accompany the artifact. Not notarized; no updater archive,
installation, version bump, commit, tag, push or publication. Latest native DEV
PID 4544 and HTTP 200 on 5174 were verified at handoff.


# Combined Display settings and circular floating badge

2026-11-28 · Review (owner native device checks remain)

Owner asked to combine Menu bar and Floating settings, retire Full/Compact, and
add a round provider/short-limit/percentage badge. Chose the short tab name Display.
It retains internal menu-bar routing, with one TabsContent containing workspace
Menu bar controls followed by the machine Floating section. General no longer
contains floating settings. Mini (196×52) and Badge (100×100 including padding)
are the only options. Native serde migrates removed or unknown modes to Mini;
reset/default also uses Mini. Badge shows the provider mark, 5h/1w label and value;
its logo initiates dragging, reading opens home, and Hide appears on hover/focus.
Full identity/readings remain in the tooltip/accessibility summary. Preview samples
reuse the production renderer and preserve enablement/provider when chosen.

Applied existing emil-design-eng and animate guidance: shared visual RadioOption,
home tokens, circular geometry and immediate selection, no new motion/dependency.
Native synthetic fixture at tray width was visually checked in dark/light. Badge
selection preserved the off toggle. Fixture source, native harness and private
synthetic storage were removed. Evidence: release-artifacts/badge-qa-20261128.
Actual native badge focus/drag/fullscreen/monitor transitions remain owner checks;
visual fixture results do not substitute for those. No real credentials used.

Tests cover integration in Display, absence of retired options, preserved service/
enablement, short weekly label/percentage/provider, legacy migration and cached
mode-only changes. No public release, version bump, installation, commit or push.
This task updates the local dev source; previous DMGs retain their prior UI.

Verification completed: TypeScript, 540 Vitest tests (48 files), additional App
integration rerun (83 tests), locked offline Rust (310 library +8 integration,
10 opt-in ignored, isolated child passed), production build, 20 security/script
tests and both-macOS security gate passed. Other-platform findings remain outside
the supported build union. Dev clean restart finished in 12.58 seconds with fresh
native PID 15534 and Vite HTTP 200 on 5174; served source includes Display/Badge.
Latest native dev remains running. Production totals: JS 639,422 → 639,261 bytes,
gzip 207,464 → 207,730; CSS 228,452 → 228,644, gzip 38,981 → 39,010. No dependency.

Native WebKit connections were established before touching src/main.tsx for the
final live-source check; Vite logged the resulting HMR/reload.


# Always-visible multi-service floating circle

2026-11-28 · Review (owner physical device checks remain)

**Acceptance.** Display all selected provider logos and percentages together on
one circle, with no expanding menu or additional reveal action. One provider
uses a 60-point visible circle/28-point logo. Two or three use 76 points (88-point
native frame including padding), with two readings side by side or three in a
triangle. Reading values retain independent expiry, unknown states and direction.

Removed radial rendering, expansion state/timers/animation, native expand command,
permission allowlist entry and temporary position anchor. The only size change
occurs when selection changes between one and multiple providers. The entire
shared Button opens the existing panel; logo mouse-down retains native dragging.
A tooltip/accessibility description retains provider/account/limit information.
Settings previews use the same static renderer and independent service switches.
No Mini, +count, center Orbilap hub or extra explanations were introduced.
Applied emil-design-eng and animate: static frequent readings, shared materials
and circular Button, with no new animation. DESIGN/usage instructions updated.

**Native verification.** Isolated synthetic Tauri fixture rendered the production
component at tray width in dark/light, for one, two and three services. Adjusted
upper triangle spacing after observing touching numbers; final light/dark samples
show separate percentages. Evidence: release-artifacts/fixed-orb-qa-20261128.
Temporary native source, app, synthetic data and HTML/TSX entry were removed.
Fixture checks establish appearance, not actual monitor transitions or physical
dragging. Real account data was not used. Prior device limitations remain.

**Checks.** TypeScript passed; 535 Vitest tests (48 files) passed. Tests cover all
three simultaneous readings, one real button, no expand invocation, unknown and
expired values, selected-provider updates and native fixed sizes. Security/script
suite (20) and fresh both-macOS security gate passed; existing other-target audit
findings remain outside the macOS union. Rust first full rerun had an unrelated
time-budget timing assertion in antigravity automatic_budget_is_shared_across_requests_and_includes_response_body;
first failure retained at /tmp/orbilap-fixed-rust-first-failure.log. Full rerun
results are recorded below. No production code was changed to weaken that check.

Comparable production totals: JS 637,213 bytes (207,055 gzip), CSS 225,749 bytes
(38,589 gzip); no dependency added. Native expansion code and CSS were removed.
No version bump, package, installation, commit, push, tag or public publication.
The previous DMG predates this UI; test the current DEV app in Settings → Display.

Full Rust rerun passed: 312 library and 8 integration tests, 10 opt-in ignored;
isolated child passed. Intel offline check passed. First timing failure evidence
remains retained above; no claim that the timing test's flakiness is resolved.
Clean dev restart built in 9.63s with fresh native PID 77952, Vite HTTP 200 and
served production component containing simultaneous readings. Established native
WebKit connections preceded touching src/main.tsx; Vite logged fresh reload/HMR.
The latest native DEV app remains running. Physical dragging/fullscreen/monitor
transitions remain manual checks.


# Claude synthetic floating test

2026-11-28 · Local demo

Owner requested a test Claude reading. Added ORBILAP_PREVIEW_FLOATING=1 to the
existing independent dev supervisor's explicit environment allowlist. In debug
builds only, the existing synthetic Claude/Codex monitor fixture enables the fixed
floating orb with Codex 68% and Claude 72% remaining. No account/settings persistence
or credential probe is performed by this fixture; normal main UI and Vite native
IPC remain active. Unlike the older CLAUDE page preview, this flag does not alias
frontend native IPC or navigate away from the real app. Ready shows the synthetic
window without needing to persist enablement. Stop the fixture by running plain
pnpm run dev:restart. Release builds do not activate the fixture.

TypeScript, 535 frontend tests, 20 script/security tests and fresh supported-macOS
security gate passed. Locked offline Rust suite/check passed and repeated after
the final Ready change. Existing other-target findings and physical-device limits
remain recorded above. No new dependency, version bump, package or publication.

Final locked Rust rerun passed (312 library +8 integration, 10 opt-in ignored,
isolated child passed). Preview dev restart built in 4.62s with fresh native
PID 82644 and Vite HTTP 200 on 5174. Native WebKit connections were established
before touching main.tsx; Vite pushed a fresh reload. The running dev supervisor
retains ORBILAP_PREVIEW_FLOATING=1 for the owner's visual test. Main real-account
settings are unchanged; menu bar/floating monitor uses synthetic Codex/Claude.


# Compact concentric floating usage rings

2026-11-28 · Review (owner physical device checks remain)

Owner requested removal of logos and nested circular progress in logo colors.
The shared production floating component now renders up to three concentric SVG
rings at a constant 60pt visible/72pt native diameter. Codex uses theme-aware
monochrome, Claude the logo coral, and Antigravity blue/green/yellow/red gradient.
Canonical relative service order is preserved, packed outer-to-inner. There is
no larger multi-provider frame. One provider keeps a centered numeric percentage;
multiple providers use arcs with complete values in tooltip/accessibility details.
No extra interaction, popout, modes, labels, logos or count. Ring area remains the
drag target; whole Button opens the existing panel. Unknown/expired readings use
dashed tracks with no progress fill. Readings retain existing remaining/used
semantics and minimum positive remaining percentage. SVG gradient IDs are unique
per instance; settings preview uses the same production renderer.

Applied emil-design-eng and animate: frequent values update without animation,
shared Button focus/material/theme remains and all provider identity/value detail
is available as accessible text, beyond color alone. No dependency or permission.
DESIGN.md/USAGE_PREFERENCES.md/AGENTS.md record the shared pattern.

Native synthetic QA rendered one/two/three ring variants at tray width in dark
and light; tracks, gradient and centered single percentage were inspected. Evidence
in release-artifacts/rings-qa-20261128. Temporary HTML/TSX, native source harness,
app, binary and isolated synthetic data were removed. No real credentials used.
Actual drag/fullscreen/monitor transitions and physical Intel execution remain
manual checks inherited from earlier tasks. No new animation; OS reduced-motion
was not independently toggled. No public release, version bump or package produced.

Tests cover concentric radii/order, per-service arcs, zero vs unavailable, expired
readings, gradient, complete accessible descriptions, single-button behavior and
absence of expand IPC. Host/Intel native sizes now remain 72pt for any count.
The owner-authorized synthetic Codex/Claude demo is preserved in the running DEV
session; normal restart clears it without modifying real account settings.

Final TypeScript and 536 Vitest tests (48 files), locked offline Rust 312 library
+8 integration (10 opt-in ignored, isolated child passed), host/Intel checks, 20
security/script tests and fresh both-macOS security gate passed. Production build
totals: JS 638,088 bytes (207,163 gzip), CSS 225,312 (38,534 gzip). No dependency.

Final preview restart finished in 10.65s with fresh native PID 88853. Vite HTTP
200, served rings source and native WebKit connections were observed. Touching
main.tsx after established native connections pushed a fresh reload. Latest DEV
remains running with synthetic Codex/Claude data; normal restart clears the demo.


# Floating rings became dotted after opening the panel

2026-11-28 · Done (native reproduction and fix verified)

Owner screenshot showed all rings dotted/unavailable. Traced get_state to native
MenuBarMonitor.update replacing the debug fixture settings/profiles with real
settings, clearing synthetic identities. Debug monitor had no real probe worker
to replenish those samples. Fixed by rebuilding the explicit floating-demo
projection per native paint; actual main settings/storage are untouched and the
code is debug-only. Added a regression simulating get_state's settings replacement
and checking Codex/Claude readings survive (32/28 used). This fixes the demo data
loss rather than painting invented progress for missing real readings.

Changed actual unavailable styling from dense dashed tracks to muted continuous
unfilled tracks, with a centered — when every reading is unknown. Real zero still
shows 0% for a single service and remains distinct from unavailable. Added a DOM
regression for all-unknown vs zero. Existing ring colors, dimensions, expiry and
remaining/used semantics stay unchanged. Applied existing emil-design-eng/animate
guidance: quieter empty-state feedback with no spinner or new motion.

Native isolated synthetic QA used the actual secondary webview and real get_state
IPC: observed continuous colored rings, opened main, invoked state reload and
hid main; rings remained visible and colored afterward. Screenshot evidence in
release-artifacts/ringfix-qa-20261128/after-state-reload.png. Temporary fixture,
native source snapshot, app and synthetic data removed. No real credentials or
installed account settings changed. Normal restart clears the floating demo.
Physical drag/fullscreen/monitor limitations remain as earlier.

Final checks: TypeScript, 537 Vitest tests (48 files), locked offline Rust 313
library +8 integration (10 opt-in ignored, isolated child passed), host/Intel
checks, 20 security/script tests, production build and supported-macOS security
gate passed. Existing other-target findings remain outside supported macOS trees.
Production JS 638,129 bytes (207,211 gzip), CSS 225,303 (38,527 gzip), compared
with previous 638,088/207,163 JS and 225,312/38,534 CSS. No dependency added.
No new DMG, installation, version bump, commit, push, tag or publication.

Final preview restart built in 10.68s with fresh native PID 94425, Vite HTTP 200,
served all-unavailable handling and established native WebKit connections. After
touching main.tsx Vite pushed a fresh reload. Latest DEV remains running with the
Codex/Claude synthetic projection now preserved across real state reloads.


# Antigravity floating demo ring

2026-11-28 · Local demo

Owner requested Antigravity in the active synthetic floating test. Extended only
floating_demo() with a synthetic enrolled active Antigravity identity, an explicit
Gemini 4 Carbon · Weekly limit and 40% used/60% remaining sample. Canonical selected
providers now include Codex, Claude and Antigravity. The older Claude page fixture
is unchanged. The existing per-paint debug projection preserves all three readings
across real get_state reloads without writing account/settings or probing providers.
The regression now checks three identities and the Antigravity value. Production
code and frontend bundle are unchanged; no dependencies, permissions or version bump.
No real provider accounts or credentials were used or changed. Keep the existing
ORBILAP_PREVIEW_FLOATING=1 dev session; plain dev:restart clears the synthetic demo.

Validation passed: TypeScript, 537 frontend tests (48 files), locked offline Rust
313 library +8 integration (10 opt-in ignored, isolated child passed), host check,
20 script/security tests and supported-macOS security gate. Existing other-target
findings and physical device limits remain documented. No public package produced.

Preview restart built successfully in 3.98s with fresh native PID 97684 and Vite
HTTP 200 on 5174. Latest DEV remains running with three synthetic rings: Codex
68%, Claude 72%, Antigravity 60% remaining. This was a Rust-only fixture change;
served-source/HMR checklist does not apply. No real data changed.


# Permanently black segmented floating progress

2026-11-28 · Local implementation/verification

Owner reported white background on click/theme changes and requested the actual
Antigravity logo palette. During work owner chose one ring divided among services
rather than nested rings. Final renderer assigns each service an equal 1/N arc,
with gaps between services and independent progress within each arc. Two services
get halves; three get thirds. Empty/expired values keep their own muted tracks,
never borrow a neighboring service's reading. True zero draws no round-cap dot.
Codex is white, Claude coral, and Antigravity uses the bundled SVG's exact blue
#3186FF, green #00B95C, yellow #FFE432 and red #FC413D. The gradient maps across
its own progress segment, rather than sampling one small slice of a whole-circle
gradient. Single-service gradient avoids degenerate identical endpoints at 100%.

The shared floating surface now uses fixed black/white/gray material tokens with
explicit hover/active/focus background protection, independent of root theme.
Preserve Button pointer feedback, circular geometry, accessible details, read-only
preview, native dragging and existing click opening. No added animation or action.
Applied emil-design-eng/animate guidance to the corrected shared material. Native
frame and permissions unchanged. No Rust source, dependency or account change.

Isolated native fixture rendered production component with synthetic readings.
Clicked the orb in light theme and observed black background after the action;
switched root theme and observed same black orb in dark. Inspected final segmented
arcs/brand gradient and saved evidence in release-artifacts/segments-qa-20261128.
Temporary source harness, app/binary, fixture entry points and synthetic data were
removed. Instant held-pointer active frame was not independently captured; explicit
active rule is in CSS. Existing physical dragging/monitor/fullscreen limits remain.
No real credentials used. No new DMG or public publication.

Checks passed: TypeScript; all 538 Vitest tests (48 files); production build;
20 security/script tests; supported-macOS security gate. Existing other-target
findings remain outside the supported union. No src-tauri change, so the earlier
passing locked Rust checks remain applicable. Frontend tests cover equal radii,
segment starts/gaps, independent arc lengths, zero/unknown distinction, exact SVG
logo gradient palette and native IPC behavior. Final production bundle totals:
{'js': {'bytes': 638626, 'gzip': 207370}, 'css': {'bytes': 225453, 'gzip': 38567}}. No dependency added.

Clean preview restart succeeded: build finished in 11.43s, fresh native PID 9294,
Vite HTTP 200 on 5174, served segment renderer and established native WebKit
connections observed before touching main.tsx for final reload. DEV remains
running with synthetic Codex/Claude/Antigravity 68/72/60% remaining.


# Center logo and explicit progress endpoints

2026-11-28 · Local native verification

Owner requested the Orbilap mark centered, low test percentages and clearer start/
end boundaries. Reused existing AppLogo inside the ring (28pt, or 22pt plus numeric
value for a single provider). Center remains a native drag target; whole circle
opens the existing panel. No new action. Brighter #444 rail and two small external
#888 markers per segment make full extent visible. Markers at radius 28.5 stay
outside the colored stroke, so they cannot hide a 5% arc. Flat progress caps preserve
true low-value geometry. Black surface and exact Antigravity palette remain.

The explicit debug floating_demo now uses 95% used/5% remaining for each provider
and selected limit. Real readings and the older standalone Claude preview remain
unchanged. Reload-survival regression checks all three 95% samples. Frontend
regression checks the center mark, six endpoint marks and 5% per-segment lengths.
Applied existing emil-design-eng/animate: shared AppLogo/controls, stable static
readings, no animation/dependency. Native synthetic fixture inspected single and
three-service 5% cases in both themes, evidence in release-artifacts/endcaps-qa-20261128.
Temporary app/source/binary and HTML/TSX fixtures removed. No real accounts used.
Physical drag/fullscreen/monitor limitations remain. No new package/publication.

Final TypeScript, 539 Vitest tests (48 files), locked offline Rust 313 library
+8 integration (10 opt-in ignored, isolated child passed), host check, 20 script/
security tests, production build and both-macOS security gate passed. Existing
other-target audit findings remain outside supported macOS trees. Production JS
638,880 bytes (207,648 gzip), CSS 225,821 (38,665 gzip); shared existing app asset
reused, no new dependency.

Preview restart finished in 12.89s with fresh native PID 14370, Vite HTTP 200 on
5174 and served center-logo/endpoint source. DEV remains running with all three
synthetic providers at 5% remaining, preserving real account/settings data.

Established native WebKit connections preceded the final main.tsx touch; Vite
pushed the reload to the live client.


# Transparent center glyph, no endpoint dots, 50% demo

2026-11-28 · Local native verification

Removed all external endpoint dots and their CSS/geometry. Replaced the macOS
tile AppLogo with a shared transparent AppGlyph using the existing Menu bar alpha
mask, tinted white with no extra background. Center contains only this glyph for
any provider count; all percentages remain in tooltip/accessibility text. Preserved
black orb, segmented rails/gaps, exact brand gradients and click/native drag.
Debug floating_demo now sets all selected limits to 50% used/remaining. Real account
data and the old standalone Claude fixture are unchanged. Updated migration/reload
regression confirms all three demo samples remain 50 after settings reload.

Applied existing emil-design-eng/animate guidance: shared brand asset, no decorative
motion, cleaner center and no extra action. Native isolated actual floating window
showed three half-filled segments, the bare white circular glyph and no endpoints;
evidence release-artifacts/glyph-qa-20261128/native.png. Temporary synthetic data,
source/app/binary/HTML fixture removed. No real credentials or installed data used.
Physical dragging/fullscreen/monitor and physical Intel remain owner checks.

Checks passed: TypeScript, 539 Vitest tests (48 files), locked offline Rust 313
library +8 integration (10 opt-in ignored, isolated child passed), host check,
20 security/script tests, production build and supported-macOS security gate.
Production JS 638,609 bytes (207,701 gzip), CSS 225,680 (38,633 gzip); reused
existing alpha-mask asset, no added dependency. No new DMG or publication.

Clean preview restart built in 12.70s with fresh native PID 19113 and Vite HTTP
200 on 5174. Served source includes AppGlyph. Native WebKit connections observed
before touching main.tsx for live reload. Latest DEV stays running with all three
services at synthetic 50% remaining.


# Silver center glyph and rounded progress caps

2026-11-28 · Done (local native verification)

Owner supplied a shaded circular mark and asked to restore logo effect, preserve
shape and round the progress ends. Restored round linecaps while preserving service
gaps/zero handling. Applied a static silver highlight gradient and subtle edge
shadow inside the existing transparent alpha-mask glyph. Source mask is 46×36 with
centered 34×34 alpha artwork; mask dimensions scale both source axes equally so
only transparent padding is excluded, with no stretching/deformation. No new logo
asset, background tile or movement. Existing black orb and 50% synthetic demo stay.
Applied emil-design-eng/animate: static material, existing shared component and no
frequent-action animation. Native isolated actual floating webview visually checked
silver circular center and rounded arcs. Evidence: release-artifacts/silver-qa-20261128.
Removed temporary synthetic harness/app/data/HTML/binary. No real account changes.
TypeScript, 539 Vitest tests (48 files), production build and 20 security/script
checks passed. Rust behavior/permissions/dependencies unchanged. Earlier physical
drag/fullscreen/monitor limitations remain. No new DMG/version/publication.

Production bundle totals: {'js': {'bytes': 638609, 'gzip': 207695}, 'css': {'bytes': 225841, 'gzip': 38726}}. Shared existing mask reused; no dependency.

Clean preview restart finished in 12.88s, fresh native PID 21979 and Vite HTTP
200 on 5174. Served CSS contains silver material; native WebKit connections were
observed before main.tsx live reload. Latest DEV stays running with 50% demo.


# Slightly smaller floating center logo

2026-11-28 · Local adjustment

Owner requested a slightly smaller center mark. Reduced shared AppGlyph from
28×28 to 24×24 points, preserving equal-axis scaling, silver material, center
position, 60pt orb and existing progress geometry. Updated DESIGN.md. Applied
existing emil-design-eng/animate direction: no motion or new pattern. No Rust,
account/permission/dependency change. Current synthetic demo remains 50% for all
services. No package or publication.

TypeScript, 539 Vitest tests (48 files) and production build passed. JS total
638,609 bytes unchanged; CSS 225,841→225,839 bytes. No dependency or asset added.
Served CSS includes 24pt dimensions and a connected native WebKit client was
observed; latest dev is clean-restarted with the prior synthetic preview flag.

Clean restart built in 0.52s with fresh native PID 24195, Vite HTTP 200 on 5174.
Native WebKit connections preceded main.tsx touch; Vite pushed live reload.
Latest native DEV remains running with the 24pt mark and synthetic 50% readings.


# Rounded arc paths, smaller center and per-limit hover

2026-11-28 · Review (native tooltip dwell/OS presentation remains owner check)

Owner reports progress end still flat, asks smaller logo and per-sector limit/value
tooltip. Reduced silver glyph 24→20pt. Replaced normalized dashed circles with
real SVG arc paths and explicit rounded stroke-linecap on BOTH the track and
colored progress. Full-circle geometry splits into two arcs; true zero still omits
fill. Kept service gaps, fixed black material and exact per-arc brand gradient.
Each entire sector gets an 11-unit transparent stroke target and native SVG title
with provider, account, friendly limit name, value and remaining/used direction.
Removed the enclosing HTML tooltip to avoid masking sector titles. Center title
keeps full summary; parent accessible description retains every reading without
adding nested controls. Native titles avoid HTML tooltip clipping in a 72pt frame.
No extra IPC/window creation/resizing, new provider requests or dependency.

Applied existing emil-design-eng/animate: stable frequent quota geometry, shared
materials and no new motion. Native synthetic actual floating view inspected:
rounded rail/progress ends and smaller silver center confirmed. Evidence:
release-artifacts/arctips-qa-20261128/native.png. Removed temporary source/app/binary/
HTML/isolated data. Native OS tooltip dwell/outside-window presentation was not
independently captured; owner should hover each sector to confirm. Tests validate
actual per-sector title text/geometry/round attributes and whole-button semantics.
Earlier physical drag/fullscreen/monitor limitations remain. No real credentials.

Final checks passed: TypeScript, 540 Vitest tests (48 files), production build,
20 security/script tests and supported-macOS security gate. Existing outside-target
findings remain outside the supported union. No Rust production source changed.
Bundle totals JS 638,899 bytes (207,831 gzip), CSS 225,971 (38,754 gzip); no new
dependency/assets. Previous native 50% fixture retained for owner test.

Final dev restart succeeded: native PID 29788, Rust dev build 13.47s; Vite HTTP200
and served floatingArc source verified. Established native WebKit connections on
5174 followed by a fresh frontend HMR/reload after touching the renderer.

# Wider floating ring gaps and solid Antigravity blue

2026-11-28 · Implemented; owner visual review

Owner chose wider gaps with rounded caps and solid logo blue. Increased segment
gap from 4% to 7% of circumference; remaining arc length still determines the
percentage. Kept both track and progress round caps and all tooltip targets.
Antigravity now uses #3186FF; removed unused SVG gradient definitions/useId.
Updated the current design and local rule to preserve this owner decision.
Emil/animate guidance applied: stable frequent usage data, no new motion.

TypeScript, all 540 Vitest tests in 48 files, production build and diff whitespace
check passed. Native dev restart succeeded (PID 32440, build 2.64s). Served source
on 5174 contains 7% gap and solid blue; established native WebKit connections
preceded fresh HMR/reload at 15:11. Debug binary cannot be addressed by Sky;
therefore a new native screenshot was not captured. Owner can inspect the running
50% three-provider demo. No native code, account data or dependency changes.
Production bundle totals: {'JS': (638204, 207560), 'CSS': (225971, 38754)}. Previous JS total 638899 bytes; CSS 225971 bytes.

# Floating Near limit colors

2026-11-28 · Implemented, native owner review

Floating per-limit snapshots now carry warningColor resolved with the existing
Menu bar threshold/color helper and active workspace Near limit toggle. Each
displayed limit uses actual used capacity; remaining display direction does not
reverse thresholds. Below threshold/disabled restores provider hues. Invalid or
expired quota stays unfilled. All changes publish through the existing cached
monitor; no new IPC permissions or credential requests. Debug 50% demo keeps
synthetic identities while following real workspace warning controls, allowing
custom thresholds to be exercised without changing real quota.

Applied existing Emil design and animate frequency gate: static warning tint,
existing round geometry, tooltip details and theme-independent black retained.
TypeScript, 541 Vitest tests (48 files), cargo check --offline --locked and locked
Rust suite passed (315 library + 8 integration, 10 opt-in ignored; child passed).
20 security/script tests passed; security:check passed both macOS architectures.
Existing other-target Rust findings retained, no new dependencies. Production
build passed; no package or release requested. Native visual hover/color review
remains with owner; debug executable is not addressable by Sky.
Bundle totals bytes/gzip: {'JS': (638233, 207550), 'CSS': (225971, 38754)}; prior JS638204/207560 CSS225971/38754.

Final native restart: PID38735, dev build4.55s; served warningColor code on5174,
established native WebKit connections followed by renderer HMR/reload confirmed.

# Settings floating glyph safe paint area

2026-11-28 · Implemented; owner visual review

Owner screenshot reports bottom clipping in Settings preview. Existing mask
expanded the 34x34 alpha bounds to the complete 20pt paint box, leaving no room
for edge antialiasing. Keep visible artwork at20pt but render its proportional
46x36 mask in a24pt non-shrinking box with2pt safe inset. Silver gradient/shadow
and shared preview/native renderer retained. Updated DESIGN. No interaction or
motion changes (Emil/animate stable-data guidance). TypeScript,541 Vitest tests
in48 files, production build and diff check passed. CUA browser connection failed;
Sky cannot address the debug executable, so new native visual verification remains
with owner. No production Rust, dependencies, account data or permissions changed.
Bundle bytes/gzip: {'JS': (638233, 207579), 'CSS': (225979, 38757)}; prior JS638233/207550 CSS225971/38754.

Final dev restart succeeded: PID42957,8.99s build. Served CSS safe mask sizing
verified on5174; native WebKit established before fresh floating.css HMR update.

# Remove floating hover tooltips

2026-11-28 · Owner requested rollback of floating hover feature

Removed per-sector SVG titles, transparent tooltip hit paths, their CSS and center
HTML title. Retained screen-reader description, rounded geometry, warning colors
and native drag/open behavior. Updated current design/user documentation and the
existing regression assertion to require no tooltip titles/hit targets. Emil design
applied to the same surface; no interaction animation needed. TypeScript and
production build passed. No Rust, credential, account or dependency changes.
Production bundle bytes/gzip: {'JS': (638109, 207538), 'CSS': (225868, 38730)}.

Final checks:541 Vitest tests/48 files passed; diff clean. Restart native PID44899,
build0.53s; served source has no titles/hit paths; established native WebKit
connections followed by fresh HMR/reload. Latest demo left running.

# Floating enabled state and active-account eligibility

2026-11-28 · Implemented; owner native visual review

Show floating usage off disables provider controls and dims the decorative preview.
Provider labels/switches and sample segments require a real active account in the
current workspace. Reused activeProviderAccountId with existing account lists,
including the already-loaded Antigravity list (no additional quota requests).
Saved provider selections survive temporary unavailability and toggling another
provider. No eligible selected providers means no native segments and the orb is
hidden; late webview Ready cannot reopen an empty orb. Unknown quota remains
unfilled for eligible active accounts. Existing IPC/private cache unchanged.

Emil/shared Switch disabled styling reused; preview dims statically, no new motion.
Updated DESIGN and usage docs. TypeScript,543 Vitest tests/48 files, production
build, cargo check --offline --locked and locked Rust suite passed (316 library,
8 integration,10 opt-in ignored; child passed).20 security/script tests and both
supported macOS security gates passed; existing other-target findings retained.
No dependencies or account-data writes. Final normal dev restart deliberately
omits the forced synthetic-floating flag so real account eligibility/toggle behavior
can be tested. Sky cannot address debug executable; visual disabled state/real
account switching remains owner review.
Bundle bytes/gzip: {'JS': (638426, 207661), 'CSS': (225987, 38753)}.

Final normal native restart:PID49384,build4.34s. Served controlsDisabled code
verified on5174; established native WebKit connection before fresh settings HMR.

# Independent floating limit selection

2026-11-28 · Implemented and verified with native synthetic Settings surface

Added one limit choice per selected provider beneath its switch, reusing Menu bar
limit rows/model grouping and shared RadioGroup. Saved in private machine
floatingUsage.windows keyed by provider; existing settings retain first Menu bar
limit until changed. Selecting Floating never mutates Menu bar selections.
Unavailable saved choices stay visible and unfilled; selected accounts/workspace
filter stale cached options. Provider eligibility, disabled master/busy controls,
black orb, rounded arcs, Near limit rules and no-hover design retained.

Main-only floating_usage_limit_options plus main-only floating-limit-options-updated
project existing native monitor profiles. No second quota request, credential probe,
poll loop or secondary IPC permission. Floating window is denied the new command.
Normalized provider keys/window lengths/control characters; preferences roundtrip
and cache/error redaction covered by locked Rust tests. Extracted shared limitGroups
to avoid duplicate Menu bar/Floating rendering logic.

Native QA in isolated bundle with synthetic Codex/Claude accounts: actual cached
options loaded, Weekly click changed choice, Left arrow selected5-hour, both themes
rendered and master-off disabled every provider/radio while dimming preview. Local
QA wrapper saved choices to its React state; native persistence/readout are covered
by Rust roundtrip/snapshot tests. No real credentials/accounts used. Evidence:
release-artifacts/floating-limits-qa-20261128/{dark,light,disabled}.jpeg. Removed
temporary bundle/source/HTML/TSX/data and stopped only its PID.

Final TypeScript,544 Vitest tests/48 files, production build, cargo check --offline
--locked and Rust suite passed (317 library+8integration;10opt-in ignored;child
passed).20security/script tests passed; security:check passed Apple Silicon/Intel,
with existing outside-target findings retained. No dependency or version change;
no package/release. Full physical account-switch/monitor scenarios remain owner
checks. Final ordinary dev restart uses real account eligibility.
Bundle bytes/gzip: {'JS': (640272, 208157), 'CSS': (225987, 38753)}; preceding totals recorded in prior task.

Final native dev PID58166,build10.24s. Served RadioGroup/cache-options source
verified on5174; established native WebKit preceded fresh Settings HMR update.
Latest normal native app left running.

# Single-provider floating ring seam

2026-11-28 · Implemented; native visual review outstanding

Owner screenshot showed a closed, ambiguous ring for one provider at 100%.
FloatingUsagePreview now retains the existing 7% circumference gap for one
provider as well, centered at twelve o’clock. Track and fill share the same arc,
so a full reading has distinct round endpoints; partial/zero/unavailable readings
retain the same reserved seam. Settings and native floating reuse this component.
Updated the current design system. Applied emil-design-eng and animate frequency
gate: static data, no added motion or control styling.

Verification: pnpm exec tsc --noEmit passed; pnpm exec vitest run passed all
544 tests in 48 files. pnpm run dev:restart succeeded; native build finished in
0.57s and fresh target/debug/orbilap PID 76292 remained running. Served source on
5174 contains const gap = 7. Established WebKit PID 76386 connection confirmed
before touching the component; fresh HMR update/invalidation and downstream update
were logged at 15:55:33. No Rust, dependencies, versions or security surfaces changed.
Sky could not address the debug app (name timeout, bundle identifier ambiguous);
CUA browser transport failed with native pipe closed. Live browser snapshot and
native visual checks in both themes/focus/pointer remain unverified. Owner check:
with one active provider at 100%, confirm a small black seam at twelve o’clock.

# Single-line limit group labels

2026-11-28 · Implemented; actual tray visual check remains Review

Acceptance: Antigravity Gemini and Claude/GPT model labels and their 5-hour/Weekly
choices stay on one line at the owner's screenshot width. Shared Menu bar and
Floating layout uses content-sized aligned columns and nowrap model labels;
Claude/GPT display copy matches home (Claude & GPT). Full selection keys and
accessible limit names are preserved; ungrouped providers span both columns.
Emil review recorded in DESIGN.md. Static layout correction adds no motion and
leaves shared controls, focus, disabled/pointer and reduced-motion rules intact.

Verification: tsc --noEmit passed; all 544 Vitest tests across 48 files passed;
production build passed. A temporary native AppKit/WKWebView synthetic preview
loaded current Vite CSS/components at 341pt width in dark and light: all four
model labels had one text rectangle, each pair had equal y coordinates, and no
group overflowed. Both Checkbox and RadioGroup variants were checked. Temporary
QA files/executable removed. Native tray automation could not address the debug
app (Sky timeout/ambiguous installed bundle); browser preview service returned
native pipe closed. Actual tray visual, focus and pointer review remains open.

Dev restart passed, native debug PID 77953, Rust dev build finished in 0.51s.
Established WebKit connections on 5174 preceded fresh surfaces.css HMR at 15:56:38.
Served CSS and compact label source verified; latest normal native app left running.
Owner check: Settings → Display → Antigravity in Menu bar and Floating; confirm
Claude & GPT remains one line alongside 5-hour/Weekly in both themes.
Bundle compared with preceding recorded build: JS 640337 bytes /208171 gzip
(+65/+14); CSS 226094 /38786 (+107/+33). No dependencies/version changes.

# Hide provider cards without workspace accounts

2026-11-28 · Implemented; native visual review outstanding

Owner requested hiding the provider card entirely when it has no account.
An omitted Antigravity membership list previously acted like unrestricted
membership in activeProviderAccountId, allowing a local active login to expose
its Floating settings card despite no account in the workspace. Treat missing
Antigravity IDs as empty, consistent with Menu bar membership. Existing Codex
membership and legacy Claude behavior remain. Saved provider choices are retained.
Updated the current design system; applied emil-design-eng and animate frequency
gate, with no added motion or shared-control changes.

Acceptance: a locally active Antigravity account with omitted or empty workspace
membership does not enter Floating's available providers/active accounts. Extended
the existing WorkspaceSettings integration case for omitted membership.
TypeScript passed; all 544 Vitest tests in 48 files passed (maxWorkers=2), and the
22 focused WorkspaceSettings/accountActivity tests passed again. An earlier suite
ran while another chat changed the floating callback contract and failed its
old expectation; the current suite passed with the updated contract. No Rust,
credential storage, provider requests, dependency or version changes in this task.
Native source was served on 5174; established WebKit connection and fresh
WorkspaceSettings HMR logged at 15:58:09. Native visual inspection blocked:
Sky cannot target the debug executable and bundle ID is ambiguous; browser
transport reports native pipe closed. Owner check: open Display with no
Antigravity account in the workspace and confirm its Floating card is absent.

# Consistent Menu bar and Floating settings controls

2026-11-28 · Implemented; native visual review remains Review

Acceptance: both Display sections use matching checkbox marks, labels, provider
icons, active-account identity, spacing, separators, pointer targets and disabled
states. Extracted UsageLimitChoices and UsageProviderChoice, consumed by both
WorkspaceMenuBar and FloatingUsageSettings. Floating receives active account names
from already-loaded workspace lists; no additional data requests. Its existing
one-limit-per-provider contract remains: selecting another replaces the choice,
clicking the selected choice retains it. Visible help explains that constraint.
Menu bar retains independent multiple choices. Preserved cached identity filtering,
saved choices, master-off/busy locking, accessible labels and private IPC scope.

Applied emil-design-eng and animate: reuse shared control feedback, keyboard focus,
reduced-motion and theme tokens; no new motion or dependencies. Current DESIGN
records the shared components and supersedes Floating radio-dot controls.

Verification: tsc --noEmit passed. All 544 Vitest tests/48 files passed, including
updated workspace name projection, checkbox selection/replacement, retained checked
choice, disabled and stale-account cases. Production build passed. Bundle JS
640773 bytes/208320 gzip vs preceding 640337/208171 (+436/+149); CSS
226093/38787 vs226094/38786. Served shared controls verified on5174. Native
WebKit connection preceded fresh UsageDisplayControls HMR at15:58:02, followed by
FloatingUsageSettings and WorkspaceMenuBar updates. Sky could not address debug
executable (name timeout, ambiguous bundle id, executable path invalid); CUA
browser transport returned native pipe closed. Actual tray visual checks in both
themes, pointer/focus and reduced motion remain unverified. No Rust changes in
this task. Existing unrelated work retained. Owner check: Settings → Display;
compare both provider/limit rows, select Weekly in Floating and confirm only its
checkbox is checked; Menu bar choices remain independent.

Final dev restart succeeded after overlapping local dev activity settled. Native
build finished in 4.26s, fresh target/debug/orbilap PID 86143; Vite served the
correct membership fallback on port 5174. Latest native dev app left running.

Final restart limitation: dev:restart successfully started the supervisor, Vite
and a successful Rust dev build (0.50s), but target/debug/orbilap then exited0
and its supervisor stopped. Concurrent native QA processes83339/84937 from
/private/tmp/orbilap-single-full-qa/Orbilap Ring QA.app remained active; these
use the debug single-instance identity and intercept ordinary dev launches.
Preserved that other chat's active QA work. Earlier native HMR evidence above
remains valid; latest ordinary native app could not be left running while that
instance owns the endpoint. Resume with pnpm run dev:restart after QA closes.

## Native visual verification — single-provider full ring

2026-11-28 16:00 Tehran · Native visual acceptance passed

Ran a disposable debug app bundle with a unique QA identifier, isolated private
data directory and existing ORBILAP_PREVIEW_FLOATING mode (no provider probes).
Temporarily restricted the debug fixture to Codex and used=0 (100% remaining).
Restored the exact source bytes after copying the QA executable. The real native
Floating usage window rendered the unchanged shared FloatingUsagePreview at 60pt
inside its 72pt frame. Sky screenshot visibly confirms separated round endpoints
and a clear black seam at twelve o’clock at full fill. Screenshot:
release-artifacts/single-provider-full-qa/native.png. This is native synthetic QA,
not a browser rendering or real account reading. Closed only QA processes and
removed temporary bundles/data; retained the screenshot. Normal dev supervisor
running on 5174, native build succeeded (0.51s). No permanent product source edits.

Repeat verification: TypeScript passed; FloatingUsage tests 16/16 passed. Full suite
542/544 passed: current App Display test cannot find Show floating usage, and
WorkspaceMenuBar Antigravity error text is not visible. These failures are outside
the unchanged ring rendering; full suite is not reported as green. Prior 544/544
result above remains historical. Current native seam visual acceptance is complete.

# Menu bar settings density redesign

2026-11-28 · Implemented; Review for actual tray visual acceptance

Owner asked to reduce Menu bar settings clutter while preserving Orbilap's current
language, using Meng To. No design skill named mengto/Meng To exists in the
available skill roots; the X-writing skill is unrelated. Requested an exact path
asynchronously and continued the independent layout work using the mandatory
emil-design-eng and animate guidance. Do not claim that a Meng To skill ran.
The existing React/Vite/Tauri stack, shared controls and account behavior remain.

Acceptance: Display shows one location at a time, Menu bar or Floating. Keep the
master switch and sample readable, secondary appearance/color settings discoverable
through closed summaries, provider/limit controls available, and choices/focus safe
across navigation and saves. The existing equal-width segmented control changes
only local view state; both surfaces stay mounted and retain their values. Shared
SettingsDisclosure uses native details/summary and DisclosureSummary, theme inset
material, setting typography and focus tokens. No new dependencies or motion.
Keyboard and reduced-motion responses stay immediate. Added saved-state summaries
and updated DESIGN.md, including the superseded Appearance description.

Verification:
- pnpm exec tsc --noEmit passed.
- pnpm exec vitest run: 546 tests / 48 files passed. Added navigation/value retention
  and collapsed-summary checks; adjusted the app entry test to choose Floating.
- pnpm run build passed. Comparable production JS: 640773 → 641732 bytes,
  gzip 208320 → 208563 (+243). CSS: 226093 → 226156 bytes,
  gzip 38787 → 38869 (+82). No version or dependency changes.
- Temporary AppKit/WKWebView fixture rendered the actual SettingsModal and shared
  components with synthetic accounts and mocked IPC, using current Vite source.
  Both themes at 380pt and narrower 341pt: closed/open settings and Floating
  navigation had no horizontal overflow; saved summaries appeared; inactive
  location was hidden; disclosure keyboard focus had a visible 3px shared outline.
  Screenshots reviewed at both widths. This is a renderer check, not the actual
  tray or a physical keyboard/pointer/reduced-motion acceptance run.
- pnpm run dev:restart passed: Vite HTTP 200 on 5174, native dev build 0.53s,
  fresh target/debug/orbilap PID 93284. With fixture processes stopped, native
  WebKit Networking PID 93359 had established 5174 connections before touching
  WorkspaceMenuBar.tsx; fresh HMR update logged at 16:05:31. Served source contains
  Display location, Providers & limits and SettingsDisclosure. Latest ordinary
  native dev app remains running.
- No Rust or security/account-data behavior changed. No release or publication.

Evidence: release-artifacts/menubar-redesign-20261128/ contains synthetic dark/light
closed, expanded and Floating screenshots, WebKit measurements, test/build logs
and comparable bundle totals. Temporary fixture sources and renderer executable
were removed. Preserve the existing unrelated working tree.

Limitations: CUA browser service returned native pipe closed; Sky could not address
the unbundled development app (name timeout, installed bundle ambiguity, debug
path/dev identifier invalid). Actual tray visual/focus/pointer review remains open.
Owner check: DEV tray → Settings → Display; switch Menu bar/Floating, open Appearance
and Limit colors, verify the existing home style in both themes and that saved
selections stay intact. Supply the Meng To design skill path if a specific skill
was intended. The existing system remains the visual reference for this revision.

# Single Limit colors switch

2026-11-28 · Implemented; actual tray visual acceptance remains Review

Owner decision: replace Limit colors disclosure and its multiple levels with one
switch. Only less than 15% remaining turns red; exactly 15% keeps normal colors.
WorkspaceSettings reuses shared setting-row and Switch with accessible help,
busy locking, keyboard activation and existing theme/focus/pointer behavior.
Removed threshold rows and their unused CSS. Menu bar and Floating share the fixed
native rule (>85% used, red #ff453a), independent of remaining/used display mode.
Legacy saved thresholds are retained for compatibility but ignored, including
empty lists. Off restores normal tint/provider colors; expired/unknown limits
cannot escalate warnings. Removed obsolete yellow appearance adaptation.

Applied emil-design-eng and animate frequency gate: no new motion or dependencies.
Updated current DESIGN and usage documentation; no version/release changes.
Acceptance coverage includes pointer/keyboard saves, no disclosure/level switches,
legacy disabled thresholds, strict 85% used boundary, nonfinite values, expiry,
recovery and shared menu bar/Floating behavior.

Verification: TypeScript passed; all 545 Vitest tests / 48 files passed with
maxWorkers=2. cargo check --offline --locked and cargo test --offline --locked
passed (317 library, 8 integration, 1 subprocess; 10 opt-in ignored). Production
build passed; JS 641732 → 640643 bytes, gzip 208563 → 208315; CSS 226156 → 224775,
gzip 38869 → 38661. No security/account-data boundaries or provider probes changed.
No credential fixtures or exports were used. git diff --check passed.

Native UI automation unavailable: node_repl / @oai/sky reports “Trusted RPC service
is not configured: sky”; browser automation is unavailable in this session.
Actual tray visual acceptance in both themes, pointer/focus and reduced motion
remains unverified. Owner check: Settings → Display → Menu bar, confirm one Limit
colors switch and no expandable color settings; enable it and check a reading
below 15% remaining turns red, while exactly 15% and above keep the normal color.

Final dev verification: pnpm run dev:restart succeeded. Native watcher rebuilt in
1.59s and fresh target/debug/orbilap PID 4594 stayed running; Vite returned HTTP200
on port5174 and served the below-15% copy. Established native WebKit Networking
PID4661 connections preceded touching WorkspaceSettings.tsx; fresh HMR update
logged at16:16:09. Final test-only cleanup's focused Rust regression passed.
Latest ordinary native dev app left running. Live browser snapshot unavailable
as described above; served-source/HMR evidence does not replace visual acceptance.

# Remove five static settings helper lines

2026-11-28 · Implemented; actual tray visual acceptance remains Review

Owner requested removal of the five lines shown in screenshots: update-check
schedule, Menu bar sample caption, shortcut description and idle recorder hint,
and refresh interval explanation. Removed those visible lines and their unused
CSS. Keep the sample’s accessible figure label and recording instructions only
while capturing keys. Removed dangling aria-describedby references. Existing
shared headings, controls, action rows, focus and motion rules are retained.
Applied emil-design-eng; no interaction or new motion needs animate.

Verification: TypeScript passed; all 545 Vitest tests / 48 files passed. Existing
sample visibility assertion now locates the named figure. No Rust, account-data,
security, dependency or version changes. git diff --check passed. Native restart
built successfully in 6.90s, fresh debug PID 7274; Vite HTTP 200 served the updated
SettingsModal without either removed line. Established native WebKit Networking
PID 7488 connections preceded touch; HMR logged at 16:18:20 for SettingsModal and
both changed stylesheets. Normal dev app left running.

Visual limitation: Sky display-name lookup timed out, bundle identifier was
ambiguous between installed bundles, and the exact debug executable was rejected
as Invalid app. CUA browser inventory returned native pipe closed, so no live
browser snapshot or actual tray screenshot/focus/pointer/theme review is claimed.
Owner check: dev tray → Settings → General / Display → Menu bar / Updates; confirm
all five lines are absent and shortcut capture still shows its active guidance.

Final restart after stylesheet cleanup: native build passed (0.19s), fresh debug
PID 8780; all three changed TSX modules served via curl on 5174 with removed copy
absent. Native WebKit Networking PID 8833 connected before touching shortcut TSX.

# Fix deadline display to Time remaining

2026-11-28 · Implemented; native visual acceptance remains Review

Acceptance: deadlines use Time remaining for new and existing preferences,
including a legacy Date & time selection. General exposes no Deadline display
section or either option; Clock format remains available and persists.

Removed the settings section and normalized loaded/saved deadline preferences
to remaining. Updated existing preference migration and settings tests.
Applied emil-design-eng and retained shared spacing, controls and interaction
behavior; no new motion requires animate. DESIGN.md records the owner decision.

Verification: TypeScript passed; all 545 Vitest tests in 48 files passed.
The initial test process was stopped by dev:restart's project cleanup; the full
suite then reran successfully. git diff --check passed. Native dev restarted,
Rust dev build passed (0.51s), fresh debug PID 11234. Port 5174 serves the
updated settings without the retired section/options and preferences normalize
to remaining. Native WebKit Networking PID 11320 had established connections
before touching SettingsModal.tsx; HMR update logged at 16:20:29 Tehran.
The latest native dev app remains running. No Rust or dependency changes.

Visual limitation: the display-name UI target resolved to the installed release
(tauri://localhost), so it was not used to validate current source. Exact debug
executable lookup returned Invalid app. Browser inventory returned native pipe
closed before response. Native tray appearance in both themes, focus, pointer
and reduced-motion checks therefore remain unverified.

Owner check: open the dev tray panel → Settings → General. Confirm Color theme
is followed by Clock format with no Deadline display options; account expiry
and reset countdowns should use remaining time, even with a former date choice.

# Move key combination recording into a popup

2026-11-28 · Implemented; actual tray visual acceptance remains Review

Owner requested moving the Key combination action into a popup. General keeps
its saved shortcut button. The existing compact AppModal now contains recording,
validation, paired Cancel / Save shortcut controls and active capture guidance.
Uses shared workspace-action-popup, workspace-form, Button and action-row without
new CSS, dependencies or native IPC. Applied emil-design-eng and animate; reuse
existing modal motion and reduced-motion behavior, with no recording animation.
Focus moves to the enabled recorder after the capture bridge is ready and returns
to the trigger on cancellation. Escape/blur cannot dismiss while saving. Conflict,
invalid input, native recorded combinations and listener teardown remain covered.

Verification: TypeScript passed; all 546 Vitest tests / 48 files passed with
maxWorkers=2. Locked offline Rust check and suite passed (317 library, 8 integration,
10 opt-in ignored). No Rust, security/account-data or version changes. Native dev
restart built successfully in 4.91s, fresh PID 13157; served TSX includes the popup.
Native WebKit Networking PID 13317 had established connections on port 5174 before
HMR updated PanelShortcutSettings at 16:21:42. Final restart follows layout reuse.

Native UI limitation: Sky display-name lookup timed out, bundle identifier is
ambiguous and the exact debug executable is rejected as Invalid app. Browser
inventory reports native pipe closed. Actual tray appearance in both themes,
focus/pointer/reduced-motion and live browser snapshot remain unverified. Owner
check: tray → Settings → General → Key combination, record a combination and
Cancel or Save shortcut; verify the popup closes and General keeps the saved key.

Final verification: restarted latest source; native build finished in 0.18s and
fresh debug PID 15171 remains running. Vite returned HTTP 200 and served both the
popup title and shared workspace-form layout. Established WebKit connections
confirmed before final HMR touch. Focused popup tests passed (8/8) after layout
reuse; full suite result above remains applicable.

# Always include reset predictions and show a home sample

2026-11-28 · Implemented; native visual acceptance remains Review

Acceptance: remove Include predictions from Usage settings; eligible forecasts
remain visible with reset updates enabled even for legacy false preferences.
Show a dismissible 40% sample in the development home Codex section, clearly
labeled Preview · Sample data. Keep the real reset master switch and live-data
validation. Packaged builds do not mount the sample.

Applied emil-design-eng and animate: reused the home notice, shared circular
close Button, focus recovery and existing pointer-only snapRemoval; keyboard
and reduced-motion dismissal stay instant. No new styles, motion or dependencies.
Legacy preference fields remain compatible but no longer control forecasts.
Sample requests no provider data and does not write real reset dismissals.

Verification: TypeScript passed and all 546 Vitest tests in 48 files passed.
Restarted dev through dev:restart; native build finished in 0.17s, fresh debug
PID 16438. Vite serves updated notice source on port 5174. Native WebKit
Networking PID 16571 had established connections before touching the notice;
Vite recorded its HMR update at 16:23:33 Tehran. Native dev remains running.
UI verification was blocked: native automation timed out by app name, bundle
identifier was ambiguous, debug binary path was rejected; browser automation
failed with native pipe closed. Both-theme visual, pointer and native keyboard
checks therefore remain Review. No Rust or account-data changes.

Owner check: open the dev tray home and inspect Possible reset / 40% chance /
Preview · Sample data above Codex accounts. Its close button dismisses only the
sample. Settings → Usage has Show reset updates and no Include predictions.

Final post-change verification: TypeScript and all 546 tests passed again. Final
dev restart built in 0.59s with fresh debug PID 18164; Vite returned HTTP 200.

# Remove the accepted reset preview

2026-11-28 · Done (owner accepted the preview)

Owner requested removal after visual review. Removed the development home sample,
its fixture/preview-only component branches and its dedicated test. Live forecasts
remain enabled independently of legacy Include predictions preferences. Existing
home styling, circular dismiss control, focus and reduced-motion behavior remain.

Verification: TypeScript passed. Full Vitest run: 545 passed, two failures in
PanelShortcutSettings.test.tsx (disabled shortcut trigger and saved recorder text),
which is outside this change; all reset/account/settings suites passed. Other
workspace edits continued during this run. git diff --check passed. Requested
native dev restart; a subsequent dev supervisor restart completed a 4.74s native
build, fresh PID 21460. Vite served the notice with HTTP 200 and no Sample data.
Native visual automation remains unavailable from the preceding attempt; owner
accepted the sample before removal. Owner check: open tray home; sample is absent,
real valid reset outlooks still appear.


# Remove Clock format and fix exact times to 24-hour

2026-11-28 · Implemented; native visual acceptance remains Review

Acceptance: General has no Clock format or AM/PM/24-hour selector. Exact
timestamps use 24-hour time, including old saved 12-hour preferences.
Removed the settings section and normalized loaded/saved timeFormat to 24h.
Updated existing settings and migration tests; DESIGN.md records the decision.
Applied emil-design-eng; shared section spacing retained, no new motion.

Verification: TypeScript and git diff --check passed. Initial Vitest run
passed all 547 tests / 48 files but exited with a React scheduler callback
after jsdom teardown in CliProviders.test.tsx; full rerun recorded below.
Native restart succeeded, dev build finished in 4.74s, fresh PID 21460.
Vite on port 5174 serves SettingsModal without Clock format/time-format-label
and displayPrefs with the 24h default and fixed load/save values. Native
WebKit Networking PID 21633 established connections before touching settings;
HMR update logged at 16:26:31 Tehran. Latest native dev app left running.
No Rust, dependency, account-data or version changes in this task.

Native visual limitation: exact debug executable lookup returned Invalid app;
browser inventory returned native pipe closed before response. Both-theme,
keyboard, pointer and reduced-motion visual inspection remain unverified.
Owner check: dev tray → Settings → General has no Clock format selector;
exact timestamps in account tooltips and reset notices use 24-hour time.

Full rerun passed all 547 tests in 48 files, exit 0, with no unhandled errors.

# Correct shortcut popup opening and disabled state

2026-11-28 · Implemented; native visual acceptance remains Review

Owner requested matching popup motion, disabling Key combination while Enable
shortcut is off, and showing the saved shortcut when the popup opens. Trigger is
now disabled with the master switch off. Opening initializes the draft from the
saved accelerator, visible even while the capture bridge prepares. Save remains
disabled until a different valid combination is captured. Cancel preserves the
saved key. Applied emil-design-eng and animate with shared controls and motion.

Shared AppModal snapshots opening input modality and passes it to the existing
Dialog content/overlay. Pointer entrance continues if recording starts during
its animation; keyboard-opened dialogs and keyboard exits retain immediate
behavior, and reduced motion retains the existing global suppression. No new
animation/keyframes, dependencies, native commands, provider or credential changes.

| Before | After | Why |
| --- | --- | --- |
| Trigger enabled with shortcut off | Trigger disabled with shortcut off | Owner requirement |
| Recorder starts with placeholder | Saved combination appears immediately | Owner requirement |
| Global keyboard modality can interrupt pointer entrance | Opening modality persists through the entrance | Keep shared popup animation while recording |

Verification: TypeScript passed; 547 Vitest tests / 48 files passed. Focused popup
and AppModal tests passed (17 tests). Locked offline cargo check and cargo test
passed: 317 library, 8 integration, 1 subprocess; 10 opt-in ignored. Diff whitespace
check passed. Native UI automation still rejects the exact debug executable as
Invalid app; both-theme tray appearance/motion and pointer review remain unverified.
Owner check: Settings → General; with shortcut off the combination is disabled.
Enable it, open the combination popup, confirm saved key is visible and opening
animates with pointer input. Record a new key and Cancel/Save to check behavior.

Latest dev restart: native build passed in 0.52s, fresh debug PID 23302. Vite
returned HTTP 200 with disabled trigger / saved draft changes and served all shared
motion metadata changes. Native WebKit PID 23359 connected before HMR touch;
updated source is served on port 5174. Latest native dev app left running.


# Refine the crowded Display tab

2026-11-28 · Implemented; native visual acceptance remains Review

Owner feedback: Display still feels unfinished and crowded. Acceptance: preserve
existing Menu bar / Floating behavior and saved selections, reduce the default
visible limit controls, keep selected limits legible while collapsed and align
preview hierarchy across both locations at tray width.

Reused the existing language and mandatory emil-design-eng / animate skills.
Added the shared compact SettingsDisclosure variant and UsageLimitDisclosure:
provider switches/account identities remain visible, with an initially closed
Limits row showing the chosen window or count. Loading and unavailable summaries
remain legible. Controls stay mounted; opening/reopening does not write preferences
or repeat provider reads. Existing Appearance, colors, account eligibility and
limit-selection rules remain intact. Both previews use one quiet inset stage;
Menu bar uses smaller sample typography without the extra pill frame. Floating
moves its existing preview above providers and removes its duplicate heading.
No new motion, dependencies, native code or account-data behavior.

Verification: TypeScript passed; all 548 Vitest tests / 48 files passed, exit 0.
Existing provider/save/loading tests pass. Added regression verifies collapsed
saved summary, retained checkbox identity/selection/open state through a busy
rerender, no unintended writes and exactly one provider read. Floating's existing
single-limit test now exercises expansion and summary updates while retaining
open state. Production build passed. Comparable Vite builds used current source
and a temporary copy with only this task's changes reversed, retaining earlier
uncommitted workspace work: JavaScript +591 bytes raw / +177 gzip; CSS +263 raw /
+38 gzip (combined gzip +215 bytes). No added dependency or duplicate asset.
Temporary comparison copy removed after measurement.

Native inspection limitation: Sky timed out by display name, bundle identifier
was ambiguous across installed bundles and exact debug executable was rejected
as Invalid app. CUA browser inventory reported native pipe closed before response.
No native screenshot, live browser snapshot, or both-theme/pointer/keyboard/
reduced-motion visual acceptance is claimed. Existing native details/summary
semantics and shared focus/motion rules are reused. Owner check: dev tray →
Settings → Display; in both locations inspect the preview and provider rows,
expand Limits, change a choice, collapse/reopen and switch locations. Confirm
selections stay intact; repeat in both themes and with keyboard/reduced motion.

Final dev verification: pnpm run dev:restart completed successfully. Native build
finished in 0.50s; fresh debug PID 33338 remains running. Vite returned HTTP 200
on port 5174 and served UsageLimitDisclosure, compact SettingsDisclosure, shared
preview styling and the updated Floating source. Established native WebKit
Networking PID 33420 connections were present before touching
UsageDisplayControls.tsx. At 16:37:15 Tehran, Vite logged its HMR update and
propagated updates to FloatingUsageSettings / WorkspaceMenuBar (the shared
PROVIDER_MARKS export causes expected Fast Refresh invalidation). git diff
--check passed. Latest ordinary native dev app left running. No release or
version change. Visual acceptance remains Review as stated above.


# Bring tab bars closer to their content

2026-11-28 · Review

Acceptance: reduce the space below every tab bar consistently, including the
Settings section tabs and Display's Menu bar / Floating selector. Both now use
shared --tab-content-gap: 0.375rem (6px), previously 10px and 16px respectively.
Reuse current home materials and all control geometry and states. Applied
emil-design-eng and animate's frequency gate; static spacing adds no motion.
The existing unrelated working tree is preserved.

Verification: pnpm exec tsc --noEmit passed. pnpm exec vitest run passed all
548 tests in 48 files (19.50s); log /tmp/orbilap-tab-spacing-vitest.log. The first
concurrent test run was interrupted by dev restart; the complete rerun passed.
pnpm run dev:restart passed, native dev build finished in 0.50s and fresh
PID 33338 runs target/debug/orbilap. Vite serves the shared token and both uses
on port 5174. Native WebKit Networking PID 33420 had established connections
before touching surfaces.css; fresh HMR logged at 16:37:02. No Rust, dependency,
account-data or release changes in this task.

Gaps: browser inspection returned native pipe closed. Sky rejected the unbundled
dev executable and the bundle identifier is ambiguous among packaged builds.
Actual tray visual, both-theme, pointer, keyboard-focus and reduced-motion checks
remain Review; no screenshot or live DOM measurement is claimed. Owner check:
open DEV tray > Settings, switch all section tabs, then Display > Menu bar and
Floating. Check the tighter consistent gap in both themes. Latest native dev
app remains running.


# Remove nested Display navigation

2026-11-28 · Implemented; native visual acceptance remains Review

Owner rejected a second tab bar inside Display. Acceptance: keep the outer
Settings tabs, show Menu bar and Floating as titled sections on one scrollable
Display page, retain independent selections and the compact Limits disclosures,
and remove location navigation and its state.

Removed the inner ToggleGroup, displayLocation state and hidden panels. Both
surfaces now render in accessible named sections with home-system typography,
shared divider tone and section spacing. Removed obsolete location-selector CSS.
Kept provider/account eligibility, preview components, save paths and controls.
Applied emil-design-eng and animate: this static layout requires no added motion;
existing keyboard, focus, pointer and reduced-motion behavior remains.
DESIGN.md records the owner's decision and replaces superseded selector guidance.

| Before | After | Why |
| --- | --- | --- |
| Display contains a second segmented navigation bar | Menu bar and Floating are titled sections on one page | Owner rejected nested navigation |
| Only one location is visible | Both locations are directly available | Remove the extra navigation step |

Verification: TypeScript passed; all 548 Vitest tests / 48 files passed, exit 0.
Updated the real App settings test to require Floating immediately inside Display.
Workspace regression verifies both named sections are visible, no location
selector remains, opening Appearance retains the other section's draft, and
render/navigation causes no preference write. Production build and diff whitespace
check passed. Comparable Vite builds immediately before/after this task: combined
JS/CSS 864205 → 864246 raw bytes (+41), 246764 → 246731 gzip bytes (-33).
Removed the temporary baseline output. No dependency, Rust, security/account-data,
release or version change.

Native visual limitation remains from this session: exact debug binary is rejected
by UI automation and browser inventory reports native pipe closed. Both-theme tray
appearance, native keyboard/pointer/reduced-motion inspection and live browser
snapshot are not claimed. Owner check: dev tray → Settings → Display; there should
be no Menu bar / Floating navigation row. Scroll from Menu bar to Floating; expand
Limits and Appearance to edit the existing settings in either theme.

Final dev verification: pnpm run dev:restart succeeded; native dev build finished
in 0.53s and fresh target/debug/orbilap PID 38196 remains running. Vite returned
HTTP 200 on port 5174. Served WorkspaceSettings source contains both section
headings and no Display location / displayLocation / ToggleGroupItem. Native
WebKit Networking PID 38281 had established connections before touching the
changed TSX; Vite logged the subsequent HMR update. Native dev left running.
Live browser/native visual inspection remains unavailable as described above.


# Compact the Menu bar preview

2026-11-28 · Implemented; native visual acceptance remains Review

Owner supplied a screenshot of the Menu bar sample and requested a more compact
section. Reduced its minimum height from 6rem (96px) to 3.5rem (56px), with .75rem
vertical padding. Keep readout size, horizontal spacing, material and shape.
Floating retains its existing preview sizing. Applied emil-design-eng and animate:
static spacing only; no new motion or control behavior. DESIGN.md records the
selection. No Rust, dependency, credential, version or release changes.

Verification: TypeScript and production build passed. Comparable before/after
Vite production bundles changed combined JS/CSS gzip by +39 bytes; temporary
baseline removed. Existing automated suite and native restart results follow.
No new tests for a reversible spacing adjustment. Native/browser visual automation
remains unavailable as recorded earlier in this session; both-theme native visual
acceptance is not claimed. Owner check: dev tray → Settings → Display; the Menu
bar sample should occupy less vertical space with its content still centered.

Full Vitest suite passed: 548 tests / 48 files, exit 0. Native restart succeeded;
Rust dev build finished in 0.53s and fresh debug PID 42476 remains running. Vite
returned HTTP 200 on 5174 and served min-height: 3.5rem. Whitespace check passed.
Native WebKit PID 42568 was connected before touching surfaces.css; fresh HMR
update logged. Latest native dev app left running; visual limitation above remains.


# Reveal provider limits automatically

2026-11-28 · Implemented; native visual/motion acceptance remains Review

Owner requested showing limit choices automatically when a provider switch is
enabled, with an animation and without a separate Limits action, in both Menu
bar and Floating. Removed UsageLimitDisclosure and its compact SettingsDisclosure
variant/styles. Enabled providers now mount UsageLimitsReveal around their
existing limit content. Appearance remains an independent disclosure.

Applied emil-design-eng and animate (state indication / preventing a jarring
change): reuse home's 200ms grid-track + opacity transition with --ease-out.
CSS @starting-style animates pointer entry; keyboard modality is captured at
mount so async quota arrivals do not restart motion. Keyboard and reduced motion
have no transition. No hover animation, dependency or extra provider read added.
Provider eligibility, saved windows, one-limit Floating behavior, busy locks,
loading/errors and save paths remain. Switching a provider off removes its
choices and retains the saved selection. DESIGN.md records the new behavior.

TypeScript and production build passed. Before/after comparable production Vite
builds changed combined JS/CSS gzip by -42 bytes; temporary baseline removed.
Updated menu-bar regression enables the provider, checks limits are visible
without another action, checks saved choice and busy state, disables it and
verifies saved choices persist and only one quota read occurred. Floating's
single-choice regression now requires immediately visible choices with no
Limits trigger. Full suite and native restart results follow below.

Native/browser visual automation remains unavailable as recorded earlier; no
both-theme native animation/focus/reduced-motion visual acceptance is claimed.
Owner check: dev tray → Settings → Display; toggle a provider on in Menu bar and
Floating. Its limits should appear below without a Limits button, with a brief
pointer reveal; keyboard and reduced motion should be immediate. Change a limit,
turn provider off/on and verify its saved selection survives.

Full suite passed: 548 tests / 48 files, exit 0. pnpm run dev:restart succeeded;
native build finished in 0.53s, fresh debug PID 45215 remains running. Vite
returned HTTP 200 on 5174 and served UsageLimitsReveal / reveal CSS. Native
WebKit PID 45286 was connected before touching UsageDisplayControls.tsx for HMR.
No release or version changes. Native visual limitation above remains.


# Attach Providers & limits heading to its own list

2026-11-28 · Implemented; native visual acceptance remains Review

Owner reports the heading sits closer to the previous section than its own list.
Group heading/list in shared display-provider-section in Menu bar and Floating:
.25rem internal gap, 1.5rem top separation, heading margin reset. Remove the old
menu-only heading margin. Preserve all controls, provider behavior and existing
reveal motion. Applied emil-design-eng / animate; static grouping adds no motion.
DESIGN.md records the decision. No dependencies, Rust or version changes.

TypeScript and production build passed. Comparable before/after production
builds changed JS/CSS gzip by -54 bytes; temporary baseline removed. Full
suite/native restart checks follow. No new test for a reversible spacing change.
Native/browser visual automation remains unavailable as previously recorded;
no both-theme tray visual check is claimed. Owner check: dev tray → Settings →
Display; Providers & limits should sit close to its provider list with a larger
gap to Appearance/the preview above, in Menu bar and Floating.

Full suite passed: 548 tests / 48 files. Native restart succeeded; Rust dev build
finished in 0.52s, fresh debug PID 47248 remains running. Vite HTTP 200 serves the
shared grouping in both TSX components. Native WebKit PID 47332 was connected
before touching WorkspaceMenuBar.tsx for HMR. Latest dev app remains running.


# Use radio controls for Floating limits

2026-11-28 · Implemented; native visual acceptance remains Review

Owner requested radios because Floating supports one limit per provider.
UsageLimitChoices now supports a single variant using the existing shared Radix
RadioGroup/RadioGroupItem, one group per provider across all model rows. Floating
opts in; Menu bar retains multiple-choice checkboxes. Reuse labels, grouping,
saved keys, cached options, disabled/busy behavior and automatic reveal. Selection
cannot be cleared by clicking the current radio. No new dependency, backend read,
Rust, account-data or version change. Applied emil-design-eng and animate: existing
control and reveal behavior reused. DESIGN.md replaces superseded checkbox guidance.

TypeScript and production build passed. Comparable production Vite JS/CSS gzip
delta: 76 bytes. Temporary baseline removed. Floating regression now verifies
an accessible radio group, no checkboxes, checked state, selecting by arrow key,
retaining the current selection on repeat click, disabled controls and stale
account filtering. Full tests/native restart results follow.

Native/browser visual automation remains unavailable in this session; no native
both-theme/focus/pointer/reduced-motion visual acceptance is claimed. Owner check:
dev tray → Settings → Display → Floating; each provider offers radio limit choices.
Choose one by click or arrow keys and verify only that provider’s selected limit
changes. Menu bar still allows multiple checked limits.

Full rerun passed all 548 tests / 48 files, exit 0, and TypeScript passed. Initial
arrow-navigation assertion ran after synthetic keyup but before Radix’s deferred
focus; the regression now holds ArrowUp through the focus/selection and releases
it afterward. Focused 16-test Floating suite and the full rerun passed. Whitespace
check passed. No production code changed after the successful production build.

Native restart succeeded: build finished in 0.52s, fresh debug PID 50453 remains
running. Vite HTTP 200 serves shared RadioGroupItem controls and Floating single
variant. Native WebKit PID 50536 was connected before the final HMR touch.
Latest native dev app left running. Visual limitation above remains.


# Clarify the radio ring and center dot

2026-11-28 · Implemented; native visual acceptance remains Review

Owner screenshot shows the selected Floating radio as an almost solid light
circle. Shared standalone radios now retain the inset surface inside their
accent outline, with an accent center dot. Keep 16px outer geometry, 1px border,
6px center dot and visible 4px intervening gap; dot size uses .375rem. Both themes
use existing accent/surface tokens. Checkbox and RadioOption treatments retain
their existing rules. No new controls, dependencies, motion, Rust or version
change. Applied emil-design-eng / animate; DESIGN.md records the shared pattern.

TypeScript and production build passed. Comparable before/after production
JS/CSS gzip delta: 46 bytes; temporary baseline removed. No new test for a
reversible contrast-only CSS adjustment. Full tests/native restart results follow.
Native/browser visual automation remains unavailable in this session; both-theme
native visual acceptance is not claimed. Owner check: dev tray → Settings →
Display → Floating; selected radios should have a clear outlined ring, dark/light
surface gap and distinct center dot in both themes, preserving focus/disabled
states and keyboard selection.

Continuation verification: TypeScript passed; full Vitest rerun passed 548 tests
in 48 files, exit 0. Earlier runner session was unavailable after continuation,
so this result comes from a new complete run. pnpm run dev:restart succeeded;
native build finished in 0.59s, fresh debug PID 54799 remains running. Vite
returned HTTP 200 on 5174 and serves the corrected radio surface fill. Existing
production build and +46-byte gzip comparison above remain applicable; no source
changes since that build. Whitespace check passed. Native visual limitation remains.
Native WebKit PID 54896 was connected before touching index.css; fresh HMR
update confirmed. Latest native dev app remains running.


# Remove static limit-selection helper text

2026-11-28 · Implemented; native visual acceptance remains Review

Owner requested removal of Choose one limit and Select a limit. Removed the
Floating one-limit instruction and Menu bar empty-selection instruction. Preserve
loading/no-reported-limits status, accessible labels, radios/checkboxes, saved
choices and automatic reveal. Applied emil-design-eng / animate: copy deletion
only, no new motion or dependencies. DESIGN.md records the decision. No Rust,
account-data, security, version or release change. No new tests for copy removal.
Full suite and native restart evidence follow. Native/browser visual automation
remains unavailable in this session. Owner check: dev tray → Settings → Display;
Floating and Menu bar show limit controls without either helper line.

Verification: TypeScript passed, all 548 Vitest tests / 48 files passed, production
build passed and git diff --check passed. dev:restart succeeded; native build
finished in 0.17s, fresh debug PID 56249 remains running. Vite HTTP 200 serves
both changed modules with neither removed helper line. Native WebKit PID 56317
was connected before the final HMR touch. Native visual limitation above remains.


# Treat duplicate login-file imports as already added

2026-11-28 · Implemented; native visual acceptance remains Review

Acceptance: importing an account already saved in Orbilap shows Added and an
inline existing-account explanation, with the shared success tick, no danger
state or error toast. Repeated identities in the batch are informational too.
Existing accounts stay outside commit selection and repeat verification; mixed
batches continue with new verified accounts only. Browser renewal into an
already-added account uses the same inline treatment. A duplicate-only batch
keeps verification disabled instead of offering Continue with 0 accounts.

Applied emil-design-eng / animate: reuse approved row styling, controls and
static feedback, with no new motion, CSS, dependencies or backend changes.
Regression coverage uses synthetic credentials for saved-only and mixed
saved/new/repeated imports and verifies no duplicate commit or error toast.
Reviewed docs/SECURITY.md import, credential exposure and IPC attack surfaces;
no new credential reads, persistence, probes or capabilities. Native provider
renewal and both-theme visual/focus checks remain unverified: Computer Use
returned ambiguous/invalid app identification and a timeout for the dev binary.
No account credential files were read for testing.

Typecheck and production build passed. test:security passed; security:check
passed for both macOS architectures, retaining reported other-target findings
(zip, chrono, proc-macro-error, zbus/zvariant, glib, yanked async-executor).
Locked offline Rust suite passed: 317 unit tests, 8 integration tests; 10 unit
tests ignored, plus the isolated preference helper check passed.
Latest dev restart succeeded: native build 0.56s, PID 65310; Vite HTTP 200.
WebKit PID 65395 connected on 5174 before the HMR touch.
Full Vitest result and final HMR evidence follow. An earlier rerun was stopped by
the mandated dev process cleanup; the final suite runs after restart.

Owner check: dev tray → Add account → ChatGPT / Codex → Import auth.json; choose
a saved account file and verify. Expect Added and the explanation without an
error toast. For a mixed batch, Continue includes only new accounts.

Final verification: all 549 Vitest tests in 48 files passed, exit 0. Final
TypeScript and git diff --check passed. Vite served the updated import module;
17:03:41 HMR update for App.tsx/index.css followed the established native WebKit
connection. Latest dev app remains running. Native/browser visual inspection
could not be completed with the available app-targeting API; no visual approval
is claimed. Security script logs remain private under /tmp/orbilap-duplicate-*.


# Remove redundant Added text from duplicate import rows

2026-11-28 · Owner screenshot refinement

Removed the separate Added line; retain the shared success tick and the inline
existing-account explanation. Duplicate classification, selection and commit
behavior remain unchanged. Updated the two duplicate-import regressions to
assert Added is absent. Applied existing emil-design-eng / animate guidance:
copy-only removal, no new motion or styles. TypeScript and diff checks passed.
Vite served the updated module; native WebKit PID 65395 was connected when the
17:04:56 HMR update delivered BatchAuthImport.tsx. Owner can reimport a saved
auth.json: only its filename and existing-account explanation should remain
beside the tick, with no standalone Added label or error toast. Full suite and
restart results follow.


# Floating orb edge rendering

2026-11-28 · Implemented; native visual acceptance remains Review

Owner reported extra outlines and an uneven circle in the floating orb screenshot.
Removed the inset body rim and inherited 1px transparent Button border; the
60×60 SVG no longer scales into a 58×58 content box. Inset the gray rail to 4pt
beneath the 5pt progress, avoiding a second antialiased contour beneath the fill.
Shared FloatingUsagePreview serves both settings and native floating window.
Applied emil-design-eng / animate; static correction, no new motion or tests
for this paint-only change. No Rust, account data, capability or release changes.
Native UI inspection attempted through Computer Use: display-name timeout,
bundle ID ambiguous between installed/release apps, debug executable rejected
as Invalid app. Both-theme visual and pointer/focus acceptance remains Review.
Owner check: inspect the floating orb and Settings → Display preview; expect
a clean circular black body and no secondary edge around white/colored progress.
Verification follows.


# Smooth Display disclosures and radio selection

2026-11-28 · Implemented; native visual/motion acceptance remains Review

Owner reports abrupt accordion and radio checked-state transitions. Provider
wrappers now persist across switch changes. Shared SettingsReveal keeps outgoing
content painted for 200ms while immediately inert/aria-hidden, removes it after
collapse, and cancels pending cleanup when reopened. Appearance uses shared Button
with expanded/controls semantics and the same reveal, replacing native details.
Default RadioGroupItem dot is force-mounted, with checked/unchecked opacity and
.7/1 scale transitions (160ms); border color transitions in place. Control sizes,
contrast, saved choices and provider/cache/save behavior remain. No new dependency,
Rust, credential or version change. Applied emil-design-eng and animate: CSS
transitions, --ease-out, 200ms collapse, 160ms radio feedback; keyboard and reduced
motion remain immediate. DESIGN.md records the shared motion change.

TypeScript and production build passed. Before/after comparable production JS/CSS
gzip delta: 357 bytes; temporary baseline removed. Added two regressions for
outgoing content/inert state, rapid reopening preserving draft/node identity,
eventual cleanup, immediate keyboard removal and persistent radio-dot identity.
Updated existing settings tests to open Appearance before accessing its controls.
Initial full run terminated with exit 143 without results; full rerun follows.

Native/browser visual automation remains unavailable in this session. Actual
both-theme motion/focus/pointer and reduced-motion appearance are unverified.
Owner check: dev tray → Settings → Display; expand/collapse Appearance and toggle
provider limits in both locations, including a quick reversal. Radio dots should
fade in/out; keyboard and reduced motion should stay immediate.

Verification: TypeScript passed; all 551 tests / 49 files passed (the existing
workspace includes concurrent uncommitted work). git diff --check passed. Final
dev:restart succeeded, native dev build 0.17s, fresh PID 70017 left running.
Vite serves the updated rail selector on 5174; established native WebKit PID
70077 connected before the final CSS touch and HMR update. Browser inventory
returned no apps/browsers with native-pipe error; live DOM and both-theme native
visual review could not be completed. No visual approval claimed.

Final copy refinement verification: all 551 tests / 49 files passed with exit 0
using two workers (runner launched from /tmp with the project root specified to
avoid concurrent dev-cleanup termination). Initial run passed every test but
reported a React scheduler window-after-jsdom-teardown error; subsequent normal
runs were externally terminated. No production code changes were needed for
that runner issue. dev:restart completed; native build 0.18s and fresh dev PID
70909 remained running. Vite returned HTTP 200; WebKit PID 70956 was connected
before the 17:06:32 App.tsx/index.css HMR update. Native visual inspection was
not repeated; the owner screenshot supplied the refinement.

Final full suite passed: 551 tests / 49 files, exit 0. Two in-project runs were
terminated with exit 143 during concurrent dev restarts; completed rerun used the
same installed Vitest with --root pointing to this repository, launched from /tmp
to preserve it during project process cleanup. Final TypeScript and whitespace
checks passed. Test total includes concurrent workspace tests; no other work
was reverted. Native restart evidence follows.

Final native restart succeeded: build finished in 0.16s; fresh debug PID 72314
remains running. Vite HTTP 200 serves SettingsReveal and persistent radio dots.
Native WebKit PID 72374 was connected before touching settings-reveal.tsx for
HMR. Latest native dev app remains running. Native visual limitation above remains.
# Remove Appearance hover background

2026-11-28 · Implemented; native visual acceptance remains Review.

Owner screenshot identifies the Appearance disclosure hover fill. Shared
SettingsDisclosure hover is now transparent while not pressed, retaining its
inset container, pressed feedback, keyboard focus and reveal behavior in both
themes. Applied emil-design-eng and animate; no new motion or dependency.
TypeScript passed; full Vitest suite passed (551 tests / 49 files, exit 0).
The initial test process was stopped by dev restart; the completed rerun used
the installed Vitest from /tmp with this repository as --root.
Final dev restart built successfully in 0.17s; fresh native PID 78961 remains
running. Vite 5174 serves the exact new hover selector, with native WebKit PID
79036 connected before the CSS HMR touch. UI inspection timed out; browser
inventory returned no browsers and a native-pipe error. Both-theme visual check
remains unverified. Owner check: hover Appearance in Settings → Display; expect
no additional fill while keeping focus and expansion intact.



# Consistent radio marks across cards and inline choices

2026-11-28 · Implemented; native visual acceptance Review

Owner supplied two screenshots showing different selected radio shapes. All
visible radio marks now share ui-radio-mark and RadioIndicator: 16px outline,
1px border, 6px accent dot, inset surface gap, and persistent 160ms reversible
selection feedback. RadioOption retains its whole-row target and selected
background. Keyboard/reduced-motion behavior, disabled and focus semantics stay
shared. Applied emil-design-eng and animate; documented in DESIGN.md. No added
dependency, security boundary, Rust or version change.

TypeScript and git diff --check passed. Full Vitest rerun: 551 tests / 49 files,
exit 0. Initial run was interrupted by project runtime cleanup; completed rerun
launched the same installed Vitest from /tmp with the project root and two workers.
First dev restart encountered remaining project processes; second succeeded.
Concurrent workspace activity restarted dev again; final native build succeeded
in 0.18s and fresh debug PID 78961 was observed. Vite served the shared radio
module (two ui-radio-mark occurrences). Native WebKit PID 79036 had established
connections before the final radio module touch/HMR verification.

Browser/native visual inspection unavailable: inventory returned no apps or
browsers, with native pipe closed. Both-theme tray-width appearance, pointer and
keyboard focus visual review remains unverified. Owner check: Settings → Display
→ Appearance and Floating limit choices should show identical outlined circles
and center dots in both themes. Latest native dev app left running.


# Prevent native dev QA from opening production

2026-11-28 · Diagnosed; QA targeting guard added

Owner reported installed production returning after Quit while testing dev.
Installed PID 74546 started at 17:08:46 Tehran. Completed Codex tool records show
native QA calling sky.get_app_state({app: 'Orbilap'}) at 17:08:51.742 and again
17:11:16.765 (completion timestamps). Name-based native lookup can launch the
installed app. The installed app had no matching LaunchAgent in inspected user
or system LaunchAgents/Daemons; the dev supervisor targets tauri dev and uses
KeepAlive false. No application-code relaunch cause was found in these checks.

AGENTS.md now forbids name/shared-ID/production-path targeting during dev QA.
Require attachment to the identified existing debug process without launching;
otherwise report native UI checks unavailable. No runtime, credentials, user
preferences, release or version changed. Close only the identified installed
production process and preserve dev. Acceptance: future QA must not launch the
installed app; cross-chat adoption and owner observation remain Review.
# Remove Appearance pressed background

2026-11-28 · Implemented; native visual acceptance remains Review.

Owner additionally requested no background while clicking Appearance. Shared
SettingsDisclosure now keeps hover and active backgrounds transparent, retaining
the inset container, keyboard focus and reveal behavior. DESIGN.md updated;
applied emil-design-eng and animate with no new motion. TypeScript passed; full
Vitest suite passed (551 tests / 49 files, exit 0). Vite served the exact updated
selector. Native UI inspection timed out again, so both-theme visual acceptance
remains unverified. Owner check: press Appearance in Settings → Display; expect
no added fill while the section expands and collapses normally.

Final restart verified: native build 0.17s, fresh app PID 82224 running; Vite
5174 serves the selector and native WebKit PID 82279 connected before CSS touch.


Verification: TypeScript passed; full Vitest passed 551 tests / 49 files, exit 0.
Dev restart succeeded, native build finished in 0.17s, fresh debug PID 82224.
Vite returned HTTP 200 on 5174. Installed PID 74546 was terminated; process
inspection after restart found only the debug app. No src/ or Rust changes,
so frontend HMR and Rust checks are not applicable. Native UI automation was
intentionally not invoked because generic lookup caused this incident.
# Restore Appearance disclosure height

2026-11-28 · Implemented; native visual acceptance remains Review.

Owner reports the closed Appearance row is too short. Its declared 3rem
min-height lost to the later .ak-dialog .ui-button rule (36px). Set the existing
--button-min-height token to 3rem on the shared SettingsDisclosure trigger so
both rules resolve to 48px, matching settings rows. Header height is consistent
when open/closed; hover and pressed backgrounds remain transparent. Applied
emil-design-eng / animate; static correction, no new motion or dependency.
TypeScript passed; all 551 tests / 49 files passed, exit 0. Whitespace check
passed and Vite served the exact token change. Native UI inspection timed out;
both-theme visual/focus/pointer review remains unverified. Owner check: inspect
closed and open Appearance in Settings → Display; header should be 48px tall.

Final restart: native dev build passed in 0.17s, fresh PID 84918 left running.
Vite 5174 serves the updated token; native WebKit PID 84991 connected before
touching surfaces.css for HMR verification.
