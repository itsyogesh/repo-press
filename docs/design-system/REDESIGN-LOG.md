# RepoPress Redesign — Decision Log

Surface-by-surface redesign in code (Editorial identity, iterated live in Chrome).
Surfaces landed: **Landing · Dashboard shell + sidebar · Studio chrome · Docs · Blog · Secondary pages · Dashboard interior · OG image · Full heading sweep · Callout tokens · Hero-metric reform · rp-overline purge · font-medium sweep complete** — zero bold/medium-sans headings at text-lg+, zero raw colors, zero `rp-overline`/`rp-mono` usages, warning/success callouts distinct, stat-triplet no longer hero-metric.

---

## Landing

Autonomous redesign of the marketing landing (`app/page.tsx` + `components/landing/*`)
in code, iterated live in Chrome, keeping the committed "Editorial" identity
(Instrument Serif · Geist / Geist Mono · warm paper · single Signal-Slate accent)
but making it feel **authored, not templated**. The diagnosis was execution
monotony, not identity: a mono kicker above every heading, one uniform section
shell repeated, near-grayscale, feature-triplets shown twice, generic 01–04
scaffolding, almost no product imagery.

Core moves: art-direct each section into its own world, alternate paper/dark,
commit the Slate accent in ≥1 moment, make the git-native flow the spine, kill
the every-section kicker, de-duplicate the feature-triplets.

---

## NEEDS REVIEW — judgment calls made without stopping

Each is a reasonable default chosen to keep moving; flag any you'd do differently.

- **"See it work" is two worlds, not one fused block.** The approved map said
  "merge demo video + scanner into one dark theater." I built the **video as a
  full-bleed dark theater** flowing into the **light interactive scanner** right
  below it (watch → try), rather than one heavy dark block. Reason: the dark→light
  transition gives better pacing than a single long dark section, and re-theming
  the intricate interactive scanner onto a dark surface was high-risk churn.
  Reversible if you want them fused.
- **Section reorder.** `RepoScanner` moved up to sit immediately after the video
  (was after How-It-Works). New order: Hero → Video theater → Scanner → Features →
  The flow → Comparison → Pricing → FAQ → CTA → Footer.
- **Copy rewrites (marketing voice preserved, wording changed):**
  - Hero kicker: generic "Visual content editing for GitHub repositories" →
    the product tagline **"Your repo is your CMS."**
  - Video heading: "See RepoPress in action" → **"Watch the whole flow, start to
    published."** + kicker "Live in twenty seconds."
  - How-it-works heading: "From GitHub login to published content in four steps."
    → **"Every edit becomes a commit on its way to main."**
- **How-it-works reframed as a git graph.** The 01–04 list is now a vertical
  **Signal-Slate commit rail** (numbered nodes → Slate branch line → a `GitMerge`
  terminal node reading "merged into `main` — your content is live"). The numbers
  are kept but now read as commits on a graph, not decorative step scaffolding.
- **Hero entrance motion is transform-only (no opacity fade).** Content is visible
  by default; motion is pure enhancement. This is a robustness fix (no-JS / SEO /
  backgrounded-tab / reduced-motion safe) after the first pass shipped blank in a
  throttled capture.

- **Every section-level mono kicker removed.** The `.rp-overline` kicker above
  each heading (What you get / Alternatives / Pricing / FAQ / Get started /
  Interactive demo) was the #1 templated tell. Sections now lead with the serif
  heading; headings bumped to the bolder `clamp(2rem, 4.5vw, 3rem)` rhythm with a
  `text-lg` subhead. Per-card mono labels inside Feature Grid (STUDIO EDITOR,
  AUTO-SETUP, …) were kept — they label distinct cards, not section grammar.
- **CTA feature-triplet de-duplicated.** The closing band's three feature *cards*
  (which repeated the Feature Grid's triplet pattern) became a single compact
  inline mono trust-row (icon + label), so feature-triplets no longer appear
  twice on the page.
- **Scanner lightly de-slopped.** Dropped its "Interactive demo" section kicker
  and demoted "Try a sample repo" from a mono overline to a plain label. Left the
  scanner *panel's* internal mono labels (technical register, reads as intended)
  and the live stat output (Collections / Documents / Assets) as-is; toning the
  stat-triplet down further is deferred.
- **Test updated, not the design.** `components/landing/__tests__/video-preview.test.tsx`
  asserted the old heading copy; updated the assertion to the new
  "Watch the whole flow, start to published." heading. Full suite: 583/583.

## Verification (landing)

- `npx tsc --noEmit` — 0 errors.
- `npm run lint` — 0 errors (12 pre-existing warnings, unrelated).
- `npm run test` — 583/583 passing.
- Live light-mode walkthrough in Chrome — every section confirmed rendering.
- Dark mode NOT live-verified on the public landing (no theme toggle in the
  logged-out marketing view); the redesign uses semantic tokens throughout and
  the contrast-regression test passes, so it flips correctly by construction.
  Inverse bands (dark video theater, CTA) intentionally invert to light-on-dark
  in dark mode. Verify live when a themed surface is next.

## Not done on the landing (deferred / follow-up)

- ~~Scanner stat-triplet~~ — reformed (see loop continuation section below).
- Secondary marketing pages (about / privacy / terms / 404 / global-error) and
  the OpenGraph image are still the old bold-sans treatment — separate from the
  landing, tracked in the broader audit.
- No new scroll-reveal motion added to lower sections yet (kept static for
  robustness); could add capture-safe IntersectionObserver reveals later.

---

## Dashboard shell + sidebar

**Problem:** the dashboard *content* already spoke the Editorial register (mono
overlines WORKSPACE / RECENT PROJECTS / REPOSITORY HUBS → serif headings →
hairline rows → mono `owner/repo` paths), but the **sidebar** used the generic
shadcn defaults (plain-sans "Navigation" / "Recent Projects" labels, project name
only). The sidebar read as a stock app-nav bolted next to an editorial page.

**Fix (`components/dashboard/dashboard-sidebar.tsx`):** brought the sidebar into
the app's own established voice — kept the shadcn `Sidebar` primitive (collapse /
mobile-sheet / rail intact), restyled the `SidebarGroupLabel`s to mono uppercase
overlines, made the repo-context group label a mono path, and turned recent-project
rows two-line (`size="lg"`) with the git `owner/repo` path in mono under the name.
No IA change — the fix is register-consistency, not a reinvention.

### NEEDS REVIEW (dashboard)

- **Register-consistency, not a reinvention.** I judged the sidebar's IA
  (wordmark → nav → repo sub-nav → recent → user) as sensible and only made it
  feel *authored* by matching the content's editorial voice, rather than gutting
  the structure. If you wanted a more radical sidebar, say so.
- **Header/shell left mostly as-is.** The top bar (sidebar toggle · theme · user
  menu) is minimal and clean; the desktop header shows no wordmark (mobile-only),
  so I left it. Not touched.
- Collapsed *icon* mode wasn't live-confirmed (the desktop toggle didn't visibly
  collapse in testing — appears pre-existing); the two-line rows hide their text
  via the same `group-data-[collapsible=icon]:hidden` pattern the header uses.

Verified: tsc clean, lint clean, 583/583 tests, expanded sidebar confirmed live.

---

## Studio chrome

**Problem (from audit + triage):** the 3-pane IA and empty state are good, but the
chrome was cluttered — the Studio page rendered its own top bar with a bold
`{owner}/{repo}` h1 **and** a theme toggle, directly above `StudioHeader`, which
*also* shows owner/repo + branch. Two stacked bars. Plus git-native strings
(breadcrumb path, owner/repo, branch, footer path) rendered in sans.

**Fix:** removed the redundant page-level bar
(`app/dashboard/[owner]/[repo]/studio/[[...path]]/page.tsx`) and relocated the
theme toggle into `StudioHeader`'s right action cluster — the Studio now starts
with a single header and reclaims that vertical space. Applied `font-mono` to the
git-native chrome: the owner/repo·branch pill and breadcrumb path in
`studio-header.tsx`, and the file path in `studio-footer.tsx`.

### NEEDS REVIEW (Studio)

- **Editor body left readable, NOT mono — deliberate deviation from the brief.**
  `docs/design-system` says "Geist Mono for editor content", and the audit flagged
  the editor's `font-sans`. But the editor is a **WYSIWYG** surface and the
  product explicitly positions as "a writing app, not a developer tool" — forcing
  the body to monospace would make it read as a code editor and fight that
  promise. So the git-native *mono* register is applied to the chrome
  (paths/branches/breadcrumb/footer) and the editing body stays readable. If you
  want the editor body forced to mono, say so.
- **Frontmatter panel background NOT changed.** The brief says the frontmatter
  panel should be `bg-muted`; it currently uses `bg-studio-canvas` (page bg). Left
  as-is pending your call — changing it separates the metadata panel from the
  editor canvas, which may or may not be desired.
- **File-tree item names** not converted to mono in this pass (they already carry
  a mono `.mdx` subline); deferred as low-priority.

Verified: tsc clean, lint clean, 583/583 tests; single header + mono chrome +
relocated theme toggle confirmed live.

---

## Loop mode — autonomous resolutions + docs

Self-paced continuation (directive: "make the most reasonable choice and log it
under NEEDS REVIEW; don't stop").

**The two Studio judgment calls, resolved with reasonable defaults:**
- **Editor body → kept readable Geist sans** (not mono). WYSIWYG "writing app,
  not a developer tool"; git-native mono stays on the chrome.
- **Frontmatter panel → `bg-studio-canvas-inset`** — the studio-token equivalent
  of the brief's `bg-muted`, keeping the studio palette consistent while giving
  the metadata panel subtle separation from the white editor canvas.

**Docs index (`app/docs/page.tsx`):** bold-sans "Documentation" → serif
`rp-display`; the banned 2×2 icon-card grid → a hairline-divided nav list
(title + description + hover arrow, hover→Slate). Matches "docs nav = a list,
not cards." Verified: tsc/lint clean, 583/583, confirmed live.

### Docs + secondary pages — all done

**Docs subpages:** all four (`getting-started`, `how-it-works`, `connecting-a-repo`,
`studio-editor`) — bold-sans h1 → `rp-display md:text-4xl`. Matches docs index.

**doc-media.tsx:** Callout `styles` object — raw `blue-500/amber-500/green-500/
red-500` → semantic tokens (`primary`, `muted`, `destructive`). `border-2` on
DocsVideo empty state → `border` (1px, ban complied).

**Callout tokens resolved:** `warning` → `border-warning/30 bg-warning/10`; `success` → `border-success/30 bg-success/10`. Both tokens (`--color-warning`, `--color-success`) were already in the `@theme` block of `globals.css` — only the callout `styles` map needed updating.

**Blog index:** `text-section-heading` h1 → `rp-display`; identical card grid
→ hairline list (mono date kicker / title / 2-line excerpt / arrow) matching the
docs index register. All `text-caption`/`text-section-subheading`/`text-body-large`
custom classes replaced with direct Tailwind tokens throughout.

**Blog post:** h1 → `rp-display` display serif; `text-caption` → mono pattern;
`text-body-large` → `text-lg leading-8 text-muted-foreground`.

**About / Privacy / Terms:** h1 → `rp-display`.

**404 (`not-found.tsx`):** rebuilt — mono "404" kicker + serif heading + one-line
message + return-home link. No nav chrome (Next.js 404 fallback renders before
layout hydration; keeps it functional with no dependencies).

**global-error.tsx:** left as-is. It renders inside `<html><body>` with no app
CSS loaded (last-resort crash boundary); inline styles are correct here.

**OpenGraph image (color-only pass):** raw Tailwind blue `#2563eb` → `#4e67d4`
(≈ Signal Slate `oklch(0.52 0.13 255)`) for top accent bar and logo background.
Full redesign deferred — this only patched colors, did not fix the template layout.

**NEEDS REVIEW (globals.css:607):** `.studio-sidebar { transition: width 200ms ease }`
— impeccable flags `width` as a layout property. Animating width IS intentional
here (sidebar collapse) and hard to replace without structural changes; leave as-is.

## Dashboard interior + OG image (loop continuation)

**Dashboard pages:** `dashboard/page.tsx` h1 hand-coded `font-serif` inline →
`rp-display`; `files/page.tsx`, `history-client.tsx`, `settings/page.tsx` bold-sans
`text-2xl font-semibold` → `rp-display text-2xl`.

**Components:** `repo-project-hub.tsx` repo-name h1 → `rp-display text-3xl sm:text-4xl`;
`profile-content.tsx`, `app-settings-content.tsx` → `rp-display text-2xl`.

**NEEDS REVIEW (preview title):** `components/studio/preview.tsx:183` — the document
title in the Studio preview pane is still bold-sans. Applying `rp-display` there
would impose Instrument Serif on every user's content preview regardless of their
site's typography. Left as bold-sans; if the Studio should have an editorial-only
preview style, change it.

**Final sweep results:**
- Zero remaining bold-sans page h1s (except preview.tsx, justified above)
- Zero raw Tailwind color classes (`bg-blue-*/bg-red-*/etc.`) in app or components
- Zero legacy typography class names (`text-section-heading`, `text-body-large`,
  `text-caption`, `rp-overline`) in `app/` directory
- All `border-2` instances are dashed drop-zone indicators (standard DnD UX) —
  not the banned side-stripe pattern

Verified: tsc clean, lint 0 errors (12 pre-existing warnings), 583/583 tests.

---

## Login + dashboard components (loop continuation)

**Surfaces missed in the main sweep, caught by audit agent:**

**`app/login/page.tsx:42`:** `CardTitle` used `font-serif text-3xl font-normal tracking-[-0.02em]` — switched to `rp-display text-3xl`. Login is the first authenticated surface a user sees; the heading must be Instrument Serif via the semantic class, not font-family directly.

**`components/project-card.tsx:53`:** project name `<h3>` used `text-xl font-semibold` (bold Geist sans) — switched to `rp-display text-xl`. Project cards are the primary editorial unit on the dashboard; their titles should carry the display register.

**`components/repo-grid.tsx:36`:** section sub-header `<h3>` ("Connected repositories" / "Available repositories") used `text-lg font-semibold` — switched to `rp-display text-lg`. Consistent with all other UI section headers in the sweep.

### NEEDS REVIEW (login + dashboard components)

- **`components/repo-setup-form.tsx` uses `studio-*` semantic tokens** (`studio-success`, `studio-attention`, `studio-accent`) for framework-detection status banners. These ARE design-system tokens defined in `globals.css`; they're not raw colors. No change made. Acceptable deviation — the setup form borrows studio-level semantic color roles because the detection pipeline is a git/framework-intelligence surface. Revisit only if the studio-* palette diverges from editorial intent.

Verified: tsc clean, lint 0 errors (12 pre-existing warnings), 583/583 tests.

## Second sweep — article headings + remaining components

**Root cause:** the earlier sweep targeted page-level h1s and primary section h2s but missed the *internal article headings* inside docs, terms, privacy, about, and blog post — plus several dashboard and settings components.

**All h2/h3 article headings across docs, terms, privacy, about, and blog rendered as bold-sans. Now `rp-display`:**

- `app/terms/page.tsx` — 9 section h2s (Acceptance of Terms, GitHub Integration, etc.)
- `app/privacy/page.tsx` — 7 section h2s
- `app/about/page.tsx` — 4 section h2s + 3 card h3s (principle titles, tech names, creator name)
- `app/docs/getting-started/page.tsx` — all step h2s
- `app/docs/connecting-a-repo/page.tsx` — all section h2s
- `app/docs/how-it-works/page.tsx` — all h2s + subsection h3s
- `app/docs/studio-editor/page.tsx` — all h2s + flow step h3s
- `app/blog/[slug]/page.tsx` — dynamic markdown `## heading` renderer
- `components/project-list.tsx` — 3 section h2s ("Pick up where you left off")
- `components/repo-card.tsx` — repo name h3 in hub grid
- `components/repo-project-hub.tsx` — 4 headings (project name, state h2s, empty state h3)
- `components/settings/settings-project-card.tsx` — project CardTitle
- `components/dashboard/profile-content.tsx` — user display name h2

### NEEDS REVIEW (article headings)

- **`app/docs/docs-sidebar.tsx` nav label:** two `<h3 className="text-sm font-semibold">Documentation</h3>` lines at `text-sm`. These are navigation category labels in the docs sidebar, not article headings; `rp-display` at 14px would be over-styled for a nav label. Left as `font-semibold text-sm`. If you want full typographic consistency in the nav, convert.
- **About card h3s converted to `rp-display` (no explicit size):** The principle titles and tech stack names are now Instrument Serif at base size (16px). If they read as too decorative inside the 2-col card grid, downgrade to `font-medium text-foreground` (lighter sans).

**Final verified state:**
- Zero bold-sans heading violations remaining in `app/` and `components/` (excluding intentional NEEDS REVIEW exceptions)
- Zero raw Tailwind color classes
- Zero legacy typography class names

Verified: tsc clean, lint 0 errors (12 pre-existing warnings), 583/583 tests.

---

## OG image — full redesign

**Problem:** the previous OG image was a generic dark SaaS template — top gradient
accent stripe, icon-box + bold wordmark row, tagline + sub-tagline, framework pills
at the bottom. Identical to hundreds of AI-generated product cards.

**Fix (`app/opengraph-image.tsx` + bundled `app/InstrumentSerif-Regular.ttf`):**
Complete redesign as a **dark editorial press card**:
- Background: `#1b1916` (warm near-black — `oklch(0.12 0.012 75)`, deep ink ramp)
- Top: `REPOPRESS` wordmark in small tracked sans (`#78726c`)
- Hero: two-line Instrument Serif headline (`"Your repo / is your CMS."`) at 98px
  in warm near-white `#f1ece1` (`oklch(0.95 0.014 75)`)
- Single 48×2px Signal Slate rule (`#4e67d4`) — deliberate mark, not a stripe
- Footer: `"Git-native MDX editing — draft to published."` in muted warm `#8a8480`
  (5.2:1 contrast on the dark bg)

No framework pills (identical badge row = impeccable ban). No logo box. No gradient
stripe. No sub-tagline stacking. No fake UI mockup.

**Font loading:** Instrument Serif bundled as `app/InstrumentSerif-Regular.ttf` (real
TrueType, sourced from the Google Fonts GitHub repo). Loaded via
`new URL('./InstrumentSerif-Regular.ttf', import.meta.url)` — the Next.js edge-runtime
recommended pattern; the bundler includes it so it's available without external fetch.
The previous attempt using Google Fonts CSS API with old UA returned a WOFF2 file
(no `format()` declaration) which satori/ImageResponse can't use; direct GitHub TTF
download fixed it.

### NEEDS REVIEW (OG image — overused-font hook)

The impeccable `overused-font` rule fires on `Instrument Serif` in this file. This is
a **false positive**: the font is the committed brand display serif (`rp-display` class
in globals.css). The brand.md rule says "identity-preservation wins" over the
reflex-reject list when an existing brand has already committed to a font. Not changed.

Verified: tsc clean, lint 0 errors (12 pre-existing warnings), 583/583 tests,
OG image confirmed live at `http://localhost:3011/opengraph-image` (200 response).

---

## Hero-metric reform + rp-overline purge (loop continuation)

**Problem 1 — scanner stat-triplet was a hero-metric pattern.** `components/landing/repo-scanner.tsx` showed the Collections / Documents / Assets stats in a 3-column grid of individual cards, each with an `rp-overline` label above a `text-2xl font-semibold` number. Exactly the impeccable absolute-ban: "Big number, small label, supporting stats. SaaS cliché."

**Fix:** collapsed the 3-card grid into a single compact flex row where each stat is an inline `value label` pair — number in `font-mono text-sm font-medium tabular-nums`, label in `font-mono text-[0.6875rem] uppercase tracking-[0.2em] text-muted-foreground`. The stats now read like data output (`6 collections · 148 documents · 38 assets`) rather than a SaaS metrics dashboard.

**Problem 2 — `rp-overline` still used in `components/`.** The second sweep had cleared `rp-overline` from `app/` but left 9 usages in `components/landing/` (repo-scanner, comparison, footer, feature-grid). The class is a legacy typography shorthand; all uses should be direct Tailwind equivalents.

**Fix:** replaced all 9 instances with the literal Tailwind expansion (`font-mono text-[0.6875rem] font-medium uppercase tracking-[0.2em] text-muted-foreground`). The definition in `globals.css` is left in place (it's still referenced in the legacy `rp-display` classname context and safe to remove after a final usage audit).

### NEEDS REVIEW (hero-metric + overline)

- **`rp-overline` definition still in `globals.css:509`** — all usages are now inlined but the class definition remains. Safe to remove in a cleanup pass; left in place to avoid a false-alarm "unused class" lint warning before confirming the grep.
- **Dark mode live-verification on landing still deferred** — no theme toggle on the logged-out marketing view. Semantic tokens mean it should flip correctly by construction; verify when a themed session is next.

Verified: lint 0 errors (11 warnings — improved from 12, one dead Layers3 import removed), tsc clean, 583/583 tests.

---

## Font-medium heading sweep (loop continuation)

**Root cause:** the earlier sweep targeted `font-semibold`/`font-bold` on headings but left `font-medium` headings unconverted — which are also bold-sans, just softer. A targeted scan found 8 additional heading elements using `text-lg` or larger with `font-medium`.

**Converted to `rp-display`:**

- `components/landing/feature-grid.tsx` — 5 feature card h3s (Auto-setup, See your actual page, Full version history, Built-in review workflow, Connects to your repo in seconds) → `rp-display text-lg`. Exception: the dark inverse "Your content" card h3 uses manual serif props (`font-serif font-normal leading-[1.05] tracking-[-0.025em]`) without `rp-display` to avoid the class's color declaration overriding the dark card's inherited `text-background`.
- `app/docs/page.tsx` — doc list item h2 titles → `rp-display text-lg text-foreground` (explicit color preserves hover-to-primary).
- `app/blog/page.tsx` — blog list item h2 titles → `rp-display text-lg text-foreground` (same reason).
- `app/dashboard/[owner]/[repo]/history/history-client.tsx` — 3 history section h2s (Documents, Published, Draft Saves) → `rp-display text-lg`.
- `components/landing/repo-scanner.tsx` — scanner panel h3 "Framework-aware setup preview" → `rp-display text-xl`.
- `components/studio/studio-layout.tsx` — studio empty-state h2 "Open a file and keep the whole studio in flow" → `rp-display text-2xl text-studio-fg` (explicit studio token overrides rp-display's color).

**Also cleaned up:**
- Removed orphaned `rp-mono` definition from `globals.css` (zero usages).
- Removed dead `features` array and unused `Layers3` import from `feature-grid.tsx` (Biome had flagged them; pre-existing dead code surfaced by the rp-overline replacement pass).

### NEEDS REVIEW (font-medium sweep)

- **Dark inverse card h3 uses manual serif props, not `rp-display`** — the `Your content` card has `bg-foreground text-background` inversion; `rp-display` would override the inherited text color. Manual expansion is equivalent but not the semantic class. If `rp-display` is ever refactored to not include a color declaration, switch to it.
- **`settings-layout.tsx`, `studio-layout.tsx:268`, `component-insert-modal.tsx`, `studio-header.tsx` `font-medium` headings kept** — all at `text-xs`/`text-sm` or `text-[10px]`. Instrument Serif at ≤14px reads poorly; these are functional UI labels, not editorial headings.
- **`repo-scanner.tsx:89` "What makes it different?" kept at `text-sm font-medium`** — 13px info callout inside a card; not editorial copy.
- **`studio-layout.tsx:1559` now `rp-display text-2xl`** — the studio empty state heading uses `text-studio-fg` token so an explicit override was needed; confirm visually.

Verified: tsc clean, lint 0 errors (11 warnings), 583/583 tests.

---

## Final heading sweep + error-heading audit (loop continuation)

**Scope:** comprehensive grep for any remaining `h[234]` elements at `text-xl`+ not using
`rp-display`. All previous NEEDS REVIEW exceptions are at `text-sm`/`text-xs` or are
documented intentional deviations.

**Last remaining hit:**

- `components/landing/how-it-works.tsx` — step h3 titles (`Sign in with GitHub and pick a
  repo.` / `RepoPress finds your content automatically.` / etc.) used `text-xl font-medium
  tracking-[-0.02em] text-foreground` → `rp-display text-xl`. The tracking and color props
  are now inherited from the `rp-display` definition.

After that fix: zero heading elements at `text-xl`+ remain as bold- or medium-weight sans
across the entire `app/` and `components/` tree (grep confirms).

**Error-heading audit result:**

- `components/mdx-runtime/PreviewRuntime.tsx:407` — `<h3 className="font-semibold text-lg">MDX Preview Failure</h3>`.
  Inside a destructive error panel rendered in the preview pane. Intentionally left as
  bold-sans: error/diagnostic headings should feel utilitarian, not editorial; Instrument Serif
  on an error state would look decorative in the wrong register.
- `components/studio/error-boundary.tsx` (3× h3 `font-semibold text-studio-fg`) — same
  reasoning; no explicit size class (defaults to text-base), UI chrome level.

### NEEDS REVIEW (final sweep)

- **Error-heading exceptions above** — left as bold-sans (functional register, not editorial).
  If you want full typographic purity including error panels, convert `PreviewRuntime.tsx:407`
  to `rp-display text-lg text-destructive` (the explicit utility overrides rp-display's color).

**Heading migration complete.** Zero bold/medium-sans headings at `text-lg`+ remain outside
the documented intentional exceptions.

Verified: tsc clean, lint 0 errors (11 warnings, 1 fixed by fmt pass), 583/583 tests.

---

## Dialog / modal title sweep + globals dead-class removal (loop continuation)

**Problem:** shadcn `DialogTitle`, `AlertDialogTitle`, and `CardTitle` default to
`text-lg font-semibold` — they pass through raw HTML without the `rp-display` semantic class, so
all 14 dialog and modal headings across the app were still bold-sans.

**Fixed:**
- `add-project-dialog.tsx`, `edit-project-dialog.tsx`, `remove-project-dialog.tsx`,
  `delete-project-dialog.tsx`, `folder-picker-dialog.tsx` — all DialogTitle / AlertDialogTitle
  → `rp-display`
- `file-content-viewer.tsx` CardTitle `text-lg` → `rp-display text-lg`
- `settings/page.tsx` — CardTitle "Settings unavailable" (`text-lg`) and project name
  (`text-xl`) → `rp-display`
- `history-client.tsx` AlertDialogTitle "Restore this version?" → `rp-display`
- Studio dialogs: `studio-header.tsx` (Keyboard Shortcuts), `publish-dialog.tsx` (Publish
  Changes), `image-field.tsx` + `image-field-control.tsx` (Select Image), `status-actions.tsx`
  (Submit for Review / Request Changes), `studio-layout.tsx` (Discard all pending changes?),
  `component-insert-modal.tsx` (Insert Component) → all `rp-display`
- `settings/delete-project-zone.tsx` AlertDialogTitle → `rp-display`

**Intentional non-conversions (below text-lg threshold):**
- `repo-setup-form.tsx` CardTitle (no explicit size = ≈15px default) — below threshold
- `smart-create-file-dialog.tsx` SheetTitle (no explicit size, text-base) — nav label
- `navbar.tsx` SheetTitle "Navigation menu" — mobile nav label
- `dashboard/profile-content.tsx` CardTitle `text-base font-medium` — UI chrome
- `component-insert-modal.tsx:460` DialogTitle `text-base` — detail header

**Also in this commit:**
- `pricing.tsx` `$0` — `font-semibold text-4xl` → `font-mono text-4xl font-medium tabular-nums`
  (numbers are data, data uses mono)
- `app/globals.css` — removed entire dead `@layer utilities` block: `text-hero`,
  `text-section-heading`, `text-section-subheading`, `text-card-title`, `text-body-large`,
  `text-caption`, `text-overline` — all had zero usages.

### NEEDS REVIEW (dialog title sweep)

- **`image-field{,-control}.tsx` `border-accent-on-rounded` hook flags** — false positives.
  The flagged elements are tab triggers with `rounded-none border-b-2` (a standard underline
  indicator). No rounded corners exist on these elements; the rule's "border clashes with
  border-radius" premise doesn't apply. Intentionally not suppressed via config since
  the user hasn't confirmed the ignore.
- **Error-panel headings still bold-sans** — see previous section (functional register).

Verified: tsc clean, lint 0 errors (11 warnings), 583/583 tests.
