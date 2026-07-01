# RepoPress Redesign — Decision Log

Surface-by-surface redesign in code (Editorial identity, iterated live in Chrome).
Surfaces landed so far: **Landing** (below), **Dashboard shell + sidebar** (end).

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

- Scanner stat-triplet (6 / 148 / 38 big-number cards) still reads a little
  "hero-metric"; could be integrated more subtly.
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

**NEEDS REVIEW (callout tokens):** `warning` and `success` callouts share
`border-border bg-muted` because the design system has no `--warning`/`--success`
tokens. Functionally they look identical; to distinguish them, add those tokens
to `globals.css`. Deferred.

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

**OpenGraph image:** raw Tailwind blue `#2563eb` → `#4e67d4` (≈ Signal Slate
`oklch(0.52 0.13 255)`) for both the top accent bar and the logo background.

**NEEDS REVIEW (globals.css:607):** `.studio-sidebar { transition: width 200ms ease }`
— impeccable flags `width` as a layout property. Animating width IS intentional
here (sidebar collapse) and hard to replace without structural changes; leave as-is.

Verified: tsc clean, lint 0 errors (12 pre-existing warnings), 583/583 tests.
