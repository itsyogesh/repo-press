# RepoPress - Design System

> Imported from Claude Design project `956b6b31-be22-4d50-ba35-0df856087e8f`
> (<https://claude.ai/design/p/956b6b31-be22-4d50-ba35-0df856087e8f>). That URL
> is the visual source of truth for screenshots and live component renders.

This design system encodes the **"RepoPress Editorial"** look: a writing studio
for your repo. Warm near-white paper, a refined serif display (Instrument
Serif), Geist Mono for the developer register, and a single restrained accent
(Signal Slate). Light and dark are both first-class.

The feeling: **Cursor's editorial calm x Resend's typographic confidence x
gitcms.dev's serif warmth**, built for a developer content tool.

## Visual foundations

### Color
- **Warm monochrome + one signal.** The entire UI is a warm neutral ramp (OKLCH
  hue ~75, whisper chroma) from paper near-white to ink near-black. **Signal
  Slate** (`oklch(0.52 0.13 255)` light / `oklch(0.72 0.11 255)` dark) is the
  only chromatic color, reserved for the primary CTA, active/selected state,
  focus ring, and links. No second accent; hierarchy is solved with scale,
  weight, and space.
- **Two themes, both first-class.** Light is warm paper; dark is warm near-black.
- **Document status** is its own scale: draft = gray, in_review = amber,
  approved = emerald, published = green (the only solid fill), scheduled = slate,
  archived = muted. Status always reads as **dot + tinted pill**, never color
  alone.

### Typography
- **Three registers.** Instrument Serif (400) for display/marketing headlines:
  sentence case, tight negative tracking (-0.02 to -0.025em). Geist (400/500/600,
  never 700 in chrome) for all UI and body. Geist Mono for the technical register
  (file paths, branches, SHAs, frontmatter keys, inline code) and uppercase
  overlines (tracking +0.2em).
- Body runs ~1.6 line-height with a ~720px max reading measure.

### Shape, depth & space
- **Radius:** chips 4, badges 6, inputs/buttons 8, dropdowns 10, cards 12,
  modals 14, featured 20, pills 9999. Editorial-soft, never pillowy.
- **Borders:** whisper-weight 1px hairlines. Prefer shadow-as-border (a 1px
  ring) over heavy drop shadows. Never 2px borders on chrome.
- **Elevation:** monochrome, four steps (ring, raised, floating, modal).
- **Spacing:** 4px base. Dense in app chrome (4-8px); generous in marketing
  (96-128px between sections). Asymmetric, numbered, whitespace-forward. **No
  equal-weight icon-card grids.**

### Motion
- Tasteful scroll-reveals (fade + 14px rise) on marketing; micro-interactions on
  press (buttons shrink ~0.8%, never color-only). Easing `--ease-out`
  cubic-bezier(0.22,1,0.36,1) for entrances. Durations 120/200/380/600ms.
  Everything gated behind `prefers-reduced-motion: no-preference`.

### Hover / press / focus
- **Hover:** ghost controls take a muted fill + darker text; secondary buttons
  darken their border; cards lift 2px; links/active states use Slate.
- **Press:** a subtle scale-down (shape change), not just color.
- **Focus:** a 3px Slate ring (`--ring`, 40% Slate), always present.

## Brand
- **The publish caret.** A caret that ships content up to `main` with a
  Signal-Slate commit node lifting off the tip (also a branch junction). Slate
  appears only on the node. Holds from a 16px favicon to a nav lockup. The
  earlier "RP" monogram is retired.
- **No emoji, ever.** Iconography is Lucide (24x24, 2px stroke, round caps).
- **Framework marks** for every framework RepoPress detects (Next.js, Fumadocs,
  Nextra, Astro, Hugo, Docusaurus, Jekyll, Contentlayer, + Custom).

## What's in this reference
- `tokens/` - `colors.css`, `typography.css`, `shape.css` (radius/elevation/
  motion), `spacing.css`, `fonts.css`, `base.css` (primitives). The source of
  truth for all foundation values.
- `components/` - the design-system primitives as authored in Claude Design
  (`Button`, `IconButton`, `Input`, `Select`, `Switch`, `Badge`, `StatusBadge`,
  `Tag`, `Avatar`, `Card`, `Tabs`). These are throwaway-React specs (inline CSS,
  `var(--token)` references); port their *visual contract* onto the app's shadcn
  primitives, do not copy verbatim.
- `MIGRATION.md` - the migration checklist + conventions + NEEDS REVIEW log.

> Page-level templates (marketing, studio, dashboard, taxonomy, media, etc.)
> live in the Claude Design project and are pulled per-page during their
> migration step rather than mirrored wholesale here.
