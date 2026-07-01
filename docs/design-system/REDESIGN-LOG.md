# RepoPress Landing Redesign — Decision Log

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
