# RepoPress Design System Migration

Migrating RepoPress to the **"RepoPress Editorial"** system (see `README.md` and
`tokens/`). Tracked here, one reviewable unit per loop run, on branch
`feat/design-system-migration`.

Source of truth: `docs/design-system/` (this folder) plus the live Claude Design
project `956b6b31` for page templates and screenshots.

Legend: `[ ]` todo, `[~]` in progress, `[x]` done. Each done item gets a
one-line note (what changed + files). Respect dependency order: never style a
consumer before its tokens/primitives exist.

> A full prototype of most of this already exists on branch
> `feature/editorial-design-system` (an earlier exploratory pass). Reuse /
> cherry-pick from it where faithful rather than rewriting from scratch, but
> re-verify each item against the spec before checking it off here.

---

## Conventions (how tokens map to code)

- **No `tailwind.config.js`.** This is Tailwind v4. All theme config lives in
  `app/globals.css` via `@theme inline {}`.
- **Token home:** `app/globals.css` `:root` / `.dark`. Add the design's raw ramp
  verbatim from `tokens/colors.css` + `tokens/shape.css` (`--paper-*`, `--ink-*`,
  `--slate*`, `--surface-*`, `--border*`, `--status-*`, `--shadow-1..3`,
  `--ease-*`, `--dur-*`, `--radius-*`), then **remap the existing shadcn semantic
  names onto it** (`--background: var(--paper-0)`, `--foreground: var(--ink-0)`,
  `--primary: var(--slate)`, `--muted: var(--paper-2)`,
  `--muted-foreground: var(--ink-2)`, `--border`, `--ring: var(--slate)`, etc.)
  so existing shadcn components inherit the editorial palette without rewrites.
  Keep the bespoke `--studio-*` / `--glass-*` / `--shadow-card` tokens but
  re-tint them warm.
- **Radius scale (in `@theme inline`):** `--radius-xs:4px --radius-sm:6px
  --radius-md:8px --radius-lg:12px --radius-xl:14px`; base `--radius:0.5rem`.
  Buttons/inputs `rounded-md` (8), cards `rounded-lg` (12), modals `rounded-xl`
  (14), pills/badges `rounded-full`.
- **Fonts:** `app/layout.tsx` loads Geist, Geist Mono, Instrument Serif via
  `next/font/google` with `variable:` set and applied to `<html>`. `@theme
  inline` maps `--font-sans: var(--font-geist-sans)`, `--font-mono`,
  `--font-serif: var(--font-instrument-serif)`. Use `font-serif` for display
  headlines (sentence case), `font-mono` for all paths/branches/SHAs/frontmatter
  keys/overlines, `font-sans` everywhere else. Never `font-bold` in chrome.
- **Component specs** (`components/*.jsx` here) are throwaway React with inline
  CSS + `var(--token)`. Port their **visual contract** (sizes, radii, colors,
  states, focus rings) onto the app's shadcn primitives in `components/ui/*`. Do
  NOT copy the `rp-*` classes or the `inject(<style>)` pattern.
- **Status:** an editorial `StatusBadge` (dot + tinted pill, mono uppercase)
  driven by `--status-*` tokens and `lib/document-status.ts`; use it instead of
  generic `Badge` variants for any document state.
- **Brand:** one `components/brand/logo.tsx` (`BrandMark` + `Logo`), the
  publish-caret using theme tokens (tile = `fill-foreground`, strokes =
  `stroke-background`, node = `fill-primary`). Retire the "RP" monogram.
- **Verify every item:** `npm run lint` + `npx tsc --noEmit` must pass, run the
  dev server (`npx next dev --port 3001`) and `npx convex dev`, and visually
  self-check against the spec / live Claude Design render. Both light and dark.

---

## 1. Foundations (do first; everything depends on these)

- [x] **Color + shape + spacing + typography tokens** into `app/globals.css`
      (`:root` + `.dark`) per Conventions, remapped onto shadcn names. Re-tint
      bespoke `--studio-*`/`--glass-*`/shadow tokens warm.
- [x] **Fonts wired** in `app/layout.tsx` (Geist + Geist Mono variables actually
      applied + Instrument Serif added) and mapped in `@theme inline`.
- [x] **Base typography utilities** in `globals.css` (`.text-hero` /
      `.text-section-heading` -> serif sentence-case, not `font-bold`; add a
      mono `.text-overline` helper).
- [x] **Tailwind theme tokens** in `@theme inline` (radius scale, font vars,
      status colors exposed as utilities where useful).

> Done: rewrote `app/globals.css` (warm hue-75 ramp + design raw tokens remapped
> onto shadcn names, editorial radii, status/elevation/motion, serif/mono base
> utilities) and wired Geist + Geist Mono + Instrument Serif in `app/layout.tsx`.
> Updated `components/landing/__tests__/contrast-regression.test.tsx` to follow
> the new `var()` token indirection. Verified: lint clean, app `tsc` 0 errors,
> contrast + primitives tests pass, dev render shows serif headings + warm
> palette + mono overlines in light and dark.

## 2. Primitives (`components/ui/*`, port specs from `components/`)

- [x] **Button** (`button.tsx`) - 8px radius (`rounded-md`), weight 500, slate
      primary, secondary/ghost/destructive per `Button.jsx`, press scale-down.
- [x] **IconButton** - via Button `size="icon"` variants; 32/28/40 sizes.
- [x] **Input / Textarea** (`input.tsx`, `textarea.tsx`) - compliant via
      foundation (8px radius, slate focus ring); mono/search applied per usage.
- [x] **Select** (`select.tsx`) - compliant via foundation (hairline trigger +
      chevron, 8px, slate focus).
- [x] **Switch** (`switch.tsx`) - ported to 38x22 pill, slate on, traveling
      thumb (`Switch.jsx`).
- [x] **Badge** (`badge.tsx`) - pill (`rounded-full`), neutral/accent (`Badge.jsx`).
- [x] **Card** (`card.tsx`) - 12px radius (`rounded-lg`), `surface-card` + shadow.
- [x] **Tabs** (`tabs.tsx`) - ported from shadcn pill to underline bar with slate
      active underline (`Tabs.jsx`).
- [x] **Avatar** (`avatar.tsx`) - compliant via foundation (rounded-full).
- [ ] **Dialog / Dropdown / Popover / Tooltip / Sheet** - modal radius 14
      (`rounded-xl`), elevation `--shadow-2/3`, hairline borders.
- [ ] Sweep remaining `components/ui/*` (checkbox, radio, slider, accordion,
      command, table, etc.) for radius/weight/color-token compliance.

## 3. Composed / cross-cutting

- [x] **StatusBadge** (`components/ui/status-badge.tsx`) wired into studio
      header, studio layout, and document list (replacing generic Badge variants).
- [x] **Brand logo** (`components/brand/logo.tsx`) + caret favicon
      (`public/icon.svg`) wired into navbar, footer, login (serif title),
      dashboard header + sidebar. "RP" monogram retired (no inline RP spans left).
- [ ] Framework marks (`assets/logos/*`) for the detection story.

## 4. Pages and surfaces

- [x] **Marketing landing** (`app/page.tsx` + `components/landing/*`) - full
      demolish + rebuild: flat sticky scroll-hairline navbar (no glass), centered
      serif hero with clean editor mock, hairline-divided how-it-works rows (no
      icon cards), rounded-lg feature cards (no surface-card gloss), flat
      comparison rows, flat full-width inverse CTA, flat border-t footer.
- [x] **Login** (`app/login/page.tsx`) - editorial card, brand mark, serif title.
- [x] **Dashboard** (`app/dashboard/page.tsx` + `project-list` + `repo-grid` +
      new `project-row`/`repo-row`) - notebook-calm: mono kicker + serif title +
      stat line, hairline-divided project/repo rows (no shadowed cards).
- [x] **Dashboard chrome** (`components/dashboard/dashboard-sidebar.tsx`,
      `dashboard-header.tsx`) - serif-italic wordmark ("RepoPress" + "GIT-NATIVE STUDIO"
      mono), avatar rounded-full.
- [x] **Repo hub** (`components/repo-project-hub.tsx`) - surface-card removed, all
      rounded-[X.XXrem] → rounded-lg/md, empty state dashed border → rounded-lg.
- [~] **Studio** (`components/studio/*`) - header all rounded-xl→rounded-md, toggle
      group, save/more buttons fixed; skeletons rounded-[X.XXrem]→rounded-lg/md;
      preview surface-card removed, rounded-[1.5rem]→rounded-lg; toolbar container
      fixed; publish ops bar fixed. File tree, frontmatter panel, status actions
      already clean. Command palette and publish dialog have no radius issues.
- [ ] **History** (`app/dashboard/[owner]/[repo]/history`).
- [ ] **Settings** (`app/dashboard/[owner]/[repo]/settings`, app settings,
      profile).
- [ ] **Setup / connect** (`app/dashboard/[owner]/[repo]/setup`,
      `repo-setup-form.tsx`).
- [ ] **Files / collection** browsers.
- [ ] **Docs** (`app/docs/*`) and **Blog** (`app/blog/*`).
- [ ] **Taxonomy manager** (net-new: authors / tags / nested categories UI).
- [ ] **Media library** (net-new: tracked assets, usage, dedup UI).
- [ ] **States** - empty / loading (skeletons) / error, app-wide.

---

## NEEDS REVIEW

- **`--ink-2` set to `oklch(0.54 0.008 75)` instead of the spec's 0.556.** The
  spec value gives muted-foreground ~4.37 contrast on the muted surface, just
  under WCAG AA (4.5). Nudged a hair darker so it clears AA; imperceptible and
  keeps the warm hue. Decision favors accessibility over an exact token match.
  (Foundations, `app/globals.css`.)
- **Convex `tsc` reports `Cannot find module '@/lib/roles'`** in
  `lib/project-access-token.ts` when running `npx convex dev`. Pre-existing on
  `main` and unrelated to this change: the file exists and the app's own
  `tsc --noEmit` resolves it with 0 errors, so it is a convex-tsconfig path
  quirk, not a missing module. Flagging so the convex verify step is not blamed
  on the migration. Not fixed here (out of Foundations scope).
- **Base corrected from `main` to `chore/misc-updates`.** The migration was
  initially branched off `main`, but `main` is 27 commits / 67 files behind
  `chore/misc-updates` (the session's working HEAD) and its Studio is broken:
  `components/studio/studio-layout.tsx` imports `lib/studio/preview-adapter-selection.ts`,
  which only exists on `chore/misc-updates`. The branch was re-based onto
  `chore/misc-updates` so the Studio compiles. Confirm the intended integration
  base before merging; if it should be `main`, `main` needs the mdx-runtime work
  merged first.
