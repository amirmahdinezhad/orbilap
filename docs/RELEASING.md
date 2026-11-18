# Releasing Orbilap

Source and releases: <https://github.com/amirmahdinezhad/orbilap>.
Build separate macOS 12+ releases for Apple Silicon (`aarch64-apple-darwin`)
and Intel (`x86_64-apple-darwin`). Each has its own smaller DMG and signed updater
archive. Do not ship a universal bundle by default.

## Prepare and obtain approval

For every feature or bug fix, finish implementation and the `AGENTS.md` local
checklist in the native **dev tray panel** first. Keep development on port 5174.
Keep every app version at 1.0.0 until the owner explicitly authorizes a bump.
Use SemVer for any authorized version change. Synchronize `package.json`,
`src-tauri/tauri.conf.json`, `src-tauri/Cargo.toml`, the orbilap entry in
`src-tauri/Cargo.lock`. Maintain the English notes in `docs/releases/<version>.md`.
Run `pnpm run release:check` and `pnpm run test:release`.
Complete `docs/SECURITY.md` and `pnpm run security:check` before requesting
approval. Record findings, fixes and test limitations in the version's
`docs/releases/<version>.security.md` and include them in the release review.

Before the next packaged build after 1.0.1, check the upstream
[`picomatch` advisory](https://github.com/advisories/GHSA-fc5q-39xc-vjpf)
and npm for a fix for CVE-2026-112366. If one is available, update all resolved
copies in the lockfile and run the full security gate before producing the
build. The owner-approved 1.0.1 exception expires with that version.

Present the tested changes, proposed version and notes to the owner. Wait for
explicit approval for that release before pushing its tag or publishing it.
An explicit request to publish a named version already authorizes that version;
it does not authorize later releases. Successful local tests are not approval.

## Signing and GitHub setup

The public endpoint is
`https://github.com/amirmahdinezhad/orbilap/releases/latest/download/latest.json`.
Installed apps do not need a GitHub account or token.

The updater public key in `tauri.conf.json` is the **base64-encoded complete
Minisign public-key file**, including its comment. The matching private key is
outside the repository. Preserve and securely back up this key: replacing it breaks trust for existing installations.

Build releases locally; GitHub Actions is not required. Supply the existing
private key through `TAURI_SIGNING_PRIVATE_KEY` in the build process environment
(path to the private-key file or its complete contents). Set
`TAURI_SIGNING_PRIVATE_KEY_PASSWORD` if password protected. Never print these
values or put them in repository files. Local `createUpdaterArtifacts` stays
false; release builds override it to true.

Current macOS builds use ad-hoc code signing (`signingIdentity: "-"`) and are
**not Apple notarized**. The updater archive has a separate cryptographic
signature verified by Tauri. Developer ID signing/notarization requires an Apple
certificate and a notarization step before it can be advertised. First-launch
macOS approval is explained in the README.

## Publish an approved release

1. Commit the reviewed app source, scripts and public docs. Keep credentials,
   account data, screenshots and QA recordings out. Preserve unrelated work.
   Push only the intended branch and tag, never checkpoint refs or a mirror.
2. Push the reviewed commit and annotated version tag, for example:

   ```bash
   git push origin main
   VERSION="$(node -p "require('./package.json').version")"
   git tag -a "v$VERSION" -m "Orbilap $VERSION"
   git push origin "v$VERSION"
   ```

3. At the exact reviewed, tagged commit, build locally with the existing updater
   private key supplied in the process environment. Install both Rust macOS
   targets first. Run the security gate and all release checks before building:

   ```bash
   pnpm run security:check
   pnpm run release:check
   pnpm exec tsc --noEmit
   pnpm exec vitest run
   pnpm run test:release
   (cd src-tauri && cargo test --locked)
   pnpm exec tauri build --ci --target aarch64-apple-darwin --bundles app,dmg --config '{"bundle":{"createUpdaterArtifacts":true}}' -- --locked
   pnpm exec tauri build --ci --target x86_64-apple-darwin --bundles app,dmg --config '{"bundle":{"createUpdaterArtifacts":true}}' -- --locked
   node scripts/release.mjs assemble src-tauri/target/aarch64-apple-darwin/release/bundle src-tauri/target/x86_64-apple-darwin/release/bundle
   ```

   Assembly requires an empty `release-artifacts` directory. It compresses
   both DMGs with macOS LZMA (ULMO), preserving the disk layout and app
   signatures, then verifies the resulting assets. Upload only these verified
   artifacts as a **draft**:

   ```bash
   VERSION="$(node -p "require('./package.json').version")"
   gh release create "v$VERSION" release-artifacts/* --repo amirmahdinezhad/orbilap --verify-tag --draft --title "Orbilap $VERSION" --notes-file "docs/releases/$VERSION.md"
   ```

   Pushing source or tags does not build or publish a release. Distribution files
   belong in GitHub Releases assets, not in the tracked repository files.
4. Review both draft DMGs (`Orbilap_<version>_aarch64.dmg` and
   `Orbilap_<version>_x64.dmg`), `Orbilap_aarch64.app.tar.gz`,
   `Orbilap_x64.app.tar.gz`, their `.sig` files, `latest.json` and `SHA256SUMS`.
   Feed notes and release body must match the reviewed notes. Each feed platform
   must point to its matching architecture archive and signature.
   `pnpm run release:verify <asset-directory>` checks notes, immutable URLs,
   checksums, embedded app version, CPU architectures, macOS code signature,
   both DMGs, matching DMG/updater binaries and updater signatures using Tauri's
   Minisign library. Each app must contain exactly its intended CPU architecture.
   Inspect both DMGs. Do not overwrite assets or move a published tag unless the
   owner explicitly requests a rebuild of that same version.
5. After owner approval, with a clean tracked tree at the tagged commit, run:

   ```bash
   pnpm run release:publish --approved
   ```

   It downloads and verifies the draft, publishes it as latest, and checks the
   public feed, both updater archives and both DMGs without authentication. The flag records
   the operator's decision; it is not a substitute for owner approval.
6. Open the native dev panel → Settings → Updates → Check for updates. Confirm
   the running version and server result. Test an actual upgrade on a separate
   installed test copy when an older public version exists. Report the release
   URL, all local checks and any installation test not performed.

Routine verification leaves the installed app intact. Orbilap 1.0.0 starts a fresh
application identity (`com.7skylab.orbilap`, executable `orbilap`) and version line.
Earlier development installations require a manual install. Preserve the existing
updater signing key; changing the repository or bundle name does not rotate it.

## Owner-approved same-version rebuilds

A request to rebuild and republish a named version authorizes replacing that
version only. Keep its version numbers unchanged. Preserve the previous release
metadata and artifacts locally before replacement. Complete local candidate
verification first, then commit the reviewed source and move the annotated tag
using an explicit lease against its previous remote object. Final distributable
artifacts must be rebuilt from that exact tagged commit.

Once final artifacts pass verification, return the existing release to draft,
upload the new architecture-specific assets, replace the feed/checksums and
reviewed notes, and remove superseded universal assets. Publish only through
`pnpm run release:publish --approved`. The existing public release URL is retained.
A same-version rebuild is not offered by the updater to existing users of that
version; they must download and install the appropriate DMG manually. Record the
owner request and prior accepted manual verification limits in the security report.

## Installed users

Settings → Updates → **Check for updates** → **What's new** → **Download** →
**Install & relaunch**. Manual checks reveal previously skipped releases.
Opt-in daily automatic checks respect skips, can download with the panel closed,
and wait for explicit installation. Release notes remain visible after download.
Drafts and prereleases do not become the public latest update.

## Packaging

Both macOS architecture bundles include `Assets.car` for current macOS and
`icon.icns` for older versions. See [the icon source notes](../src-tauri/icons/README.md)
for the catalog regeneration command.

The DMG background and editable source are in `packaging/dmg/`; dimensions and
icon positions are in `src-tauri/tauri.conf.json`. GitHub Releases is the supported
distribution channel.

References: [Tauri updater](https://v2.tauri.app/plugin/updater/) and
[macOS distribution](https://v2.tauri.app/distribute/macos-application-bundle/).
