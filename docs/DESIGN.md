# Panel design

## Current system

The DMG installer uses a fixed white background with soft orbital arcs in
opposite corners, dark text and a black transfer arrow. Keep native
label areas clear and light so Finder's Orbilap and Applications labels remain
readable in both OS appearances. Inset the macOS requirement by 56px from the
artwork's bottom edge to leave breathing room in Finder. Keep the
editable HTML and rendered PNG in `packaging/dmg/` synchronized. Finder owns
the icon labels, selection, keyboard and drag behavior; do not paint duplicate
labels into the background. This static artwork adds no motion.

Project-owned theme tokens use the `--orbilap-` namespace and the final
appearance layer is `src/orbilap.css`. Keep CSS consumers, JavaScript motion
lookups and preview imports in sync. This naming cleanup preserves all token
values, geometry, focus, pointer feedback and reduced-motion behavior.

Light theme controls use distinct neutral fills: secondary buttons #dadada,
inset fields and circular controls #dedede, hover/press accent #cecece and
edges #c8c8c8. Segmented tabs use a #d2d2d2 track with an opaque white
selection so both remain visible on translucent sheets. Apply these shared
Orbilap tokens across home and dialogs; dark tokens are unchanged. Preserve
disabled opacity, focus, pointer and reduced-motion behavior; add no motion.

The home sort control shares the top row with the leading provider heading.
While a skeleton, retry action, or collapsed provider group leads the list,
give the sort control its own right-aligned row above it. Keep the existing
shared control, focus and motion behavior.

The Add account final review reuses the same individual account cards as
workspace discovery and added-account lists: shared spacing between cards,
leading checkbox and provider mark, name/plan/Active row and wrapping email.
Do not wrap those cards in a second inset list or override their size, material,
badge or logo geometry. Selection uses the shared iris layer; preserve checkbox
focus, busy locks, pointer and reduced-motion feedback. This correction adds no motion.

Home card exits measure their painted position after the confirmation sheet
closes. Ignore sheet/focus scroll during that wait and unrelated scrollers during
the exit. Restore dialog focus without scrolling; deliberate scrolling of the
account viewport still cancels the painted exit. Preserve immediate keyboard and
reduced-motion removal and the existing particle timing in both themes. Keep
loaded Codex cards mounted after removing workspace membership so the surviving
cards can move from their original positions while usage refreshes.

Every workspace card has a shared circular Delete workspace button beside its
selection control. The current card also has Rename. Keep creation alone in the
picker footer. Both management actions
use the existing workspace control colors and shared icon-sm geometry.
Confirm deletion in the shared account-removal dialog pattern: workspace mark,
wrapping name and short consequence, then the action row. Focus Cancel first
and keep Cancel beside Delete workspace in the shared action-row. Lock dismissal and actions during deletion,
keep errors retryable, and return focus to the workspace picker on cancellation. Close the picker before
opening confirmation so the shared dialog keeps its normal modal layer.
Arrow keys reach the delete action on other workspace cards and move between
the confirmation choices, while keeping the app's existing Tab behavior.
Reuse shared dialog/button motion, pointer gating and reduced-motion behavior.
Deleting an inactive workspace leaves the current workspace selected. Deleting
the active workspace opens the first remaining workspace, or returns to setup
if none remain. Neither action switches provider credentials.

Only added-account cards in the workspace creation wizard’s Add step use 2px
vertical padding and a 44px minimum height for compact two-line identities.
Discovery and other added-account surfaces retain their existing spacing. Preserve horizontal spacing, wrapping,
selection targets and shared feedback; this spacing change adds no motion.

Codex cards offer the shared circular Switch action for every connected inactive
account, including a lone workspace account when the live Codex login was skipped
during setup or belongs elsewhere. Only the actual provider login establishes
Active. Keep busy, missing-client and configuration-error locks, reconnect
behavior, keyboard focus and existing pointer/reduced-motion rules; add no motion.

Added-account cards keep their subscription badge immediately beside the name,
including the final workspace review. Discovery and added cards reuse the home
card surface, radius, spacing and identity typography. Emails wrap at tray width.
Keep existing selection, focus, pointer and reduced-motion behavior; add no motion.

Workspace setup clips horizontal overflow at its scroll viewport while retaining
vertical scrolling. The existing 190ms page entrance stays inside that viewport,
so changing steps cannot flash a horizontal scrollbar. Keep the existing instant
keyboard and reduced-motion behavior and the inset for focus outlines.

File import has one persistent primary action. Its label changes from Verify
account(s) to Verifying… and then Continue with the verified account count.
Keep it locked throughout verification, including partial results; never show
a second Continue action while verification is running. Saving uses the same
button. Preserve retry/error recovery, focus and shared spinner/reduced-motion
behavior; the label changes immediately without new motion.

Disabled and busy shared Buttons use muted foreground on the secondary fill
with 72% opacity in both themes, keeping them distinct from enabled actions
while preserving readable variant-independent ink. Ghost
and link variants stay transparent. Reuse this shared state for Save, setup,
imports and account actions, preserving native disabled locks, aria-disabled
behavior, focus, pointer gating and reduced motion. This color correction adds
no motion.

Discovery and file-import subscription badges share the home card's compact
10px/14px neutral pill, with 1px/5px padding and no tier-colored rim. Keep the
badge beside the account name. Center discovery checkboxes/provider marks and
file-import status icons/removal buttons vertically against their full row,
including wrapped identities and verification errors. Keep shared circular
buttons, focus, busy locks, pointer and reduced-motion behavior. This static
alignment change adds no motion.

The Add account invitation keeps its existing decorative illustration even when
accounts were selected in the preceding Load accounts step. Hide it after manual
additions are shown. Position the invitation 24px below the step indicator
instead of centering it vertically. Account discovery and refresh show only the shared spinner
and verification status, without decorative account cards. Preserve existing
focus, pointer and reduced-motion behavior; add no new animation.

Initial workspace setup reserves the shared action-footer inset below Next and
Create workspace. Its home container has no bottom padding, so the footer owns
that spacing. Setup inside a dialog uses the dialog's existing bottom inset.
This static spacing correction adds no motion or control overrides.

Workspace setup and provider setup use the shared `SetupSteps` ordered list.
Show a numbered 32px circle above each short stage label, with a fine connected
track. The current circle has a quiet inset highlight and outer ring; completed
stages use the primary fill and a check. Upcoming labels retain readable muted
ink. Use home semantic tokens in both themes, keep the stepper non-interactive,
and expose the current item with `aria-current="step"`. At tray width all stages
stay in one row; labels may wrap. Pointer step changes move only the track with
the shared 180ms ease-out transition. Keyboard and reduced motion update instantly.


Add account checks local logins in the background, with a screen-reader status.
Show the On this Mac section, refresh control and alternate sign-in label only
when at least one verified account can be added. On error, keep sign-in methods
available and offer the shared Retry button. No new motion is added.

Loading placeholders reuse the loaded account card, quota row and banked
reset layouts at tray width. Use SkeletonText inside the final typography slots,
the existing track classes for bars and the shared Button variants for control
shapes. Placeholders stay decorative and non-interactive. Announce loading
once per region and use the shared opacity pulse, which is static under reduced
motion. Use known account counts when available. The account count and quota
layout can change when the provider returns its data.

Pending sign-in uses short Cancel and Open labels in the shared action
row. Below it, Device limit has a circular information button opening the shared
nested help dialog; Copy link stays visible beside it. Escape closes the help
and returns focus to its information button. Reuse existing dialog and button
motion, keyboard, pointer and reduced-motion behavior.

Labeled action buttons use a leading, action-specific Neat Icon throughout the
app, including retries, verification, sign-in, import, save, create and switching.
Use the same glyph for the same action and 16px glyphs for compact text actions;
retain existing context-specific sizes and busy indicators. Cancel, Cancel sign-in,
Cancel restart, Keep editing and Skip this version stay text-only and neutral.
Provider/account choices retain their existing logos. Reuse shared Button controls,
horizontal action rows and existing focus, busy, pointer and reduced-motion rules.
This consistency change adds no animation.

Expired file imports keep the file name and sign-in status in one text stack,
with Renew beside it using the shared small primary Button. Center Renew and
the circular remove action against the full row; do not reserve a separate
button row or add local control overrides. Long identities and status text wrap
within the remaining space at tray width. Preserve its
accessible file name, busy lock and shared focus/pointer/reduced-motion feedback.
This static spacing and control correction adds no motion.

All icon-only actions are fully circular across home, dialogs, sorting and
notifications: equal width/height with `border-radius: 50%`, including hover and
pressed layers. Use shared Button icon sizes; never use rounded squares. Keep
existing accessible names, focus, busy/disabled and reduced-motion behavior.
This geometry correction adds no motion.

Action/cancel pairs use the shared horizontal `action-row` at tray width. Put
Cancel or Keep editing first and the primary/destructive action second. Match
height, typography and corner radius, wrapping long labels within each button.
Cancellation is neutral; destructive actions retain red. Sign-in recovery help
stays below the action row, with Copy link beside the Device limit info action. Preserve safe
initial focus, busy locks, focus return and existing pointer/reduced-motion
feedback. This layout change adds no motion.

The account editor uses Save for its name-submit action and retains its existing
save icon, busy label and shared button behavior. This copy change adds no motion.

Menu bar → Appearance uses one settings card. Give the clearly labeled sample
of the native menu bar enough room to show the whole composition in a full-width
pill with fully rounded ends. Keep its icon, optional logo,
initials and usage in one non-wrapping horizontal row, including when logos
and initials are both off. Do not use a content-sized capsule. Put it above
the shared Orbilap radio rows for display format, then use three
matching switch rows for the app logo, provider logos and account initials.
Show app logo defaults on for existing and new workspaces. Hiding it removes
both its mark and reserved space in every native style. Keep the app mark as
the access target when no usage renders and explain that fallback below the
switch. The sample
combines format and identity in one place, uses the tray masks and reflects the
workspace's used/remaining preference. It stays available with example initials
when no provider is active. Give each format a short description and make the
whole row clickable. Allow Up/Down to move between radio options. Keep controls
focused while saving and avoid overlapping hit areas at tray width. Reuse
existing switch feedback; the sample and radio selection add no motion.

Banked resets use the shared small Button and 16px action icons. Reserve width
for its changing label. Use changes to Confirm with a leading
check and primary treatment. Pointer activation briefly fades and settles the
label. Keyboard and reduced motion switch immediately. Only a separate
activation of Confirm applies the reset. Primary mouse-down preserves button
focus in WebKit so Confirm survives until click. Moving focus away clears confirmation.
Show Applying and Done in the same button, then close the editor and refresh
the account card. Retry keeps the original token if the result is unknown.

The current workspace shares the home active card's green surface, inset edge,
shadow and title style. Rename is a round icon button with an accessible label
and shared tooltip. Keep 12px between the name row and the 32px Cancel and Save
buttons. Disabled Save uses muted ink on a neutral surface in both themes.
Keep the keyboard focus ring and existing reduced motion behavior.

GPT's menu-bar/settings mask is rendered from the original vector at high
resolution, alpha-cropped and downsampled once with high-quality interpolation.
Never enlarge the small display bitmap. The debug-only Claude preview has clearly
named synthetic accounts and never establishes real account or usage state.
This asset correction adds no motion; reuse existing controls and focus rules.

Menu-bar providers use one shared settings group with divider-separated rows.
Use an 18px normalized monochrome provider mark, a name/account text stack and
the shared switch on the right. Limits are unboxed 32px checkbox rows aligned
below the identity. Group Antigravity limits by Carbon, Argon, shared Gemini,
then other models, showing each model once in a narrow shared column next to
its period choices. Center the model label on the first checkbox row so wrapped
choices remain aligned. This spacing change adds no motion.
Full provider window keys remain in accessible names and saved preferences.
Remove repeated visible account/limit headings and explanatory text. Appearance
includes Show provider logos: explicit on/off works for one or multiple providers;
missing legacy preferences retain automatic logos for multiple providers.
Use the same normalized alpha masks in Settings and native tray rendering.
Reuse checkbox/switch feedback; keyboard and reduced motion remain immediate.

Sheet navigation uses one compact header: an icon-only Back action when needed,
the provider mark (or workspace/add symbol), one active-step title and Close.
Enrollment steps register their title/back action in the enclosing AppModal;
do not add another title, provider caption, instruction paragraph or text Back
row in the body. Profile screens use the same header. Workspace creation moves
Back out of the footer and uses three quiet progress strokes instead of labeled
step circles. Keep meaningful field labels, sign-in status, recovery help and
consequence warnings. Preserve cancellable navigation during background discovery,
block Back during sign-in/import mutations, preserve drafts between wizard steps,
and retain dirty-draft confirmation for profile navigation. Focus the active
heading after navigation, preserving the initial workspace-name input focus.
Reuse Orbilap's neutral material, Neat Icons and existing dialog/hover presence;
keyboard actions and reduced motion stay immediate. No new motion is added.

Antigravity's shared Gemini limits use Gemini rather than Gemini Models in card
labels and reset tooltips. This text correction adds no motion or controls.

Antigravity's featured card labels combine the short model name and limit on one
line, such as Carbon · Weekly and Argon · Weekly. Omit the Gemini 4 prefix and
separate model headings. Reuse the shared label, percentage and meter spacing so
equivalent provider cards have the same height. Retain full model names in the
accessible usage group, model ordering and Additional limits. This static layout
change adds no motion; preserve reset-tooltip focus and pointer behavior.

Account enrollment uses compact provider and sign-in cards with distinct browser,
device, file and folder icons. Keep descriptions to one short line. Empty local
discovery adds no separate section; retain its busy state and retry on errors.
Move the device-limit workaround into a disclosure. Account settings show the
provider mark and identity above the name form. All account/profile removals use
the shared nested confirmation with only provider/account identity, Remove and
Cancel. Omit scope choices and explanatory copy. Workspace removal affects only
the current workspace; standalone profile removal retains its existing behavior.
Use the identity as the accessible description. Focus Cancel on open and restore
the opener on cancellation. Lock actions and dismissal while busy. Reuse Orbilap
controls, popup presence, keyboard and reduced-motion behavior; add no motion.

Menu-bar settings support selecting Codex, Claude and Antigravity together.
Each provider follows only its live member account, with independent visible
limits. Keep provider order Codex, Claude, Antigravity in every style and across
refreshes. When more than one provider renders, place its 14pt monochrome logo
before its initials and limits. Reuse the existing provider artwork; warning
colors apply only to that provider's group, while the Orbilap mark reflects the
highest warning. A single provider retains the compact existing layout.
Selecting no providers hides usage without changing the workspace's master toggle.
Legacy single-provider preferences keep their selection. Use shared provider switches, limit
checkboxes and the home material, preserving focus, keyboard, pointer and reduced
motion behavior at tray width. Static metric updates add no motion.

Antigravity card refresh publishes the same verified usage to the native menu bar
before returning the card response. Keep current menu-bar limits visible while
refreshing the same login; Codex name refresh must not clear another provider.
Account/workspace changes still reject previous in-flight readings. Reuse the
existing labels and metrics; this synchronization adds no controls or motion.

Antigravity menu-bar labels always include their model/family abbreviations:
Ca for Carbon, Ar for Argon and Ge for shared Gemini, in every tray style.
Follow with Codex's compact cadence (5h, 1w, 1mo) when known. Other models retain
their short name without Gemini and its version. Keep full names in settings.
Labels stay distinct during usage outages, including unique periods. This static
text correction adds no motion or controls.
Read Antigravity models left to right as Carbon, Argon, shared Gemini, then other
models; within each model, put 5-hour before weekly and monthly. Text and all
graphical menu-bar styles share this order regardless of selection order.

Menu-bar source selection shows the chosen provider's active workspace account as
read-only text for Codex, Claude and Antigravity. Never offer an account picker or
use a saved default when the provider has no active member account. Antigravity's
visible limit choices come from the same measured limits rendered on the account
card, including Additional limits. Catalog-only models are excluded. For each
enabled provider, show the shared loading ring with a provider-specific status
label while its active account's limits load. Show the limit checkboxes when
that provider's request settles.
Reuse shared checkbox focus, pointer and reduced-motion behavior.

Subscription dates must use the account's existing connection without an extra
sign-in, browser-connection step or Check subscription date action. Show no date
row or unavailable placeholder when the existing connection supplies no verified
date. A next-payment date means renewal, not expiry. Keep this distinction if a
provider supplies billing metadata in the future.

Antigravity shows Carbon and Argon on the card when
available. One model uses the full width. Both use two equal columns, with
Carbon first. Use the shared usage meters and reset tooltips. Additional limits
holds other reported model limits and shared Gemini limits when Carbon or Argon
is available. When neither is available, show the remaining reported limits
directly on the card without an Additional limits disclosure. Omit the catalog
text listing available models.
Reuse the disclosure’s keyboard, pointer and reduced-motion behavior.

Account deadlines default to remaining time, using compact two-unit labels such as
“5d 17h left”. Past deadlines say “1d 2h past deadline” and retain the shared red
metadata treatment. Remove the standalone Update payment text. Confirmed overdue
payment still uses the provider's grace deadline instead of the later plan date;
its context and last successful check remain in the shared tooltip. Unknown grace
deadlines stay explicitly unavailable. Passing a date never establishes lost access.

General settings adds Account deadlines (Time remaining / Date & time) and Time
format (24-hour / AM/PM) using the existing Orbilap segmented controls. Show Time
format only in Date & time mode and retain the saved format when switching modes. Defaults are
Time remaining and 24-hour for new and legacy preferences. Persist both as validated
frontend display preferences and update all cards immediately. Date mode omits the
year on cards; full tooltips retain the year. Clock format applies consistently to
account deadlines, reset tooltips/notices and last-refreshed time. Reuse existing
focus, pointer and reduced-motion behavior. Shared segment feedback stays immediate
for keyboard input; ticking deadline text adds no motion or live announcements.

Banked reset actions use the available credit's status, plan support and expiry.
Usage summary counts and consumption percentages do not prevent review or
redemption; the server determines the outcome after explicit confirmation.
Unavailable credits show their reason beneath the card, linked to the action's
accessible description. Reuse shared controls and focus behavior at tray width;
this static correction adds no motion.

Account lists keep saved accounts after their billing date. Only provider-confirmed
ended subscription access permits automatic hiding or cleanup. Unknown state,
expired sign-in sessions and temporary usage limits retain the account. Billing
dates remain visible for reference and sorting. This data correction adds no motion;
reuse the home controls, focus, pointer and reduced-motion behavior.

Menu-bar usage displays the 5-hour limit before weekly, then monthly, within each
Antigravity model or across the other providers' limits, regardless of saved
selection order. Text and all metric styles share this order.
This static ordering adds no motion or controls.

On pointer dismissal, Possible reset and successfully removed home account cards
break into a dense cloud of fine particles over 1160ms. A soft CSS gradient and
clip travel left to right. Dust releases in small clouds and swirls upward near
the card as it fades.
Keep particle contrast low in both themes so the
denser cloud fades without a flash. The list holds the old positions until the painted card has dissolved (763ms),
then closes the gap in 150ms using transform keyframes and the shared easing. The last particles fade after the list settles.
For account removal, start after the confirmation sheet closes. The painted exit
is inert, and focus moves to a surviving control. Keyboard input and reduced
motion remove the surface immediately. Background refresh, expiry and failed
removal never trigger the effect.

All red destructive actions, including profile links, imported-file removal and
the home Quit icon, use one painted background with no border or pseudo-element hover layers.
Red background strength rises from 9% (0% for links and home Quit) to 16% on
fine-pointer hover and 22% on press. Text and icons retain full opacity; no scaling
or gray edge. Use a subtle 160ms ease background-color transition. Disabled
controls remain inert; keyboard and reduced-motion feedback stays immediate
through the shared modality rules. Preserve focus behavior and tray-width controls.

### Interface writing

Use sentence case for headings, actions, tooltips and accessible names: Add account,
Banked resets and Menu bar. Preserve brand names (Orbilap, ChatGPT, Claude Code,
OpenCode), acronyms (CLI, API) and literal file/command names (auth.json).
Camel case is for code identifiers, not interface labels. Use account for a login,
workspace for its grouping, sign in for the action and sign-in as a modifier.
Use usage/usage limits in user-facing messages; reserve quota for implementation.
Keep actions specific, use an ellipsis for ongoing work and give errors a recovery
step where known. Explain destructive scope and distinguish removing a saved
login from signing out. Instructions must match current behavior: Codex switching
starts immediately and asks before closing a running thread; do not promise a
30-second grace period. Keep copy compact at tray width and reuse all existing
focus, pointer and reduced-motion behavior. These copy edits add no motion.


Updates omits the inline status area, including “Keep Orbilap up to date.” and
all phase messages. Report manual checking, results, download and installation
status through shared Sonner notifications. Keep download progress, release notes
and explicit download/install actions. Check updates uses Orbilap’s Neat Icons
Search glyph; busy actions retain the shared ring. Preserve tray-width controls,
keyboard focus, pointer and reduced-motion behavior with no new motion.

Updates omits the daily-check explanatory footer below Automatic updates.
Keep the existing controls, keyboard focus, pointer and reduced-motion behavior.

Updates uses the home card action material, foreground and hover feedback for
the labeled Check updates action, with pill corners and a search icon
below the app identity and installed version in a vertical layout. Show the
Orbilap tagline in the identity row using the existing muted copy style. Let it
wrap at tray width. Keep the accessible name Check
for updates. Show checking feedback through Sonner; use the shared ring in
the busy button. Download update and Install & relaunch remain separate explicit
actions with download and refresh icons. Reuse shared focus, pointer and reduced
motion behavior; no new motion. Keep update actions full width at tray widths.

Updates reports check, download and installation errors only through Sonner.
After failure, retain the Check for updates retry action;
do not repeat error text or danger styling in the update card. Existing focus,
pointer and reduced-motion behavior remains unchanged; no new motion.

Provider reset notices use the home card material, radius, shadow and insets.
Keep reset status colors inside the icon and probability pill, with a neutral
circular dismiss control. Preserve forecast timing, dismissal and polling.
This static styling introduces no additional motion.

Home account cards omit the exhausted-limit footer, including its divider,
“Limit reached” label and quick-switch action. Usage meters retain their limit
state and reset details; account switching remains in the card header.

The home header Settings action uses Neat Icons sharp-stroke Settings at 18px with the
shared 1.5 stroke. Keep the existing accessible name, tooltip, hit target,
keyboard focus, pointer and reduced-motion behavior. This static swap adds no motion.

Sonner notifications float 16px below the top edge, centered with at least 16px
side insets and a 440px maximum width. All notification types use the shared neutral popover material and foreground
in light and dark mode. Keep status color confined to the icon: success uses
the green home signal tone, errors the danger tone, warnings amber and information
blue. Avoid tinted backgrounds and status-colored body text. Use the shared 16px Orbilap radius on all
corners. Retain Sonner focus, dismissal, pointer and reduced-motion behavior.

All operational and validation errors use the shared Sonner notifications. Remove
inline error boxes and the duplicate persistent home banner. Keep retry, reconnect,
invalid-input state and account recovery controls in their original surfaces.
File import notifications identify the file; rows retain a short verification
status. Error notifications deduplicate by message and dismiss when their error
state clears. Reuse Sonner’s existing focus, pointer and reduced-motion behavior.

Checkbox selection includes the square and its associated text through native
labels. Enabled unchecked choices use 60% opacity, increasing to 85% on fine-pointer
hover or keyboard focus. Checked and pressed choices use 100% opacity, including
while hovered. Captions use the shared foreground (white in dark mode, dark in
light mode); selected squares retain the shared primary fill and contrasting tick.
Use a subtle 160ms ease opacity transition with immediate keyboard/reduced-motion
feedback. No hover ring, hover color change or press scaling. Disabled choices
remain inert. Preserve descriptions, selection motion and native keyboard focus;
menu-bar previews stay outside the associated label.

Sort direction retains one down-arrow SVG and rotates it 180 degrees for
descending order over the shared 180ms UI duration/ease-in-out curve. CSS
transitions reverse from their current frame on rapid clicks. Keyboard and
reduced-motion changes are immediate; hit targets and sorting remain unchanged.

Checkbox pointer selection uses a shared 280ms ease-out opacity/scale transition
with persistent check layers so rapid reversal stays continuous. Checkbox label
weight changes from 500 to 650 over the same duration; descriptions/badges retain
their weight. Apply to settings, account enrollment and legacy profile choices.
Keyboard input stays immediate; reduced motion removes scale and weight motion.

Usage display choices are compact 92px cards with 12px insets, a sample
percentage, 4px meter and Remaining/Used label plus selection check. Remove
capacity subtitles and the explanation below the cards. Keep radio labels,
keyboard/pointer selection and reduced-motion behavior unchanged.

Home hides its account-list scrollbar while retaining native scrolling, keyboard
focus and existing reduced-motion behavior. Other scrollable surfaces share thin native scrollbars in both axes: a 6px rail
with a rounded 4px painted thumb and transparent track/corner in WebKit, and
standard thin scrollbars elsewhere. Use theme-neutral thumb tokens with stronger
hover/drag colors; hover applies only on fine pointers. Keep the hidden-scrollbar exception scoped to the home account viewport. Retain native scrolling and dragging with no scrollbar animation.

Shared tooltips require 1200ms of pointer dwell on every control, including
neighbours after an open tooltip (no skip-delay window). Leaving before the delay
cancels opening. Pointer/programmatic focus cannot bypass the delay; only keyboard
focus opens immediately. Route email, names and billing-date hovers through the
shared Tooltip instead of native title attributes. Existing exit/presence and
reduced-motion behavior is preserved.

All modal backdrops, including workspace selection and nested confirmations, use
a shared 60% black scrim with a static 7px backdrop blur in both themes. Keep
existing opacity presence, keyboard, reduced-motion and dismissal behavior.
Settings sizes naturally to the active tab content, capped by the available panel
height with 12px top/bottom insets. Do not stretch the body to fill empty space.
Keep overflow available for short windows and long content; no height animation.
Settings uses 12px bottom padding to keep the content close to the sheet edge.

Banked Reset uses the shared layers icon across sorting, credit confirmation
and banked-credit announcements. Refresh actions and ordinary scheduled reset
markers keep their action-specific icons. Preserve existing sizes and behavior.

Sort uses a checked circle for Active first, layers for Banked resets and a pie
chart for Remaining capacity. Keep calendar, clock and type for expiry, availability
and name. Match the selected icon in the trigger; its chevron is 10px, including
the SVG inside the wrapper, with the existing hit target.

Sort popover option icons and its selected checkmark use a lighter 1.5 stroke
weight. Preserve sizes, hit areas, focus, pointer and reduced-motion behavior;
this static treatment adds no motion.

Home header glyphs use a lighter 1.5 stroke weight. Keep their existing sizes,
button hit areas, focus, pointer feedback and reduced-motion behavior. This
static treatment applies to header actions and the workspace chevron only.

The native menu-bar mark and usage metrics use #1c1c1c ink, matching dark home
account cards, by default, including
unavailable samples. Only enabled Near limit warnings may apply a status color.
This static color change adds no motion or changes to panel controls.

Home accounts keep 20px bottom padding inside the scrolling viewport, so the
last card clears the panel edge when scrolled to the end. Root bottom padding
remains zero. This static spacing applies at all tray widths without new motion.

Shared Orbilap appearance layer: `src/orbilap.css` maps the owner-supplied
portable palette and composed geometry onto Orbilap's shared controls.
Original source provenance remains in Git history before the namespace cleanup. It is the final
appearance layer: neutral light/dark surfaces, system UI font, 23px account
cards, 16px settings groups, 28px translucent sheets,
pill segments and neutral circular dismiss controls. Existing account identities,
status colors, persistence, modality and popup lifecycles are retained. This
supersedes earlier palette, geometry and font choices below. Tab suppression,
context-menu policy and editable text selection remain unchanged.
Active account cards retain Orbilap’s green surface, inset edge, monogram and
Active/plan badges in both themes. Inactive cards retain Orbilap’s neutral
material. Usage sits directly on both card surfaces without a separate fill or
inset. Home account and workspace monograms and icon actions use their previous
circular shape. This static change preserves focus, pointer, and reduced-motion
behavior. Disconnected warnings take precedence.

Disable the WebKit context menu throughout the app, including dialogs and inputs.
App chrome and informational text cannot be selected. Inputs, textareas and
editable content retain native text selection and keyboard editing. Keep the
existing copy buttons, pointer actions, keyboard focus and reduced-motion behavior.
This global interaction policy adds no motion.

Home sizing update: use a 46px workspace monogram with 19px initials and an
18px workspace name in the header. Provider names are 17px (16px below 380px), and marks are 32px (28px below 380px).
Account monograms are 44px with 16px initials. Card actions are 36px circles
with 17px glyphs. Sort uses a 29px pill with 14px icons, tighter insets and a compact menu,
with 12px trigger text, 11px option labels and 10px hints. Center the Sort pill
vertically within the first provider’s shared 35px heading row.
Show the Sort trigger focus outline only for keyboard input.
Card usage percentages use 19px type with a 24px line height.
These dimensions supersede the earlier size values below. Preserve existing
pointer, programmatic focus, Tab suppression and reduced-motion behavior; no
new layout animation.


The workspace reference uses a near-black canvas, circular monograms and
toolbar controls, and large rounded cards with a quiet border. The Add control
is white in dark mode. Active accounts use a muted green card, avatar and
status pill. Light mode uses the same layout with a pale green active card.
Other app surfaces use the shared neutral material and existing shadcn controls.
Use Neat Icons for all interface glyphs. Product marks use original provider assets.

Use 20px top window padding (12px at widths up to 380px) and zero bottom padding on home.
Other root surfaces use 16px top padding. At the 430px tray width, use a 15px horizontal inset, 10px card gaps, 20px provider
gaps, 23px card corners, a 52px workspace monogram, 40px account monograms,
and 44px circular More and Switch buttons. Use 36px toolbar action buttons.
Keep the toolbar fixed and the cards
scrollable. Show the subscription expiry under the account name and retain
the account email for assistive technology and on pointer hover. When no
expiry is known, show the email under the name. At tray width, use 12px for the
Workspace caption, 19px for the workspace name, 20px for provider names with 28px marks, and
15px for account names. Usage columns sit directly on the card with the five-hour
limit before weekly, 11px labels and units, 22px tabular percentages and a quiet reset marker.
Keep the bars neutral and reserve status color for exhausted limits and
pending reset markers.

Where multiple accounts can be activated, place the More button to the left of
the Switch button. Use opposed arrows for Switch and show it only on inactive
accounts. The Active badge identifies the current account. During a switch,
the button shows the shared ring spinner with the readable shared disabled colors
and keeps its usual pointer cursor and keyboard focus.
Reduced motion uses the static ring. Use the same spinner for pending sign-in,
account counts, and other loading states. More opens one account settings dialog
with the name form, Banked Reset when credits are available, and account removal
last. The reset count uses the theme's control fill and text colors. Use a solid
hover fill that eases over 160ms on fine pointers,
immediate keyboard focus and no transitions under reduced motion. Keep cards
still on hover.

Antigravity uses the shared plan badge with short Google plan names.
Show Plus, Pro, or Ultra and preserve any reported trial or Ultra variant.
The badge uses the plan's tier without inferring a price or an Ultra variant.

Additional limits uses a transparent trigger and shares the provider count badge.
Pending provider counts show the shared spinner inside the badge. Pointer activation expands
and fades the content over 200ms with the shared ease-out curve. The grid track
follows the content height and reverses on repeated clicks. Keyboard activation
and reduced motion use an immediate disclosure with visible keyboard focus.
As the content expands, follow its painted height and scroll only as far as
needed to reveal the limits on the same timeline, without a second scroll animation. Keyboard
activation and reduced motion reveal them immediately. Collapsed content is
inert and hidden from assistive technology.

Usage cards put the five-hour window before weekly, including providers reporting
the short `5h` label. Antigravity keeps model families grouped, with session then
weekly inside each family. Re-enrolling a removed Antigravity account saves its
freshly verified Google name instead of reviving the previous saved/test label.
Existing account Edit remains explicit; background refresh does not rename it.
Reuse the same static meters and focus/pointer behavior; no new motion.

Use Google's unmodified full-color Antigravity press icon. No Experimental badge
or explanatory paragraphs under its provider heading or provider-selection label.
Antigravity auto-switch in Usage settings reuses Codex's setting rows,
threshold input and account checkboxes. Keep the reopen guidance below the
controls. Preserve shared focus and motion behavior. Disclosure is immediate.

For Claude and Antigravity, show Switch/quick-switch actions only when more than one
account is visible in the current workspace. Codex offers Switch on each connected
inactive card regardless of the workspace account count. Keep editing/reconnection available
for a lone account. Existing actions retain their shared pointer/focus behavior;
no new motion. Clicking Antigravity directly starts adding an account. If any
saved Antigravity account is enrolled in a workspace, start an empty official
agent profile and open Google with explicit account selection. Only when no
saved account remains enrolled can a detached saved login be recovered directly.
No method picker, account-name input, or
extra Continue button. Google supplies name/email; if no valid login exists,
the same flow opens Google. Cancellation returns to providers; failures expose
one Retry connection action, never the removed methods. Do not run duplicate
local discovery alongside the official login check.

Antigravity Google sign-in delegates to Google's pinned official ACP agent in
an isolated draft profile. Keep the existing browser sign-in/cancel controls.
Before an auth URL is ready, explain agent preparation and that the first
verified download may take a few minutes; never imply that a browser already
opened. After authentication, the agent checks access without sending a prompt.
No new motion or controls; focus, pointer and reduced-motion behavior reuse the
existing enrollment surface. No current-AGY or alternative sign-in choice.

The account picker lists ChatGPT / Codex, Claude and Antigravity. Removing
Gemini leaves the shared picker rows and focus behavior in place. No new motion.

Google AI Pro / Ultra coding enrollment uses Antigravity. On macOS, Antigravity
mode can appear inside the Gemini app. Saved Antigravity cards reuse Codex's 44px Switch action,
spinner, static surfaces and existing pointer/reduced-motion feedback. Disable
all switches and account editing while activation is pending. Keep failures
inline with retry and preserve the previous Active marker on failure. Success
marks the selected shared login Active and explains that running Antigravity/AGY
sessions need reopening. Do not restart or close running work automatically.
No new motion or layout transitions.

The native tray panel opens flush with the bottom edge of the menu-bar tray
rectangle, without an extra vertical gap. Position it before showing, retaining
right-edge alignment and monitor bounds. Opening stays immediate.
Clip the full native window surface to a 24-point corner radius on macOS.

Batch login-file verification updates each row as soon as its result arrives:
show the existing success tick or inline error while remaining files continue.
Place the verified account's plan badge beside its name in a wrapping title row;
keep the email below and hide the filename after successful verification.
Keep import, removal and Continue disabled until the batch finishes. Preserve
successful rows across retries and retain the existing final review behavior.
After verification leaves accounts ready to continue, hide Verify and make
Continue the primary action. Show Verify again for newly added unchecked files;
keep retry available when no account verified successfully.

In manual JSON import, Continue with N accounts is a final confirmation: save
verified accounts together with existing selections and return to home on success,
including workspace creation. Keep the file list and inline error on save failure
for retry without reverification. Disable import controls while saving and reuse
shared button feedback and dialog dismissal; add no new motion. Automatic review
after an entirely successful verification batch keeps its existing flow.

Available-account discovery cards reuse the home card surface and quiet static
edge in both themes. Place plan and source badges beside the account name,
using the home badge treatment and wrapping the title row at narrow widths.
Keep email below the title. Show the discovery source (such as Codex app) as
a neutral badge beside plan, reusing the plan badge dimensions. Discovery and
review show the shared Active badge for a verified current provider login.
Keep the whole card unchanged on pointer hover; selection
alone reveals the existing iris layer, with shared checkbox feedback and
keyboard/reduced-motion behavior. Review rows keep their existing inset list.

ChatGPT sign-in opens the official URL in the default browser normally.
The pending screen uses shared Open sign-in page, Copy link and red destructive
Cancel sign-in actions. Beside Copy link, explain that someone seeing
“Device limit reached” can copy the same pending link into a Private or Incognito
window themselves. Keep the pending account unchanged on browser/clipboard
failure. Retry and copying never start another login attempt. Cancellation
returns to the method picker. Reuse existing button, spinner and dialog feedback
without new animation or layout transitions; no browser-control permissions.

Sorting sits at the trailing edge of the first provider heading. The criterion
and direction share a 35px pill with a short separator. Use a solid hover
fill, an immediate focus ring and a visible open state. The right-aligned
Radix Select uses Neat Icons, one short explanation per choice and a checkmark
on the selected item. Keep the control inside the scroll viewport.

The sorting menu opts into a retained WAAPI lifecycle: 180ms opacity and a 3px/
.98 scale transition using shared entry/exit curves. Capture the current painted
state on interruption; cancel cleanup prevents stale completion. Closed content
is aria-hidden and ignores pointers until exit completes. Keyboard changes are
immediate; reduced motion keeps only a 100ms fade. Other Select uses retain their
existing lifecycle.
Keep the usual 20px spacing between provider groups. Persist its validated choice per workspace in local
view storage. Sort saved cards within their provider group by active first
(default), subscription expiry, banked reset count, available soonest, tightest
remaining capacity or account name. An explicit sort does not pin the active
account. Unknown values remain last in either direction; ties preserve membership
order. Available soonest waits for every exhausted main window; stale, failed or
incomplete limits never establish availability. Background refreshes remain still.
Pointer sort changes use interruptible FLIP/WAAPI translation over 240ms with the
shared ease-in-out token, capturing the currently painted positions before a rapid
reverse. Keyboard and reduced-motion sorting are immediate. No mount animation,
no new library and no credential or membership changes.

The rightmost account control is the Switch button. The icon-only Edit action sits
immediately to its left. Both use fixed 44×44px hit targets. A lone account
still offers Edit. Preserve account-specific accessible names and pending
feedback.

Show a short future billing date prefixed by “Exp.” below the name, changing to
“Expiry date passed ·” at the deadline without implying that access has ended. Keep the full
date, year and local time on the time element. Missing and invalid dates
render nothing. OAuth/token expiry never substitutes for the billing date.

Manual Codex JSON import uses a compact file picker and an inset list of up to
20 files. Append selections and Finder drops, skip identical files, and retain
per-file parsing/verification errors without blocking valid accounts. Each row
has its filename, state and independent remove action; after verification show
name, email and plan. Use the existing opaque graphite/porcelain surfaces and
iris controls, with coral for errors and mint checks for success. The transparent, unboxed
Verify action area fills its 44px-high, full-width action area without top padding.
Verify stays in document flow so no opaque wrapper covers rows. Match macOS
WebKit drag coordinates as logical AppKit points; scale physical coordinates on
other platforms. Finder multi-file drags target the whole import section and show a file count
with a 160ms iris opacity layer (100ms in reduced motion); partial success can continue with
verified accounts only into the shared account review before final Add accounts.
Do not animate file-row layout changes. Keep delete focus on a neighboring row
or the list, reuse shared button feedback and disable spinner motion in reduced
motion. Reconnect and single-account replacement retain their one-file flow.

Deleting an account from its last workspace ends its saved alias. On re-enrollment,
read the live Codex profile name before the token fallback and adopt that name on
commit, including when reusing an orphaned login record. Preserve labels for
accounts still in another workspace and for ordinary reconnects. Refresh never
overrides an explicit user-saved account label.

Manual Refresh reads the current Codex profile display name for automatically
named accounts, updating the saved label and initials. Explicit local account
renames are preserved. Name fetch failures leave the last saved name in place;
periodic usage refresh does not fetch profile metadata. Legacy names are treated
as automatic only when they still match the saved login’s inferred name.

Account cards show the saved account name and email. Provider display-name
metadata must not appear as a second name beneath a renamed account. Local
renames remain the identity used for card headings, initials and action labels.

Account initials use the first letter of the first and last name. For a single
name, show its first two letters (or its only letter), skipping punctuation and
emoji. Keep the same rule in account cards, menu-bar settings preview and the
native menu bar. Workspace and provider marks keep their own identity rules.

Saved Codex accounts with missing credentials or rejected/expired sessions use a
static amber inset edge, a key icon with Reconnect needed,
a short recovery note and the shared iris Reconnect action. Keep the monogram
in its standard account style without amber tint. Keep the
identity fully readable. Suppress Active styling, Switch, usage meters and reset
credits until the account is reconnected. Transient network failures keep their
ordinary usage error and do not receive this connection state. Clear the warning
as soon as connected metadata and successful usage return. The card itself has
no hover, pulsing or entrance motion; reuse existing button feedback.

Reconnect shares Switch’s static iris inset fill and edge, 120-degree
hover layer fading over 300ms with ease, and 100ms press at scale .97. Keep
keyboard feedback immediate and use only a 100ms opacity fade in reduced motion.
Both actions use the same CSS rules; Reconnect paints its full 36px target.

Account recovery uses a compact iris-tinted Reconnect button with a static
refresh icon. Open the shared Codex sign-in method chooser directly, with browser,
device-code and auth.json options. Keep the saved account identity visible and
automatically save after verification; reject a different account identity.
After a successful save, dismiss the sheet, show a toast naming the reconnected
account and reveal its refreshed home card. Wait for both dialog exit and quota
placeholders to finish before centering/focusing the card. Use smooth scrolling
for orientation and an instant scroll in reduced motion. Keep failed saves in
the sheet with explicit retry and method-selection actions.
Reuse enrollment rows, dialog presence and shared pointer/reduced-motion feedback.

At the owner's request, Tab and Shift+Tab do nothing throughout the app,
including dialogs, menus and text fields. Capture their keydown/keyup events at
window level before Radix or React handlers so neither browser navigation nor
control-specific behavior runs. Other keys, pointer interaction and programmatic
focus management remain active. Focus draws no outline or extra border. This
supersedes the earlier Tab-navigation and focus-edge decisions below.

Home navigation uses one fixed header above the scrolling account list, with
workspace selection followed by Refresh, Add Account and Settings. Each action
has a fixed 44px target. Add Account is an iris icon button with its accessible
name and tooltip; the other actions stay quiet. There is no home footer. Keep
workspace names flexible and ellipsized, and separate the toolbar from accounts
with one quiet divider. The list uses the remaining height and ends at the
panel's existing 18px bottom inset. Reuse shared fine-pointer hover, immediate
keyboard feedback and press transitions; reduced motion retains only short
opacity feedback. Do not animate toolbar layout or account content.
Quit Orbilap lives in Settings → General beside Reset to defaults, using the
shared soft coral action and a 44px target. Disable both during preference saves;
report quit failures through the existing toast. With no loaded workspace, retain
the original header Quit action for setup/error recovery.
Settings opens one dialog with four sections:
General, Usage, Menu bar and Updates. General and Updates apply to the app;
Usage and Menu bar retain the active workspace's scope. Name editing lives in the workspace picker. The current card has a visible Rename
button outside the listbox. Editing focuses and selects the existing name in a
bordered field and shows explicit Cancel and Save actions below it. Reuse the
shared buttons and keep each action at least 44px high. Crossfade the name and
input for pointer entry without animating layout. Keyboard and reduced-motion
changes are immediate, with a static saving indicator under reduced motion.
Enter saves a trimmed, nonempty name; unchanged names end editing without a
write. Preserve IME composition. Escape first cancels editing and returns focus
to Edit; the next Escape dismisses the picker, including when its tooltip owns
the top layer. Outside click or Close discards the draft without saving. A failed
save retains the input and an error toast for retry. While saving, reject
duplicate requests and block dismissal, switching and creation. Successful saves
keep the picker open and restore action focus. New workspace waits for picker
dismissal and restores focus to the workspace trigger. The header contains
workspace selection and account/app actions. Keep the current card's selected surface static
on hover/press; only the independent action receives local feedback. Other
options retain shared feedback.

Use the home panel as the visual reference. Its tokens live in `src/home.css`,
with shared dialog and control rules in `src/surfaces.css`. Use Figtree, opaque
graphite surfaces, the matching light palette and one fixed iris accent.
Reserve mint, amber and coral for success, warnings and errors. Workspace,
provider and account names identify their groups. Stored accent fields exist
for data compatibility.

Reuse `AppModal` for dialogs, Radix controls for keyboard and focus management,
and the existing top-edge Sonner toast. Use quiet solid surfaces, short titles,
separate groups and a clear primary action. Keep action targets fixed while
loading or hovering, and match placeholders to the final layout.

Use the shared ease and duration tokens. Fade hover layers on fine pointers
and scale the entire button slightly on pointer press. Keep keyboard focus
immediate, preserve visible focus and drop translation in reduced motion.
Dialogs enter and exit over the shared 250 ms duration, reversing the same
opacity, scale and short vertical offset. Exits use the shared ease-in-out curve
to remain legible during dismissal. Selects use 180 ms in both directions and
tooltips use 200 ms. Use `ModalTarget` when closing clears the selected data so the dialog
can retain its content until the exit ends. `AppModal` derives its stack level
from context so each nested scrim dims its parent sheet. Keep account cards flat with a quiet static inset edge, without whole-card
hover feedback. Preserve the picker’s interruptible dismissal. Preview
each changed surface in dark and light at tray width and verify exit and focus
restoration for dialogs.

Add Account sizes to its content within the tray viewport. Its review groups
verified accounts in one inset list, with provider marks on the left and
selection controls on the right. Show the destination workspace above the list with its initial mark and name as the review heading. Put provider and plan metadata below account identity so the checkbox has its own trailing column. Reuse the settings checkbox layers for this list.
Keep selection count and Clear selection together above a full-width Add accounts action in the fixed
footer. Keep this footer visible with zero selected accounts and disable Add
accounts. Row selection fades a persistent tint over 160ms, responds immediately
to keyboard input and uses a 100ms opacity fade in reduced motion.

Popup close buttons use the shared `popup-close` treatment: muted at rest,
a subtle coral layer and icon on pointer hover/press, and immediate iris keyboard
focus. Creation rows keep their rounded feedback layer separate from dividers.

The workspace picker presents the full list without search and initially focuses
the current workspace. Keep the same scrim token for the picker and dialogs,
including the stronger dimming in the matching light theme.

Destructive buttons on secondary surfaces use the shared softly coral-tinted inset fill, transparent
border and readable coral text (a darker coral in light mode). Fade a pre-painted
10% coral layer on pointer hover/press in 160ms; retain existing pointer press
feedback, immediate iris focus and 100ms reduced-motion fades. Never restore
legacy solid red hover fills. Discard confirmations emphasize Keep editing in
iris; both actions have 44px targets. Preserve safe initial focus and existing
confirmation flows. This follows Emil's hierarchy and feedback principles.

Workspace settings uses the entire appearance preview as its Radix radio target,
without a duplicate circle. Pointer hover fades a contrasting fill and inset edge
over 220ms with ease in both directions; quick reversals continue from the current
opacity. Reduced motion shortens this fade to 100ms. Quiet inset fills define the cards; a tinted selection
layer fades in over 180ms. Checkbox edges are soft inset strokes, with persistent
check/fill layers that reverse over 160ms. Visible-limit labels have no extra
outline. Usage uses two illustrated radio cards for Remaining / Used, showing complementary example values with explicit example copy. Codex resets has a master switch and a dependent predictions checkbox; hiding updates preserves its checked preference. Keyboard selection and focus
are immediate; reduced motion keeps only short opacity fades.

Shared select menus use a 4px inset and concentric 7px item corners inside the
12px frame. A checkmark identifies selection independently of hover. Pointer
feedback fades one pre-painted layer over 160ms, only on the actual hovered
highlighted item; keyboard targets receive immediate inset iris focus and fill.
Keyboard opening skips menu animation. Open Source triggers use a quiet 35%
layer so the menu owns the interaction. Reduced motion uses 100ms opacity fades.

Menu bar Source separates its full-width provider select from read-only account
metadata. Only the select has an inset fill, a quiet static edge and four complete
12px corners; the group has no fill or divider. Active account sits beneath it
with a muted label and a right-aligned wrapping name. Other providers have a
separate labeled account select. Hover fades a pre-painted layer to 65% over
240ms with CSS ease in both directions: the previous strong ease-out exposed
most of the change immediately. Keep the open fill at the same 65% and press
at 80% to avoid a bright flash followed by dimming. Source controls and chevrons
stay stationary; the menu already signals opening. Pointer entry restores pointer
feedback after keyboard use. Keyboard feedback and focus stay immediate; reduced
motion keeps only a 100ms opacity fade. Account initials uses an illustrated
checkbox card that follows the selected percentage/bar style. Visible limits
stay in duration order regardless of selection. Switches all use the shared
Radix Switch, without an inset outline; switch groups use 16px horizontal and 4px vertical
padding and no outer border. The Limit colors group keeps 16px below its final helper text. Limit colors has no repeated visible heading. Its dependent levels sit inside
the master switch group, indented behind a quiet vertical guide, with no row
hover layer. Content panels never draw keyboard focus borders; direct controls
keep an inset focus edge that stays inside scroll containers. The home Add
Account button has a flat fill without a top-edge inset highlight.
Preserve shared focus, pointer and reduced-motion behavior.

Segmented navigation uses 38px items with 7px vertical padding, a 3px frame
inset and 1px border, for a 46px total bar height. Share this compact height
across Settings navigation, Theme and Refresh interval. Keep the 12px labels
centered without changing their size or the selection layer's inset/radius.
Segmented navigation uses one persistent selection layer that travels over 220ms
with the shared ease-out curve on pointer selection. Keep labels and panel
content stationary, retarget interrupted transitions from their current position,
and match the 3px inset and 4px gaps for every option count. Selection, hover
and focus corners use the outer radius minus the 1px border and 3px inset
(8px inside the 12px frame), keeping the nested curves concentric. Keyboard selection
and reduced motion move the indicator immediately; focus remains immediate.

Divided fixed action footers in dialogs match their surrounding 16px inset;
home uses the unified header without an action footer. Setup and Add accounts use the shared action-footer inset,
without extra nested bottom padding. All discovery and review account rows use
the same quiet checkbox layers, persistent check indicator and immediate keyboard
feedback as Workspace Settings.

Light appearance uses an iris-tinted porcelain palette: a pale lilac canvas,
white cards, lavender inset controls and deep iris actions. The active account
has a quiet lavender surface and a solid iris monogram, with its explicit Active
label retained. Selected segments use a white selection layer and iris text.
All light surfaces, including legacy controls, resolve to the home semantic
tokens. Keep account cards flat and static; preserve the graphite dark palette
and existing focus, pointer and reduced-motion rules.

The sections below include historical design decisions.

Orbilap is a macOS tray utility. Apply the Appllama principles to the existing
Tauri/React panel: desktop typography, grouped preferences, keyboard focus and
short sheets. Mobile navigation, safe areas and simulator APIs do not apply.
