# Workspaces

Setup has three steps. First, name the workspace. **Load accounts** detects
installed apps and command-line tools and automatically verifies their local
sessions. Each result shows its source. Codex Desktop and CLI share the default
login, which appears once. Orbilap labels that shared login **Codex app** when
the desktop app is installed. If the CLI uses a separate `CODEX_HOME`, Orbilap
tries that session first and falls back to the desktop login if verification fails.
The same local check runs when you choose a provider under **Add Account**.

Saved profiles also appear in workspace setup. The supported local sessions are
the Codex file-backed login, Claude Code's local session including Claude
Desktop's Code runtime, and the shared Antigravity Google login. Saved Codex
and Antigravity accounts use local plan information during discovery. New local
sessions require live verification. Reloading keeps selections that are still
available. Orbilap revalidates each selected account before saving.

The third step lets you optionally add a new account and then create the workspace.
Choose a provider, then a method. Codex offers official browser login,
device code and auth.json import; Claude offers official CLI browser login in an
isolated configuration or connection to an existing configuration directory.
Antigravity connects directly through the verified official ACP agent,
reusing the last saved login without a method/name step. Its first sign-in downloads
the pinned runtime; no installed AGY OAuth client is needed for that method.
Session/credentials file import is unavailable for Antigravity.
Enrollment requires server-confirmed identity, paid tier and measured usage.
See [official-agent enrollment](ANTIGRAVITY.md). Google AI Pro / Ultra accounts
connect through this Antigravity flow, which can be hosted inside Gemini.app on
macOS.

Antigravity **Switch** verifies the selected workspace member's Google identity,
paid tier and measured quota, then writes AGY's consumer token profile directly
to the shared macOS Keychain entry. OAuth secrets never cross IPC or process
arguments. Previously saved logins without an ID token require reconnecting before
switching. Legacy AGY fallback-file configurations must first sign in through
Antigravity's shared Keychain flow. After saving the switch, Orbilap opens the
Antigravity app or brings its window forward. Reopen any running Antigravity or
AGY session that still uses the previous login. The Active badge describes the
shared saved login. Enrollment and manual usage refresh leave the login alone.

In Settings → Usage, enable **Auto-switch Antigravity accounts** and select at
least two accounts from the current workspace. The threshold defaults to 2%
remaining. Orbilap checks the actual shared Google login and looks for another
selected account with capacity in the matching Gemini limits. It verifies the
target before switching and sends a notification so you can reopen any running
Antigravity or AGY session when ready.

References: [Google consumer deprecation](https://developers.google.com/gemini-code-assist/docs/deprecations/code-assist-individuals)
and [Antigravity shared authentication](https://antigravity.google/docs/install?tab=cli).

File import accepts a file chooser, drag and drop, or a full file path. Selected files
are checked for valid JSON and a 256 KB size limit; Finder drops pass the path
to the native validator. File drafts and selections survive Back within setup.
Several new accounts can be verified before one final save. Native drafts hold
temporary isolated login homes; leaving asks to discard unsaved work, stops login
processes and removes app-owned temporary credentials. Claude configurations keep
their stable absolute paths because their Keychain service depends on that path.
Provider browser login runs in the system browser, initiated from the panel.
Imports never activate Codex. The primary actions and tiny privacy footer are outside the content scroller
in both inline setup and the create-workspace modal.

The macOS file chooser temporarily takes focus from the tray panel. The panel
stays visible while that native modal is open, so choosing or cancelling returns
to the same account draft. Ordinary focus loss still dismisses the panel.

Existing saved Codex profiles migrate once into **Personal**, preserving account
names, preferences and credentials. An unsaved CLI login waits for the user to load and select it in step two.

Saved accounts can be shared by multiple workspaces without copying credentials.
Codex account display and switch preferences belong to each workspace.
Each provider has an independent active default in `usage.activeAccounts`.
Codex and Claude can both show Active simultaneously. Load accounts prioritizes
the current login of each provider; adding a backup retains the existing default.
When a default is removed, a remaining account of that provider becomes its
fallback, without clearing any other provider’s selection. Codex credential
activation still uses its real CLI identity and the existing restart safeguards.
Each removal offers removing the membership here or forgetting the saved account
in all workspaces. Workspace selection changes the visible
accounts and native monitoring policy. Account activation is explicit.
The pencil on a saved account opens **Edit account** for renaming and removal.
Moving is an explicit reassignment. Loading the same account into another
workspace shares it. Codex login recovery stays available on disconnected cards.
Connected accounts show their measured limits inline. The workspace and account
appearance uses a shared iris accent in light, dark or system mode. Semantic
warning thresholds can tint the native icon and limit display together. Legacy
accent fields remain in stored data for compatibility.

The global menu-bar provider picker includes Codex and remains available while
usage is disabled. Selecting Codex exposes the active workspace's menu-bar switch
and a shortcut to its Menu bar tab; it never rewrites that selection to Claude.
Other-provider panel visibility follows the workspace’s `providerIds`; missing/null membership retains the legacy global visibility. Workspace Menu bar shows account selection when enabled; Usage shows enrolled switch-cycle members.

| Scope | Preferences |
| --- | --- |
| Workspace → General | Name |
| Account card settings | Account name and removal |
| Workspace → Usage | Remaining/used percentages, automatic switching, reset updates and optional predictions |
| Workspace → Menu bar | Visibility, provider, account, initials, percentages/progress, limit selection and warning colors |
| Global | Theme, refresh cadence/focus, launch at login, reset-outlook polling cadence, updates, display |

The native monitor restricts Codex display and automatic switch candidates
to the selected workspace. Automatic switching also requires its workspace master
and two explicitly enrolled accounts. Selecting another workspace or moving a
member cancels an invalid automatic countdown. Manual jobs retain their lifecycle.

The active card reports personal quota exhaustion separately from public reset
forecasts. Multiple exhausted main windows use the latest reset, with total hours
and minutes (`Resets in 28h 15m`). Missing times remain explicit; elapsed deadlines
await fresh quota data. Model-specific/reserve buckets do not trigger this notice.

The adjacent icon chooses the next usable account in workspace order. Candidates
must be connected, have current main-window data, include learned windows and
have capacity in every main window. A click rereads identity/quota before the
existing cancellable 30-second desktop restart. No candidate disables the button.
The banner offers Cancel and Switch now; the native worker survives a hidden panel.

Metadata shares `agent-rtl.settings.json`: `workspaceVersion`, `activeWorkspaceId`
and `workspaces`. A workspace contains `id`, `name`, `accent`, `accountIds`,
`claudeAccountIds`, `antigravityAccountIds`, `providerIds`, `accountPreferences`, `usage`.
Credentials remain in the private profile repository. Global updates/reset cannot
overwrite workspace metadata. Workspace commands validate names, accents,
membership and destinations under the settings lock.

| Command | Result |
| --- | --- |
| `begin_account_setup()` / `discard_account_setup({sessionId})` | Create or clean a native draft |
| `account_discovery_sources()` | Detect installed desktop apps and CLIs without reading logins |
| `load_setup_accounts({sessionId, sources})` | Verify saved profiles and selected local sessions. Returns metadata only. |
| `start_setup_login` / `poll_setup_login` / `cancel_setup_login` / `submit_setup_code` | Cancellable isolated sign-in, provider-approved URLs and device codes only |
| `import_setup_account` / `connect_setup_config` / `connect_current_google` | Verify and stage an account without permanent membership |
| `commit_account_setup({sessionId, workspaceId?, name, accent, accountIds})` | Revalidate all selected draft accounts, save memberships once; `AppState` |
| `remove_workspace_account({workspaceId, provider, id, everywhere})` | Remove local membership or explicitly forget globally |
| `discover_workspace_accounts()` | Read signed-in CLI accounts with confirmed paid plans; metadata only |
| `create_discovered_workspace({name, accent, providerIds, accountEmails})` | Revalidate and save only selected providers; `AppState` |
| `create_workspace({name, accent, accountName, credentials?, path?})` | Import first account; create/select workspace; `AppState` |
| `import_workspace_account({workspaceId, accountName, credentials?, path?})` | Add account without activation; `AppState` |
| `update_workspace({id, name, accent, usage})` | Update identity/policy; `AppState` |
| `select_workspace({id})` | Change visible workspace; `AppState` |
| `move_workspace_account({id, targetId})` | Reassign membership without changing login; `AppState` |

Imports accept exactly one of `credentials` and `path`. Metadata save failure
rolls back newly created profile indexes. Existing accounts remain saved.
Command results never contain credentials. `pnpm run reset:data` clears Orbilap's
dev state and dev-owned login homes without deleting installed-app data or ambient
provider CLI logins. See [Local data](DEVELOPMENT.md#local-data) for the separate roots.
