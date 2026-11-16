# README badge sources

The README keeps three badges: version, macOS support and project license.
The version badge reads `package.json` through Shields.io's GitHub endpoint,
subject to indexing and caching. The platform badge describes the macOS target
in `src-tauri/tauri.conf.json`.

Local test results are recorded in the version's
[security review](releases/1.0.0.security.md), rather than a README badge that
could become stale. GitHub Actions is not used for builds or release publication.
See [Testing](TESTING.md) and [Security](SECURITY.md) for the checks and limits.

The license badge reads GitHub's detected root [LICENSE](../LICENSE).
Orbilap's original code is MIT-licensed, also declared in `package.json` and
`src-tauri/Cargo.toml`. Third-party code retains its own terms, including the
Commons Clause restrictions in [the UI component notice](../src/components/ui/LICENSE.md).

Coverage, notarization and security-audit success badges are not advertised.
