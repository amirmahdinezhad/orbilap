# Development

Orbilap uses Tauri v2, Rust, React, TypeScript and Tailwind. The native tray panel
is the development reference; a browser preview cannot perform Tauri IPC.


```bash
pnpm install --frozen-lockfile
pnpm run run
```

This starts Vite on **http://localhost:5174/** and the native Tauri dev app.
Use the menu-bar icon to open the actual panel. A browser preview has no Tauri
IPC and is expected to show a settings-load error.

Run `pnpm run dev:restart` for a clean restart of the latest source. It stops
this checkout's dev processes (including orphaned Vite/Tauri children), then
runs `pnpm run tauri dev`. On macOS the launchd supervisor keeps it running
after the invoking terminal or Codex closes. Tauri starts Vite on port 5174.
Other projects and the invoking terminal/editor are preserved. The command
refuses to start if an unrelated process still owns port 5174.

To inspect a synthetic Claude account in the actual tray panel and menu bar,
run `ORBILAP_PREVIEW_CLAUDE=1 pnpm run dev:restart`, then click Orbilap in the
menu bar. Claude shows 72% remaining for five hours and 46% for the week.
Run `pnpm run dev:restart` to return to the regular workspace.


On macOS, `pnpm run run` starts a launchd-owned supervisor so closing Codex
cannot also close Orbilap or Vite during an account restart. The command returns
while dev continues. `pnpm run dev:status` checks that ownership;
`pnpm run dev:stop` stops both services. Logs remain in
`/tmp/orbilap-vite-5174.log` and `/tmp/orbilap-tauri-dev.log`.

If Vite is already running:

```bash
pnpm exec tauri dev --config '{"build":{"devUrl":"http://localhost:5174","beforeDevCommand":""}}'
```

For desktop account-restart testing from Codex, use the independent combined
startup. A dev instance owned by Codex refuses to close its own ancestor.

Keep port 5174 and `strictPort`. Leave `custom-protocol` out of permanent Tauri
features so dev uses Vite and HMR. Do not create a release bundle unless the
user explicitly requests one.

```bash
pnpm exec tsc --noEmit
pnpm exec vitest run
cd src-tauri
cargo check --offline
cargo test --offline
```

See [Testing](TESTING.md) for native panel and HMR checks.

## Local data

Debug/dev builds store Orbilap-owned data under
`~/Library/Application Support/com.7skylab.orbilap.dev` on macOS. Installed release
builds use `~/Library/Application Support/com.7skylab.orbilap`.
Neither build falls back to the other store or the old shared
`ai.opencode.desktop` directory. Removing the installed app's data therefore
keeps a subsequent installation in onboarding. Old accounts are not automatically
imported; existing legacy files are preserved and can be imported explicitly.
Dev also uses a separate single-instance
identifier so an installed app cannot intercept its launch. Provider CLI homes
remain shared: discovery can still offer current CLI logins, and explicitly
switching a provider account still changes that provider's active login.
On Windows the roots use `AppData/Roaming`; elsewhere they use `.config`.

The following app-owned paths use the release root (replace it with the dev root
when debugging):

| Location on macOS | Purpose |
| --- | --- |
| `~/Library/Application Support/com.7skylab.orbilap/agent-rtl.keys` | Launch-at-login flag; the OS is the source of truth. |
| `…/agent-rtl.settings.json` | Refresh cadence, percentage display, menu-bar appearance, multi-profile selection and auto-switch. |
| Webview localStorage: `orbilap.displayPrefs` | Theme, focus refresh and daily automatic update preference; legacy density fields. |
| Webview localStorage: `orbilap.lastUpdateCheck` | Timestamp of the latest successful update check. |
| `…/orbilap-claude-profiles/profiles.json` | Anthropic profile names and Claude configuration-directory references. |
| Webview localStorage: `orbilap.skippedUpdateVersion` | Skipped updater version. |
| `~/.local/share/opencode/auth.json` | Read-only OpenCode credentials and connected services. Honors `XDG_DATA_HOME`. |
| `~/.codex/auth.json` | Codex identity and OAuth access token. Explicit profile activation replaces this cache atomically. Honors `CODEX_HOME`. |
| `…/orbilap-codex-profiles/profiles.json` | Profile IDs and names; independent of legacy app-data cleanup. |
| `…/orbilap-codex-profiles/<id>/auth.json` | Each profile's private ChatGPT login cache. Credentials never cross IPC. |
| `~/.claude/projects/**/*.jsonl` | Read-only Claude quota snapshots. Honors `CLAUDE_CONFIG_DIR`. |

`ORBILAP_OPENCODE_USERDATA` overrides Orbilap's application-data directory for
isolated testing in either build. Point it at a disposable directory; explicitly
using the same override shares data again. `pnpm run reset:data` resets only dev
storage (or this override) and leaves the installed app running with its data.
On startup, recognized legacy keys/accounts/profile-era
preferences are removed from Orbilap's own store/settings files. Named Codex
profiles use their own directory and survive that cleanup. Profile directories
use mode 0700 and credential files use 0600 on macOS. Files contain tokens in
plaintext, like Codex's own file store; keep them out of source control and logs.

### Remove the installed app and its data

Quit Orbilap, remove `Orbilap.app`, and remove
`~/Library/Application Support/com.7skylab.orbilap` to forget its saved accounts
and workspaces. To also remove webview preferences and caches, remove the
Orbilap-only entries under `~/Library/WebKit` and `~/Library/Caches`
(`com.7skylab.orbilap`, or `orbilap` for older webviews).
Deleting only the app bundle preserves data. There is no uninstall agent or
background cleanup service. Never remove OpenCode's shared application directory
as part of uninstalling Orbilap. Provider CLI homes and provider-owned Keychain
entries are independent; discovery requires explicit selection before adding
those accounts to a new workspace.

## Codex profiles

Open **Codex profile** at the top of the panel (also reachable through Add
account). Choose Add profile and enter a name. Then choose:

- **Import auth.json file:** paste its full path in the in-app form (absolute or starting with `~/`). Orbilap
  validates it and saves a private copy; the source and active account stay intact.
- **Sign in to another account:** Continue with browser launches the installed
  Codex CLI's sign-in for this isolated profile. Orbilap detects completion.
  Cancel stops the child process. Terminal and device-code instructions remain
  available as fallbacks.
- **Save current Codex account:** keep the existing login as a named profile.

### Testing browser enrollment

**Add Account → ChatGPT / Codex → Sign in with ChatGPT** always uses Codex
`app-server` in an isolated staging home. Orbilap opens the returned OAuth URL;
the normal default browser receives it through the shared URL opener. Reconnect
uses the same enrollment path. The frontend opens each attempt once, including
URLs received after startup, and supports explicit retry. The CLI keeps ownership
of PKCE, state and the local callback; only approved login URLs cross IPC.

The pending ChatGPT browser screen offers Open sign-in page, Copy link and the
shared red Cancel sign-in. A short note directs someone seeing
“Device limit reached” to copy the same link into a Private or Incognito window
manually. Copying is an explicit clipboard action, never a new login attempt or
another browser launch. Clipboard/browser failures keep the attempt available
for retry or cancellation. Device-code login retains its separate Copy code.

There is no automatic private-browser launch, browser-specific dispatch,
AppleScript, Accessibility/Automation permission request or privacy-settings
command for enrollment. App-server errors/transcripts and credentials are never
returned to the webview. Account verification and explicit saving are unchanged.

Manual Switch starts the graceful desktop replacement immediately on macOS,
without a countdown. Orbilap quits Codex gracefully, installs the selected login
after exit and reopens it. Automatic switching also has no countdown. If
a local thread is running, a confirmation offers **Close and switch** and
**Cancel**; uncertain activity gets a separate explanation and the same choice. No force quit is used; refusal to close aborts replacement.
A missing desktop app blocks restart.
The running app's bundle path is captured before closing and reopened directly.
**Activate for CLI only** is available under Manage for a file-only switch.
New CLI processes use the selected cache; existing sessions should be reopened.

Manage an existing profile to **Replace login from file** when a manager sends
updated credentials. Imported replacements remain pending until activation;
refreshing the list cannot overwrite their new tokens with the old active cache.

Activation changes only `auth.json`, preserving Codex configuration and chat
history. A current account that has not yet been saved is preserved as a
Previous account profile. Removing a profile forgets its saved login without
logging out the active CLI. External CLI sign-ins are reflected on refresh;
profile identity uses the token's subject and workspace, not its email.

The close/replace/reopen workflow is based on this user's observed desktop
setup, not a universal desktop switching API. Restart verification checks that
the active login file matches and a new desktop process is running. The account
displayed inside Codex still needs to be checked; no remote token validity or
in-memory desktop identity is claimed. Versions using a separate sign-in may
require their own login. If replacement fails after quitting, Orbilap reopens
Codex with the old login. A reopen failure leaves a recovery profile available.
ChatGPT API-key logins
and non-file credential stores cannot currently be imported or activated.

## Anthropic profiles

Choose **Anthropic profiles** inside Codex profiles, or select Anthropic in the
new-profile form. Track the current Claude configuration or create an isolated
one. Run the supplied sign-in command in Terminal, then choose **Test connection /
Rescan**. Start Claude with the profile's **Use this account** command.

Isolation uses the CLI's documented `CLAUDE_CONFIG_DIR` workflow. Claude owns
credentials, Keychain entries, settings and conversation history. Orbilap stores
metadata and reads subscription usage with the selected profile’s existing login;
it does not replace Claude’s global credentials. Forgetting a tracked profile preserves its CLI directory and login.
Codex auto-switch applies only to Codex profiles.

See [usage preferences](USAGE_PREFERENCES.md) for defaults and alert/pace
behavior, and [Claude authentication](https://code.claude.com/docs/en/authentication#log-in-with-multiple-accounts)
for the configuration-directory workflow.

## Docs

- [Frontend/backend contract](../CONTRACT.md)
- [Adding a provider](ADDING_A_PROVIDER.md)
- [Testing](TESTING.md)
- [Release workflow](RELEASING.md)

### Home panel rendering

`HomeChrome.tsx` owns the workspace header and persistent bottom actions; only
`main.home-accounts` scrolls. `WorkspaceAccounts` owns Codex content rather than
page controls. `useAccountClock` updates display time every 30 seconds and at
exact subscription expiration, plus on focus. The native restart hook still
polls every second, but preserves equal status and does not update a clock while
idle. Its regression test verifies both idle render stability and detection of a
new native switch.

Home feedback uses a single Sonner Toaster through components/Toast.tsx;
showToast retains the existing ok/err call contract. Keep notifications above
the fixed dock and outside dialogs. main.tsx wraps the app in the shared Radix
TooltipProvider so adjacent controls can reuse the skip-delay window. The current
home.css skin uses graphite/iris tokens and separate static usage tiles, replacing
the earlier blue/ring proposal. Temporary IPC mocks are QA artifacts and must not
be published or committed with account data.

Home usage is now read-only: AccountQuotaPreview renders measured values, a time marker on the capacity bar and optional inline secondary windows. Exact
local reset deadlines appear in the shared accessible tooltip. LiveAccountUsage supplies
identity/refresh-key guarded reads only when a saved snapshot isn't supplied.
Codex's Available resets dialog contains inventory and the existing explicit
redemption review, rather than quota charts. The general UsageModal component
remains available to other consumers but is no longer mounted by App. Home's
single-pixel gradient borders use identical opaque padding-box surfaces and
gradient border-box layers, without CSS masks, and opacity-only 500ms ease fades; no layout or quota values animate.

Tooltip's optional motion/contentClassName props are used by the compact reset
hint. Radix remains responsible for interactions/positioning. Its opt-in WAAPI
presence retains pointer exits, resumes interrupted fades and ignores cancelled
completion callbacks. Ordinary button/title tooltips remain uncontrolled and
unchanged. Visible reset copy is brief; aria-valuetext retains the full date and
time-marker explanation. Preserve existing card-edge geometry/timing.


Workspace account discovery runs one bounded worker per provider (at most three),
partitioning draft entries so no provider mutates another provider's entries.
The session lock remains held until all workers join; restore every worker's
entries even on failure before returning accounts in Codex/Claude/Antigravity
order. Single-provider discovery still scans only local sessions. Within Codex
enrollment, live identity/paid-plan verification precedes concurrent usage and
optional profile-name reads. The optional name request has a two-second timeout
and falls back to the saved-login name; usage failures still block enrollment.
Do not parallelize refresh-token operations on the same credential home. The
account_setup scheduling tests use bounded handshakes, synthetic waits and owned
temporary homes; they do not measure live provider response times. The UI still
waits for the complete discovery response; results are not streamed.


Automatic Antigravity discovery has a shared three-second absolute deadline for
Keychain waiting and all Google requests/bodies, including across saved/current
candidates. It skips repository-lock contention rather than waiting behind a
background renewal. Manual enrollment/commit keep normal request timeouts. One
Google identity/paid-tier verification is reused for the measured quota request
under the same credential lock/client; do not repeat inspection inside enrollment
usage reads. Accounts that fail or exceed the automatic budget are omitted and
remain available for a manual connection or a later retry. The ignored
`live_discovery_finishes_within_five_seconds` test requires an existing paid local
account, stages/discards discovery and prints only elapsed time/account count.
Run it explicitly with `cargo test --locked --offline
live_discovery_finishes_within_five_seconds -- --ignored --nocapture`.

## Proxy changes during usage refresh (2026-11-16)

The usage client is rebuilt for each fetch because reqwest snapshots the macOS
system proxy during construction. A process-wide client retained Windy's
127.0.0.1 proxy after disconnect and resumed working when that listener reopened.
Codex, OpenCode and shared billing/profile callers now observe the current proxy.
HTTPS-only requests, certificate verification, redirect refusal and the ten-second
timeout remain enabled. Existing in-flight requests can finish with their earlier
configuration. The regression runs in a separate test process and changes between
two loopback HTTP CONNECT fixtures without provider credentials or external traffic.

Antigravity had the same process-wide HTTP cache. Its client now refreshes the
system proxy per operation while retaining its 20-second timeout, user agent and
redirect policy. A fresh native dev process was launched on port 5174.

## Bounded saved Antigravity refresh (2026-11-16)

Saved usage now shares one 12-second Probe deadline through lock waiting and all
network stages. Timed try-lock polling retains per-account serialization without
immediately rejecting a refresh that overlaps the menu-bar monitor. A temporary
fail-fast lock change produced an account-busy error and was replaced by bounded
waiting. Requests for different accounts still overlap and mutations remain
exclusive. Panel API reads for usage, CLI status and saved profiles settle after
15 seconds, clear timers and discard late responses. Existing error/loading
components receive the failure through their normal promise handlers.

Three stalled IPC regressions failed before the change and passed afterward.
Existing response-body/shared-deadline checks plus repository deadline and
same-account serialization checks cover the native budget. A read-only live run
using a disposable private copy of the saved Google credentials initially timed
out at 12.01 seconds. After the owner connected their VPN, the same verified
identity/paid-plan/usage path succeeded in 2.52 seconds. No active login switch or
VPN endpoint change was requested by the agent.

The overall home Refresh cycle also has a 15-second watchdog, starting before
settings are read. Expiry releases the button, reports through the existing
toaster and invalidates pending settings/profile/provider generations. A later
reply cannot overwrite a newer refresh. The timer is cleared on completion,
replacement or unmount. A stalled-settings regression proves the button re-enables
at the deadline and ignores the old reply.
