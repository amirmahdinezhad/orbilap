# Orbilap icons

`Orbilap.icon` holds the full-bleed tile artwork for macOS 26 and later.
Tauri bundles the compiled `Assets.car` catalog. macOS applies its rounded
mask at display time, including on small Finder icons.

After editing the Icon Composer document, regenerate the catalog with Xcode
26 or later. From this directory, run:

```sh
catalog_dir="$(mktemp -d)"
xcrun actool Orbilap.icon --compile "$catalog_dir" --platform macosx \
  --minimum-deployment-target 26.0 --target-device mac --app-icon Orbilap \
  --output-partial-info-plist "$catalog_dir/icon.plist" --warnings --errors
cp "$catalog_dir/Assets.car" Assets.car
```

`icon.png` is the 1024 × 1024 RGBA master for the pre-masked variants.
Its tile uses the macOS 26 silhouette centered in the 824 × 824 region of
the transparent canvas. Keep the artwork synchronized with `Orbilap.icon`
when regenerating the fallback ICNS, desktop PNGs and ICO, the panel WebP
(`src/assets/app-icon.webp`) and the favicon (`public/orbilap.png`).

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
