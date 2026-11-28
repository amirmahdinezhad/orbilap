# OrbitHUD comparison

Reviewed 28 November 2026 against Orbilap's current working tree, including the
owner's existing uncommitted changes. Orbilap HEAD is
`7108a7f2dcce3627a2ea6df4d95e00b0a4949c88`; this is not a comparison against only
the public 1.0.4 release.

OrbitHUD source: [`22509ae52a461caf5b1bd2d3618a76ddceee2b13`](https://github.com/mojtaba-afraz/OrbitHUD/tree/22509ae52a461caf5b1bd2d3618a76ddceee2b13),
committed 26 November 2026. Latest public release observed: v1.2.7, published
26 November 2026. Source implementation, public artifacts and roadmap promises
are distinguished below. No feature adoption or scope change is approved by
this review.

## Implemented differences

| Capability | OrbitHUD evidence | Current Orbilap and implication |
| --- | --- | --- |
| Persistent floating quota HUD | `Sources/App/WidgetWindowManager.swift:136-167` configures a draggable `.floating` panel across Spaces and fullscreen applications. | `src-tauri/src/lib.rs` opens the main panel under the tray and hides it on focus loss, with import exceptions. `alwaysOnTop` already exists in our window config, but there is no user-facing persistent floating mode. A separate persistent mode would be a real addition. |
| Desktop-pinned view | The same manager configures a panel below normal windows, supports position locking and separate saved frames; macOS can display desktop and floating panels together. | No desktop-pinned quota surface or position-lock control. This is a custom application window, not a shipped WidgetKit extension. |
| Compact coding pill and opacity | `Sources/App/UsageWidgetView.swift`, `MenuBarControlView.swift` and the window manager implement compact rings, an opacity slider and window resizing. The cross-platform renderer also has a 52px compact layout. | No floating compact pill or opacity control. Our customizable native tray percentages/bars already serve some of the glanceable-monitoring need. |
| Opt-in low-quota/reset alerts | `Sources/Core/QuotaAlertEvaluator.swift` and `Sources/App/QuotaNotificationManager.swift`: remaining thresholds 20/15/10/5%, first-observation suppression, per-running-process cycle deduplication, reset-to-100% notification. Equivalent JavaScript evaluator exists. | Usage alerts and their persisted history were deliberately removed; see `docs/USAGE_PREFERENCES.md:52` and `src-tauri/src/settings.rs` migration tests. Existing switch-status notifications and Codex reset notices are different features. Reintroduction would revisit an existing product decision, not fix a missing implementation. |
| Event-driven external-login refresh | `Sources/Core/UsageViewModel.swift:418-480` watches existing Antigravity daemon / Claude / Codex directories, debounces events by 300ms and force-refreshes. Disconnected/auth-required states use a 3-second recovery cadence. JavaScript has equivalent directory watchers. | Current frontend uses configured periodic refresh and focus handling; the native monitor also receives app-owned settings changes. No equivalent filesystem watcher for out-of-app auth changes was found. This could reduce delay after external account changes. Watchers only cover directories present when initialized; they do not prove every credential change is instantaneous. |
| Read-only Antigravity monitoring without separate enrollment | `Sources/Core/LanguageServerQuotaFetcher.swift` discovers the running local language server and requests quota over loopback. Claude/Codex are opt-in and use their current CLI credentials. | Antigravity uses separately enrolled, identity-verified saved Google accounts and direct Google quota endpoints. A monitor-only current-IDE mode could reduce setup, but would depend on the IDE/runtime running and would not replace our saved-account management. No additional provider is gained. |
| Local Antigravity token counter | `Sources/Core/TranscriptUsageAggregator.swift` reads Antigravity transcript token fields and builds today/seven-day/per-model aggregates. `MenuBarControlView.swift:190` actually renders today's total. | No equivalent token-usage dashboard/counter found. Our local Claude transcript fallback extracts quota snapshots, not a daily token total. OrbitHUD's displayed total is local Antigravity transcript usage, not a cross-provider total or billing measurement. Seven-day aggregation exists internally; a seven-day analytics drawer does not ship. |
| Quick provider filtering / hide quota groups | `MenuBarControlView.swift` and `UsageViewModel.swift` provide All/provider tabs, group visibility and Show All. | No equivalent temporary provider tabs or persistent per-model hide controls for the home quota content. Orbilap already has workspace membership and independent menu-bar provider/limit selection; those are not missing. |
| Windows and Linux distribution | `cross-platform/src`, `cross-platform/package.json`, `.github/workflows/release.yml`; public v1.2.7 contains Windows Setup EXE, Linux AppImage and DEB in addition to macOS DMG/ZIP. | Current supported product and release workflow target macOS. Windows/Linux are real distribution gaps, but adopting them is a separate product/platform commitment. Native execution on those systems was not tested. |
| Maintainer release-download report | `scripts/release_stats.mjs` aggregates GitHub asset download counts by release/platform; `.github/workflows/release-stats.yml` defines a weekly/manual report. | No corresponding release-download reporting tool found. Useful maintenance tooling, not an in-app usage feature. Counts are asset requests, not unique or active users. |
| SwiftUI macOS presentation | `Package.swift` and `Sources/App` use SwiftUI/AppKit; Windows/Linux use Electron. | Orbilap uses Tauri/Rust/React. This is an implementation difference, not proof of lower memory, faster interaction or better accessibility. No comparable runtime resource measurements were taken. |

## Claims that should not be counted as shipped advantages

- `ROADMAP.md` leaves global hotkeys, burn rate/time-to-depletion, the seven-day
  analytics drawer, Cursor/Copilot/OpenRouter/Gemini API providers, configurable
  menu-bar primary model, the refresh-interval UI, additional themes/automatic
  theme adaptation, WidgetKit and Windows/Linux ARM64 releases unchecked.
- `WidgetExtension/AntigravityWidgetBundle.swift` is starter code. It is not a
  target in `Package.swift` and `scripts/build_app.sh` only compiles
  `Sources/Core/*.swift` and `Sources/App/*.swift`; it does not package an
  extension. The shipped desktop-pinned window must not be called WidgetKit.
- Homebrew/WinGet/AUR manifests, installer scripts and a publication workflow
  exist. Public availability was not confirmed: the documented Homebrew tap
  repository and WinGet package path returned HTTP 404, AUR's RPC returned zero
  results for `orbithud-bin`, and the package-publication workflow had no runs.
  The checked-in WinGet manifest still contains a checksum placeholder. These
  are distribution preparations, not verified package-manager installation.
- The README links a Windows Portable EXE, but no Portable EXE was listed in
  the latest release's assets. Windows Setup, Linux AppImage/DEB and macOS
  DMG/ZIP were listed.
- SHA-256 updater verification exists, but is not a security upgrade over
  Orbilap's signed updater archive verification. A checksum from the same
  release does not replace an independently held signing key.
- “Tiny RAM/CPU” is a README assertion. The macOS DMG is about 4.2 MB, but
  package size alone cannot establish runtime resource use or comparative
  performance. Windows/Linux packages include Electron and are much larger.
- Multi-monitor recovery is explicitly implemented in the Electron path.
  The reviewed Swift window manager saves frames but does not expose equivalent
  explicit display-removal recovery logic. Do not generalize platform parity.

## Existing Orbilap strengths relevant to this comparison

Current code already includes saved multi-account management, workspaces,
account switching and automatic rotation for Codex/Antigravity, running-Codex
work confirmation, account-scoped menu-bar provider/limit selection and several
tray styles. OrbitHUD reads the current provider sessions and does not provide
an equivalent saved-account/workspace switcher in the reviewed code.

Orbilap also has banked Codex reset balances/review-and-consume actions and
public reset outlook notices. These are separate from OrbitHUD's notification
when an observed usage bucket returns to 100%. Our theme controls already offer
dark/light/system, and refresh interval is already exposed in Settings. Signed
update downloads already support release notes and a separate explicit install
step. macOS minimum is 12 for Orbilap versus 13 for OrbitHUD.

Sources checked locally include `src/components/WorkspaceSettings.tsx`,
`WorkspaceMenuBar.tsx`, `BankedResetSection.tsx`, `SettingsModal.tsx`,
`src-tauri/src/tray.rs`, `desktop_switch.rs`, `banked_resets.rs`, `lib.rs`,
`settings.rs`, `antigravity.rs`, `claude_usage.rs`, and the current task record.
Some descriptive docs lag the current source (for example Codex-only rotation
wording); the comparison above follows the implementation.

## Suggested product discussion, not adopted work

1. A compact persistent quota view is the most visible feature opportunity for
   people who want capacity on screen while coding. Keep it optional and reuse
   the current home design/system if the owner chooses it.
2. External auth filesystem watchers could improve account-change recovery.
   Acceptance should cover login/logout, atomic file replacement, a missing
   directory created later, rate-limit backoff and identity-safe cache clearing.
3. A GitHub download report is a small maintenance improvement. Keep updater
   archive and DMG requests distinct so they are not mistaken for unique users.
4. A token counter needs a clear local/account/provider scope and verified
   transcript formats. It should not imply subscription cost or remaining quota.
5. Desktop widgets and Windows/Linux support need a separate owner scope decision.
   Usage notifications should remain consistent with the existing removal
   decision unless the owner explicitly revisits it.

## Verification and limits

- OrbitHUD `swift test --scratch-path /tmp/orbithud-review-swift-20261128`:
  executable/core compilation succeeded; 19 XCTest tests passed, zero failures.
- OrbitHUD `npm test` in `cross-platform`: quota fetching/provider manager,
  window bounds, updater helpers, quota alerts and release stats suites passed.
- Anonymous GitHub Releases API confirmed v1.2.7 assets. Public Homebrew,
  WinGet and AUR locations were checked separately as described above.
- No OrbitHUD application was launched with the owner's accounts. No real
  provider credentials were read for this review. Native notifications, actual
  HUD interaction, package installation and update installation were not
  exercised. Passing parser/helper tests does not verify those end-to-end flows.
- No Orbilap application source, saved settings, account data, dependency,
  version or release artifact was changed by this review. The comparison report
  and task evidence are the only intended repository edits.
- Orbilap's required local checks also passed: `pnpm exec tsc --noEmit` and
  all 511 Vitest tests in 45 files. An initial Vitest invocation was interrupted
  by starting the broad project restart too early; the complete rerun exited 0.
  `pnpm run dev:restart` completed, Vite returned HTTP 200 on port 5174, the
  Tauri log recorded `Finished dev profile`, and fresh debug app PID 86461 was
  observed. The native dev application was left running. No frontend or Rust
  source changed, so served-source/HMR change checks and offline Cargo check
  were not applicable. No native UI interaction was independently verified.

Public references: [reviewed source](https://github.com/mojtaba-afraz/OrbitHUD/tree/22509ae52a461caf5b1bd2d3618a76ddceee2b13),
[release](https://github.com/mojtaba-afraz/OrbitHUD/releases/tag/v1.2.7),
[roadmap](https://github.com/mojtaba-afraz/OrbitHUD/blob/22509ae52a461caf5b1bd2d3618a76ddceee2b13/ROADMAP.md),
[packaging guide](https://github.com/mojtaba-afraz/OrbitHUD/blob/22509ae52a461caf5b1bd2d3618a76ddceee2b13/packaging/README.md).
