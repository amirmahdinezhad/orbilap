# Orbilap — agent rules

## Design and motion

- For UI, UX copy, dialogs, or interaction changes, first read the current
  system at the top of [docs/DESIGN.md](docs/DESIGN.md). The home panel is the
  reference. Start from the closest existing surface and reuse shared components,
  variants, icons and theme tokens. Avoid local overrides of shared control
  typography, shape, size and interaction states. Define any new pattern in the
  shared system and document it in DESIGN.md.
- Apply Emil's `emil-design-eng` to each changed surface, then `animate` to
  interactions that need motion. Check every state against the home panel at
  tray width in both themes, including keyboard focus, reduced motion and
  pointer behavior.
- All icon-only buttons throughout the project must be fully circular, never
  rounded squares. Use equal width and height, `border-radius: 50%`, and the
  shared Button icon sizes. Apply this to every surface and state, including
  dialogs, sorting, notifications and hover/press layers. Preserve accessible
  names, focus, disabled/busy behavior and existing pointer/reduced-motion rules.
- Put every action and its opposing action (Save/Cancel, Remove/Cancel,
  Confirm/Cancel, Open sign-in/Cancel sign-in, Discard/Keep editing) beside
  each other in one horizontal row, including at tray width. Use the shared
  `action-row` layout with equal-height controls and matching shape and type.
  Put the safe/cancel choice first and the primary/destructive action second
  in reading order. Allow labels to wrap inside their buttons, never stack
  the pair. Keep contextual help below the row so expanding it cannot separate
  the choices. Cancellation uses a neutral secondary button; reserve red for
  destructive actions. Keep safe initial focus, busy locks and keyboard behavior.

## Security and account data

- For security or account-data changes, run `pnpm run test:security`,
  `pnpm run security:check`, and the locked Rust suite. Review the applicable
  attack surfaces in [docs/SECURITY.md](docs/SECURITY.md) and report what passed,
  any findings, and any flows that could not be verified.
- Use disposable accounts or synthetic credentials for security tests. Keep
  provider tokens, cookies, keys and account exports out of logs, scanner
  output, fixtures, screenshots and build artifacts. Keep saved credentials
  private from the first write and redact provider failures before exposing
  them to the webview. Scope credential-bearing requests to trusted endpoints.

## Cleanup and bundle size

- Regularly remove superseded local build outputs, caches, QA exports and
  redundant documentation, including Markdown drafts. Check references and
  provenance first. Preserve account files, signing material, active work,
  required documentation and release notes and security evidence.
- Measure production bundle changes against a comparable build. Remove unused
  code, dependencies and duplicate assets where measurements justify it.
  Preserve provider behavior, accessibility, updater verification and both
  supported macOS architectures.

## Release workflow

- Read `docs/RELEASING.md` when preparing, building or publishing a release.
- Before every release, complete [docs/SECURITY.md](docs/SECURITY.md), run
  `pnpm run security:check` against the exact candidate source and lockfiles,
  and record the results and unresolved findings in
  `docs/releases/<version>.security.md`. Recheck after changes to the candidate.
  Security failures or unavailable checks block release approval until resolved
  or explicitly accepted by the owner with the finding and reason recorded.
  Report tested scope and limitations. Passing tests do not prove absence of bugs.
- `release:check` requires this version's security report. The approved
  `release:publish` path reruns `security:check` before contacting GitHub.
  Resolve a failed gate and rerun publication through that path.
- Keep the app and manifests at 1.0.0 until the owner explicitly asks
  for a version bump. Maintain English notes in `docs/releases/<version>.md`
  and synchronize the app versions when a bump is authorized.
- Present the tested changes, proposed version and release notes for the user's
  approval. A successful local test is not permission to publish. Wait for
  explicit approval for that particular release before pushing its tag or
  publishing it. An explicit request to publish a named version is approval for
  that version only, not for later releases.
- After approval, push the reviewed commit and `v<version>` tag to
  `amirmahdinezhad/orbilap`. Build locally from the exact tagged commit and
  upload verified assets to a **draft** GitHub Release; GitHub Actions is not used.
  Always build separate `aarch64-apple-darwin` (Apple Silicon) and
  `x86_64-apple-darwin` (Intel) releases to keep downloads small; do not ship a
  universal bundle by default. Each architecture needs its own DMG, updater
  archive and signature. Map each `latest.json` platform to its matching archive.
  Verify both DMGs, updater archives, signatures, single-architecture binaries, checksums,
  release notes and `latest.json` before publishing
  with `pnpm run release:publish --approved`.
- Confirm the public feed and assets work without GitHub authentication and
  check Settings → Updates in the native panel. Report the release URL and
  checklist results. Installed users must be able to read the notes, download,
  then explicitly choose Install & relaunch.
- Reuse the existing updater signing key; keep its private half outside this
  repository and supply it privately to local release builds. Release artifacts
  must come from the exact tagged commit. Preserve uncommitted work and keep local account
  data, credentials, screenshots and QA recordings out of public commits.

## Dev stack (do not change ports)

- After every completed change, run `pnpm run dev:restart` without waiting for
  the user to ask to see localhost. Stop the project's existing dev processes
  first, then start the latest source with `pnpm run tauri dev` on port 5174.
  Verify Vite responds, the native build succeeds and a fresh dev app PID exists
  before handing back. Leave the latest native dev app running. Do not kill
  unrelated projects, the user's terminal/editor or the agent's ancestor processes.
- `pnpm run dev:restart` is also the owner's manual clean-restart command.
  On macOS it runs Tauri under the independent launchd supervisor; Tauri starts
  Vite using the normal beforeDevCommand. Both existing log paths remain available.
- Frontend: `vite --port 5174 --strictPort` → http://localhost:5174/
- Combined startup: `pnpm run run` starts Vite and Tauri on the configured port 5174.
- App: `tauri dev --config '{"build":{"devUrl":"http://localhost:5174","beforeDevCommand":""}}'`
  when Vite is already running. Both default configs use **5174**.
- The real UI surface is the **tray panel** (menu-bar icon click), not a browser
  tab. Tray clicks show the existing panel instantly; frontend updates arrive
  through Vite HMR. Keep this behavior in dev and release builds.
- Leave `custom-protocol` out of the Tauri dependency's permanent features.
  The Tauri CLI enables it for production builds. Enabling it during dev loads
  embedded `dist` assets and silently disconnects the panel from Vite.

### Native panel and HMR verification

- A plain browser has no Tauri IPC, so the app shows the
  "Couldn't load settings … (reading 'invoke')" empty state there. That is
  expected — the real provider list only renders inside the Tauri window.
  Browser/source checks alone do not prove that the native panel is current.
- `CliProviders.tsx` also exports `formatAgo`/`formatReset`, so React Fast
  Refresh bails out (`hmr invalidate … Could not Fast Refresh`) and the client
  does a full page reload instead. Do not mistake the reload for a failure.
- To prove the panel's webview receives HMR while open: move all preview tabs
  off port 5174, confirm an established WebKit connection with
  `lsof -nP -iTCP:5174`, then `touch` a frontend file and confirm a fresh
  `hmr update` line in `/tmp/orbilap-vite-5174.log`. An HMR log without a
  connected native client is insufficient.

## After EVERY task — run this checklist, no exceptions

For every feature and bug fix, implement and verify the change in the local
native dev panel. Complete these checks after every task:

1. **Typecheck**: `pnpm exec tsc --noEmit` (must exit 0).
2. **Tests**: `pnpm exec vitest run` (all files must pass).
3. **Restart dev**: follow [Dev stack](#dev-stack-do-not-change-ports).
4. **Live frontend** (for any change under `src/`):
   - Served source: `curl -s "http://localhost:5174/src/path/to/File.tsx" | grep -c "<expected-string>"`
   - HMR/reload pushed: `tail -n 3 /tmp/orbilap-vite-5174.log`
   - Live page (preview browser on 5174) via snapshot/evaluate — e.g. no stale
      copy in `document.body.innerText`.
5. **Rust changes** (for any change under `src-tauri/`): run `cargo check --offline`
   in `src-tauri/`, then confirm the `tauri dev` watcher rebuilt
   (`tail /tmp/orbilap-tauri-dev.log` shows `Finished dev profile`,
   new `target/debug/orbilap` PID).
6. **Report** the checklist results (typecheck/tests/live) in the final message.

## Deferred device management

- **Continuation trigger:** If the user asks to run, resume or grill device management, read
  [docs/DEVICE-SYNC.md](docs/DEVICE-SYNC.md#resume-in-a-new-chat) first. Use the
  `grilling` skill to review the open decisions before enabling the feature.
  The code and previous candidate evidence are retained; the feature is off
  in the default app and ordinary dev builds.
