# Antigravity accounts and official Google sign-in

Google account enrollment uses Google's official Antigravity ACP runtime 1.4.5,
not an Orbilap-built OAuth callback. The first attempt downloads the architecture's
fixed asset from `dl.google.com`; exact byte length, archive SHA-256, and both
executable SHA-256 values are pinned for Apple Silicon and Intel. Every launch
rechecks both executables. Installation is private, atomic and cancellable. A
failed download/hash never runs. Runtime changes require a reviewed source update.

Each draft has its own GEMINI_HOME, ACP settings/token, temporary directory and
empty working directory. Ambient Google/API credentials are not inherited. The
default Google method first checks workspace membership. If a saved Antigravity
account is already enrolled anywhere, this is Add another account: start an empty
agent profile and open Google's account selector. The validated Google URL uses
`prompt=select_account consent` and requests Google’s basic profile scope for the
card name. It preserves the state, PKCE challenge, existing scopes and callback.
With no enrolled saved account, seed the draft with the last detached saved
account's credentials when it has a cached Google name. A detached account
without a name goes through fresh Google consent. Saved-login checks stage those credentials directly for
Google identity/paid-plan/quota verification, without starting another ACP
process or loading its models. New sign-in still uses the official agent.
A valid login completes without opening the browser. A metadata-only last-login
pointer is updated after saving a verified account; older stores use their last
saved account. Removed accounts are never restored. Clicking Antigravity starts
this check immediately: no method selection, requested account name or extra
Continue step. No other application's credentials are read. First-time or revoked
sign-ins may still require Google. Google userinfo supplies the display name and
email; absent names fall back to the verified email. Names are bounded plain text.
Cancellation returns to providers. If Google rejects a token refresh with
`invalid_grant`, the current enrollment automatically opens a new isolated
Google sign-in. The official Antigravity session stays signed in.
Saved credentials alone do not mean an account is already added: that status
requires matching saved identity and membership in an existing workspace. A
saved login left after removing its final membership can be verified and selected
again; final confirmation reuses its saved profile ID and restores membership.
That confirmed re-enrollment replaces the removed profile's old label with the
newly verified Google label. Ordinary quota refresh and explicit account editing
keep their current behavior. Five-hour usage precedes weekly within each model
family, independent of the order returned by Google's endpoints.
The
agent uses `oauth-personal` and owns OAuth state, PKCE and its loopback callback.
A private browser helper passes the authorization URL as data; Orbilap validates
Google's exact HTTPS origin/path, unique state/code-flow parameters, and a local
127.0.0.1 callback before showing/opening it. Secrets and raw agent errors are
never returned through IPC or printed. Agent output lines and queues are bounded.

The client initializes, checks agent identity/version and completes OAuth.
It stages the isolated credentials after the agent confirms authentication.
It advertises no file/terminal capabilities and rejects agent requests.
Completion and cancellation kill/reap the process group.
The enrollment transaction verifies Google identity, paid plan and live usage
before final workspace confirmation. Draft credentials are private and
removed on cancellation/discard. Saved accounts use Orbilap's existing private
refresh-token store; existing accounts and explicit AGY activation remain supported.
No credentials/session file-import option is added.

Quota refresh merges measured buckets from the daily and production Cloud Code
`retrieveUserQuotaSummary` endpoints; if neither returns usable measurements it
tries `fetchAvailableModels`. Cards also request the model catalog in parallel
with the summary to list the current Gemini models available to the account. The
card uses catalog display names and summary group names supplied by Google.
When the summary has no measured Gemini limits, the card uses measured model
limits and keeps each reported model name.
Partner limits are hidden on the card and shared Gemini limits stay shared.
Duplicate windows keep the most-used reading.
Flat/grouped summaries, disabled buckets, independent Gemini/shared Claude-GPT
windows and legacy model quotas are handled. Unknown usage is an error, never
zero. These internal APIs expose Antigravity allowance, not AI-credit balances
or Gemini Apps chat limits, and can change independently of Orbilap.

Saved-account usage reads run concurrently across accounts. A per-account lock
still serializes token refresh for the same saved account, while repository
mutations (including removal and credential replacement) wait for current usage
reads to finish. Listing metadata shares read access with usage requests. A
shared HTTP connection pool reuses Google connections; bearer tokens remain
request-scoped. Active-account detection reuses a successful Google identity
verification for up to 60 seconds only when a SHA-256 fingerprint of the exact
shared credentials is unchanged. Changed credentials, expired cache entries and
verification failures never reuse a previous identity. Usage measurements are
still fetched live. For saved accounts with a known project, identity, paid-plan,
usage and model requests overlap after any required token refresh. Usage is
returned only after both verification checks succeed. A changed project forces
a new usage read against the verified project; legacy profiles without a project
are verified before usage is requested. Enrollment and activation retain their
verification requirements.

## Verification

### Subscription date limitation

Subscription dates must require no extra user sign-in or manual check. The
verified `loadCodeAssist` responses inspected on production and daily endpoints
include plan metadata without a subscription end or next-payment date. Sending
the existing Antigravity access token to Google One settings without web cookies
redirected to `accounts.google.com`; this token did not authenticate that web
session. Sharing a Google account does not establish shared billing access.
The observed signed-in partner-provided Google AI Pro membership page also did
not display a billing date. No date is inferred from token expiry, usage resets
or the plan label. Keep missing dates hidden. Do not add a separate Google One
login flow to work around the missing metadata.

[Google's membership management guide](https://support.google.com/gemini/answer/14517446)
describes the user-facing Google One route; it does not establish an automatic
billing API accessible with the Antigravity token. Automatic retrieval without
additional user work remains unimplemented pending a verified data source.

Unit fixtures cover ACP initialization and authentication, private credential
staging, cancellation/child cleanup, literal browser arguments, link validation,
runtime tampering and quota parsing/merging. The opt-in
`antigravity_acp::tests::live_official_google_sign_in` exercises the official
runtime and real Google access using a disposable draft. An optional
`ORBILAP_ACP_TEST_PROFILE` selects an existing Orbilap profile for saved-login reuse;
otherwise it requires browser sign-in. `ORBILAP_ACP_TEST_AUTH_URL_FILE` is a local
handoff file for the validated authorization URL, never tokens/callback codes.
It does not commit a permanent account or change the shared AGY login.

Sources: [T3 release manifest](https://github.com/pingdotgg/t3code/blob/322f6544dfad/apps/server/src/provider/antigravityRelease.ts),
[official agent integration](https://github.com/pingdotgg/t3code/blob/322f6544dfad/apps/server/src/provider/acp/AntigravityAcpSupport.ts),
[quota reader](https://github.com/pingdotgg/t3code/blob/322f6544dfad/apps/server/src/provider/antigravityUsageLimits.ts).

The unmodified icon in `src/assets/antigravity.svg` is Google's
[full-color press asset](https://antigravity.google/assets/image/brand/antigravity-icon__full-color.svg),
distributed through its [press page](https://antigravity.google/press).

## Saved-account refresh deadlines

Account-card and menu-bar usage share one 12-second deadline, including waiting
for repository/account locks, token renewal, identity and paid-plan verification,
parallel quota/model reads, fallback requests and a changed-project retry.
Concurrent reads of one account remain serialized to protect token rotation.
An overlapping refresh waits within its own budget. Different accounts can still
fetch in parallel. Manual sign-in retains its existing timeout.

Panel IPC reads for Antigravity usage, CLI status and saved Codex profiles have
a 15-second response limit. Late responses cannot replace an already timed-out
UI result. A timed-out native metadata read can finish in the background.
The existing error surfaces release loading states without adding another spinner.

The overall home Refresh cycle also has a 15-second watchdog, starting before
settings are read. Expiry releases the button, reports through the existing
toaster and invalidates pending settings/profile/provider generations. A later
reply cannot overwrite a newer refresh. The timer is cleared on completion,
replacement or unmount. A stalled-settings regression proves the button re-enables
at the deadline and ignores the old reply.
