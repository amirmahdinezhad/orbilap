# Orbilap icons

`icon.png` is the 1024 × 1024 RGBA master for the app icon. Tauri uses the
desktop PNG sizes, `icon.icns` and `icon.ico` for application bundles.
The panel uses `src/assets/app-icon.webp`, and the browser uses
`public/orbilap.png`.

`tray-template.png` is the transparent macOS menu-bar glyph. The app tints it
to match appearance and usage warning states.

`provider-codex.png`, `provider-claude.png` and `provider-antigravity.png` are
28 × 28 alpha masks rasterized from the existing `src/assets/` provider SVGs
with macOS sips. Antigravity is rasterized at 36 × 36 then center-cropped to
28 × 28 to remove its source padding. The native renderer tints each mask like
its metric group when logos are enabled. The masks are cropped to their alpha
bounds and fitted proportionally inside the same 28px canvas, reused by the
18px Settings marks. No new brand artwork is used.

The GPT mask is reduced once from a 1024px raster of its original SVG with
Core Graphics high-quality interpolation, after removing transparent source
padding. Never enlarge a previously reduced 28px bitmap.
