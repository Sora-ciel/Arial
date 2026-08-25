# Mr.Lee — guest theme

A temporary theme built from the wallpapers in [`../Hato skins`](../Hato%20skins).
It is meant to be pulled back out later, so it is deliberately kept to one
source file, one asset folder, and a handful of references.

"Hato" is the artwork and stays the internal name — the preset ids, the asset
folder and `hatoTheme.js` all keep it, so a grep for `hato` still finds every
piece. "Mr.Lee" is what the presets are called on screen.

## What it adds

Two presets in **Settings → Style presets**, over four colours — purple, pink,
orange and pale blue:

| | sky | accent | sparks | chrome |
| --- | --- | --- | --- | --- |
| **Mr.Lee Dusk** | purple `#630CA2` | pink `#FF0080` | orange `#FF962D` | dark `#1C0D2B` |
| **Mr.Lee Day** | pale blue `#78B2FF` | orange `#FF962D` | pink `#FF0080` | white `#FFFFFF` |

Dusk runs dark chrome and Day light, matching the night and daylight skies
they are cut from — without that the two read as one theme in two hues. On Day
the chrome is plain white — the canvas carries the sky tint, so a tinted panel
on top of it reads as an off colour rather than a chosen one — with buttons
washed in the sky colour and lettered in burnt orange `#A34500`, a cool fill
under warm text, which is the pairing the artwork runs on. Its hairlines are
the accent one step down (`#D96D00`); at full strength orange only reaches
2.2:1 on white and the line washes out. Dusk letters its buttons in `#FF5FAB` rather than the exact scarf pink,
which only reaches 3.7:1 on that fill; the accent stays exact everywhere it
isn't body text.

Picking one:

- repaints panels, canvas and blocks. Panels and blocks are translucent
  rather than solid, so the colour underneath — and in single note mode the
  wallpaper itself — carries up through the chrome instead of being buried
  under flat layers. The canvas is the exception: surround and working surface
  share one opaque colour (the sky seen through the panel tint), so it reads
  as a single sheet. Blocks keep a 3px black outline and a flat offset shadow,
  because nothing in the artwork is soft-edged;
- offers that theme's wallpaper as the **Single Note mode** background;
- swaps six toolbar icons for characters cropped out of the crowd.

The swapped icons are `menu`, `mode`, `plus`, `settings`, `folder` and
`camera`. Anything destructive or directional (trash, undo/redo, export,
import, up/down, close) keeps its glyph — a face there would cost the button
its meaning.

## How the background works

The wallpaper is **layered on at render time, never written into a save**
(`withThemeBackground` in `App.svelte`). That means it follows the theme
across every file, instead of sticking to whichever file happened to be open
when the theme was picked, and it leaves saves untouched so removing the theme
takes the background with it.

Precedence, highest first:

1. a background the reader chose themselves for that file;
2. nothing, if they removed the theme's one — **Remove** sets a per-file
   `bgThemeOptOut` flag, since there is no stored value to clear;
3. the active theme's wallpaper.

Opacity, blur, luminosity and fit still apply to the theme's wallpaper, and
those *are* stored per file.

## Files

| path | what |
| --- | --- |
| `src/utils/hatoTheme.js` | the two presets, the active-theme store, the icon mapping |
| `public/hato/*.webp` | single-note backgrounds, desktop + mobile crops |
| `public/hato/buddies/*.png` | the six 128px characters used on buttons |

Regenerate the assets with `python "../Hato skins/tools/build_hato_assets.py"`.

## Removing it

1. Delete `src/utils/hatoTheme.js` and `public/hato/`.
2. In `src/App.svelte`, remove the `./utils/hatoTheme.js` import, the
   `...HATO_PRESETS` spread at the end of `STYLE_PRESETS`, the
   `hatoThemeId.set(...)` call in `applyThemePreset`, and the
   `readStoredBackground` helper (inline it back to the plain
   `typeof … === 'string'` checks it replaced).
3. In `src/components/ControlIcon.svelte`, remove the import, the `buddy` and
   `buddySize`/`buddyBleed` reactive statements, and the `{#if buddy}` branch
   with its `<img>`.

`withThemeBackground` in `App.svelte`, the `bgThemeOptOut` field, and the
theme-background branch in `LeftControls.clearBgImage` are generic — any
preset can carry a `singleBackground` — so they can stay.

Anyone still on a Mr.Lee preset falls back to Default Dark on next launch, since
the stored theme id no longer matches a preset, and the background goes with
it. No save ever held a `/hato/…` path, so nothing is left pointing at a
missing file.
