# GUPPI design system

GUPPI follows the [Impeccable](https://github.com/pbakaus/impeccable) design guidance. This file records the choices we made with it, so new screens match the existing ones. Tokens live in [`src/index.css`](src/index.css), themes in [`src/state/theme.ts`](src/state/theme.ts), and components in [`src/components/ui/`](src/components/ui).

## Where it sits

GUPPI is an *Operate* surface: a flight-deck console people keep open for long sessions, often in the evening, while probes fly and outposts mine. The interface should disappear into the task, so we aim for earned familiarity over novelty and put the brand in the precise details.

- **Dark, calm and flat.** Tinted deep-space neutrals, one declared elevation (a 1px border), and no glass, glow or gradients.
- **One accent.** It marks primary actions, selection, focus and "this probe", and nothing else. Status uses the semantic colours.
- **Telemetry as instruments.** Readouts have a label, a large tabular value and a ticked track, instead of rings or hero numbers.

## Colour

All colours are OKLCH. Surfaces are built from `--tint-h` and `--tint-c`, so a probe theme can tint them.

| Role | Token | Use |
| --- | --- | --- |
| Canvas | `base` | Content background |
| Chrome | `chrome` | Sidebar, top bar, dialog footers, insets (the second neutral) |
| Panel | `panel` | Cards and sheets |
| Raised / hover | `raised`, `hover` | Controls, selected rows |
| Wells | `void` | Inputs, the star map |
| Lines | `line`, `line-strong` | Borders and dividers (opaque, not translucent) |
| Text | `ink`, `ink-2`, `ink-3`, `ink-4` | All pass 4.5:1 on panel; `ink-4` is the quietest |
| Accent | `accent`, `accent-hover`, `accent-ink`, `accent-soft`, `accent-line` | Per theme |
| Status | `ok`, `warn`, `bad`, `info` | Health, caution, failure, motion/transit |

**Themes.** There are six accents (Ion, Solar, Aurora, Nebula, Comet, Helium) plus a custom hue, with optional panel tint. The app default is set in Settings, and each probe can have its own in Fleet → Colours. The probe in command sets the colours for the whole window, and each Fleet card shows its own probe's colours (`themeStyle()` scopes the variables to one element). Because tokens use `@theme inline`, a scoped `--accent` or `--tint-h` recolours the utilities inside that element.

Ion, the default, sits at OKLCH hue 250 (azure). Keep accents out of the sRGB cyan band (160–200°) whenever a purple is also on screen, since that pairing is the most recognisable AI palette.

## Type

- **UI face:** Mona Sans (variable). One family carries headings, labels, body and numbers.
- **Numbers:** `.num` gives tabular figures in the UI face. `.mono` (JetBrains Mono) is only for coordinates, ids, JSON and code, never as a "technical" costume.
- **Scale (fixed px, ratio ≈1.2):** 12 captions · 13–13.5 UI text · 14 body · 15–16 card titles · 23 page titles · 28 probe name. Nothing functional is below 11px and no body text is below 12px.
- **Headings** use `tracking-[-0.01em]` to `[-0.025em]` and are sentence case. No uppercase eyebrows or kicker labels.

## Components

- **Buttons:** `primary` is solid accent with `accent-ink` text, used once per region for the main action. Everything else is `secondary`, `ghost` or `outline`. No gradients or coloured shadows.
- **Cards:** `.surface` (panel plus 1px border) with a 12px radius. Titles carry a small inline icon in `ink-3` rather than a tinted icon tile. Don't nest cards: use dividers, spacing or `chrome` insets.
- **Readout** (`components/ui/data.tsx`): the instrument for any 0–100 quantity. The fill takes the status colour, or pass `invert` when high is bad.
- **Badges:** small, 6px radius, tinted by tone. Use them for state, not decoration.
- **Dialogs:** reserved for protected focus (confirmations, multi-field orders). Prefer inline panels, like the departure guard in Navigation or the colour editor in Fleet. On phones, dialogs are bottom sheets.
- **Empty states** teach the next step. Show a plain icon, never a tile.

## Motion

Transitions run 150–250ms with an exponential ease-out (`cubic-bezier(0.16, 1, 0.3, 1)`). Motion only shows state: dialogs rising, bars filling via `transform` rather than width. There are no page-load sequences or per-card entrances, and Settings → Reduce motion (plus the OS setting) turns everything off.

## Browser surfaces

Selection, caret, placeholder, scrollbars and focus rings are all themed from the tokens in `index.css`. Focus is a 2px accent outline with a 2px offset.

## Checking your work

1. Run `pnpm dev`, then open `http://localhost:5173/?simulator#/<view>` (or `/mobile.html` at phone width). `?simulator` opens straight into the offline universe.
2. Run Impeccable's detector against the running app:

   ```bash
   # Cloud or root shells need Chromium without its sandbox:
   printf '#!/bin/sh\nexec /opt/pw-browsers/chromium --no-sandbox "$@"\n' > /tmp/chrome && chmod +x /tmp/chrome
   IMPECCABLE_BROWSER=/tmp/chrome npx impeccable detect "http://localhost:5173/?simulator#/bridge"
   ```

   Expected leftovers are low-contrast readings on disabled buttons, which WCAG exempts.
3. Look at the screen yourself too. A clean scan is the floor, not the goal.
