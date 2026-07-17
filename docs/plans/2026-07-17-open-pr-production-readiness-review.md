# Open PR Review & Production Readiness Plan — 2026-07-17

Review of all 8 open PRs (#34, #35, #37, #39, #40, #41, #42, #44), their git
relationships, and the recommended sequence to reach a clean base for the
final production-readiness work.

## TL;DR

- Main (`470f717`, merge of #38) already contains almost everything from the
  April-era PRs. **#35 and #37 are fully absorbed — zero content difference.**
- The open PRs form two competing lines:
  - **Line A (stacked):** #34 → #35 → #37 → #39 → #40 → all merged into
    **#41** (`chore/misc-updates`) → which is an ancestor of **#42**
    (`feat/design-system-migration`). #42 is the tip of this lineage.
  - **Line B:** **#44** (`docs/mdx-native-preview-architecture`) branches
    directly from main and re-architects the MDX preview system, deleting the
    host-realm runtime that Line A patched.
- #42 and #44 conflict in ~30 files, all in the old MDX runtime surface.
  **#44 is the keeper; #42's design work gets salvaged on top; #41's bug
  fixes need a survival audit** (some fix files #44 deleted, some fixes #44
  never received).
- CI (Lint / Typecheck / Test) is green on #41, #42, #44 heads and on main.

## PR inventory

| PR | Branch | State | vs main | Mergeable | CI | Verdict |
|----|--------|-------|---------|-----------|----|---------|
| #34 | `feat/folder-picker-content-root` | open | 1 ahead / 109 behind | conflicts | stale | Close — absorbed except 1 commit (see survival matrix) |
| #35 | `feature/remotion-videos` | draft | 3 ahead / 94 behind | conflicts | stale | Close — fully absorbed into main (zero content diff in `remotion/`) |
| #37 | `feature/pr35-landing-video-integration` | draft | 4 ahead / 94 behind | — (stacked on #35) | stale/failed | Close — fully absorbed into main |
| #39 | `native-runtime-mdx-refactor` | open | 1 ahead / 0 behind | unstable | stale/failed | Close — contained in #41/#42 lineage AND architecturally superseded by #44 |
| #40 | `chore/remove-repopress-config` | open | 1 ahead / 0 behind | unstable | stale/failed | Mergeable — tiny deletion, still relevant (files exist on main and in #44), no conflict with #44. Owner policy call. |
| #41 | `chore/misc-updates` | draft | 27 ahead / 0 behind | clean | green | Close after salvage — strict superset of #34/#35/#37/#39/#40 + 14 fix commits; ~90% of its diff sits in code #44 deletes |
| #42 | `feat/design-system-migration` | draft | 69 ahead / 0 behind | clean | green | Salvage — re-apply design increment on top of #44 (contains #41 as ancestor) |
| #44 | `docs/mdx-native-preview-architecture` | draft | 73 ahead / 0 behind | clean | green | **Keeper — primary merge candidate after review fixes** |

Notes on the table:

- "ahead/behind" counts are commits vs `origin/main` (`470f717`).
- #34/#35 show "conflicts" only because their bases are pre-#38 main; the
  conflicts are against work that already includes them.
- #37's base is `feature/remotion-videos`, not main — it auto-closes if #35
  closes.
- Vercel preview deploys: Ready on #34, #35, #41, #42, #44; failed on #37,
  #39, #40 (stale April builds).

## Branch genealogy

```
main (470f717 = merge of #38 "consolidation-all-work", CI green)
│
├── Line A (old lineage, each superseded by the next)
│   #34 ─┐
│   #35 ─┤  all five merged into
│   #37 ─┼──────────► #41 chore/misc-updates (27 commits:
│   #39 ─┤            5 merges + 14 fixes/tests, June 12)
│   #40 ─┘                    │ (ancestor of)
│                             ▼
│                     #42 feat/design-system-migration
│                          (#41 + 42 design commits, July 1–4)
│
└── Line B (fresh from main, July 12–17)
    #44 docs/mdx-native-preview-architecture (73 commits)
        deletes/rewrites the MDX host runtime that Line A patched
        → ~30-file conflict with #42, 27-file conflict with #41

Unmerged stray branch (no PR): fix/login-auth-redirects
    2 commits on top of current main (July 16):
    - 8bf276e fix(auth): redirect authenticated users from login  ← good, tested
    - 681df36 chore: preserve lock state  ← adds bun.lockb; drop or justify
```

## Key facts established during review

1. **`remotion/` + `public/remotion/` content is byte-identical between main
   and #41** — #35's three "unique" commits and #37's landing integration
   were all carried into main via #38. The only landing-area diff #41 adds is
   a 49-line cleanup of `components/landing/feature-grid.tsx`.
2. **#44 does not touch `remotion/`, `components/landing/`, or
   `app/page.tsx`** — the video/landing work is orthogonal to the
   architecture rewrite and is not at risk.
3. **#40's target files (`.repopress/mdx-preview.tsx`,
   `repopress.config.json`) still exist on main and in #44's tree**, and #44
   does not modify them, so #40 merges cleanly before or after #44.
4. **Dependency pinning risk:** `package.json` declares `better-auth`,
   `@convex-dev/better-auth`, `convex`, and `@octokit/rest` as `"latest"`.
   Locked versions today: next 16.0.10, better-auth 1.4.9,
   @convex-dev/better-auth 0.10.10, convex 1.31.7, @octokit/rest 22.0.1.
   Reproducibility currently depends entirely on `package-lock.json`; any
   plain `npm install` (or the `bun.lockb` added on the stray auth branch)
   can silently float the auth stack. Pin real semver ranges as part of the
   dependency remediation.
5. #44's own PR body + `docs/plans/2026-07-16-remaining-mdx-ecosystem-orchestration-handoff.md`
   document the launch blockers: upgrade better-auth 1.4.9 →
   ~1.6.23 together with @convex-dev/better-auth 0.10.10 → ~0.12.5, and
   Next.js 16.0.10 → patched 16.x (~16.2.10), then rerun the full
   auth/proxy/build regression matrix. `npm audit --omit=dev` currently
   reports ~60 advisory groups (2 critical, 19 high per the PR body).

## Per-PR verdicts

### #34 — folder picker for content root (open, base stale)

10 of its 11 commits are in main via #38. The 11th (`cbea505` "harden folder
picker access and tests") lives on in #41/#42 but **not** in main or #44 —
and the survival audit found the hardening genuinely missing in #44 (see
matrix: P2). Action: port `cbea505` (+ its 451cbc1 rider) onto the #44 line,
then close #34 with a comment pointing at the port commit.

### #35 — remotion videos (draft, base stale)

`remotion/` and `public/remotion/` are **byte-identical between main and
#41** — everything this PR contains reached main via #38, including its
three "unique" commits' effects. Vercel preview Ready but CI/base stale.
Action: close as fully absorbed; the PR-body caveats (verify
`durationInFrames` in Remotion studio, replace ffmpeg placeholder music
before publishing) move to the production checklist since the compositions
are live on main.

### #37 — landing Remotion preview (draft, stacked on #35)

Landing video integration is in main (`components/landing/video-preview.tsx`
exists on main; #42 restyles it). Its base is #35's branch, so it
auto-closes when #35 closes. Action: close as fully absorbed.

### #39 — native MDX runtime refactor (open, current base)

Contained in the #41/#42 lineage, and its architectural direction
(host-realm runtime resolution + browser esbuild) is exactly what #44
deletes and replaces with the sandbox contracts. #44's PR body says the
same. Action: close as superseded by #44; no unique content to salvage
beyond what the survival matrix already tracks via #41.

### #40 — remove repopress config files (open, current base)

Still valid: `.repopress/mdx-preview.tsx` + `repopress.config.json` exist on
main and in #44's tree, and #44 doesn't touch them (no conflict either
way). #44 removed the *generation* of these files; this PR removes the
committed *examples*. Owner policy decision — recommend merging it (rebase
optional; the deletion applies cleanly). Note: `repopress.config.json` at
the repo root may still be exercised by tests/fixtures — run CI on a rebased
head before merging.

### #41 — chore/misc-updates consolidation (draft, current base)

Strict superset of #34/#35/#37/#39/#40 plus 14 fix/test commits (June 12
MDX-runtime bug-fix batch, studio sidebar fix, deep-link polish,
feature-grid cleanup). CI green, mergeable clean — but ~90% of its diff
patches the old MDX runtime that #44 deletes. Its remaining unique value is
precisely the 5 at-risk fixes in the survival matrix + the 49-line
`feature-grid.tsx` cleanup (which #42 carries forward anyway). Action: do
NOT merge; port the at-risk fixes to the #44 line, then close with a
pointer. Closing #41 without the ports would silently reintroduce a
data-loss bug (P0 above).

### #42 — editorial design system (draft, current base)

See dedicated section below. Action: do not merge wholesale (30-file
conflict with #44); salvage as a fresh design-only branch on top of #44 per
the salvage plan, then close.

## Fix survival matrix — #41 lineage vs #44's tree

Code-level forensics of the 15 unique #41-lineage commits against #44's tree
(#44 shares zero commits with #41; it deleted the old host-realm runtime the
lineage patched). Verdicts verified by inspecting #44's actual code.

**Moot / independently solved by #44's re-architecture** (no action needed):
f51005f (adapter cache key — subsystem deleted, successor uses SHA-256
content addressing), 5f33199 (sync isolation — detection I/O removed from
sync path), e202a02 (initEsbuild race — esbuild init gone), 82c6040
(frontmatter recompile — preview now inert render model), 4729a96 + 49aa6a2
(resolvedRuntime — field no longer exists), 534fec5 (dead code — file
rewritten), 05e03e8 (TS compiler out of Convex action — #44 solved with
inline regex title extractor), most of the 7282f8d test backfill (targets
deleted modules).

**AT RISK — bugs live in #44's tree today; port these before/with #44:**

| Priority | Lost fix | Where the bug lives in #44 | Impact |
|----------|----------|---------------------------|--------|
| P0 | f8e9853 publish metadata format | `app/api/github/publish-ops/route.ts:122` (`if (!doc.githubSha) continue`), `:159`/`:199` unconditional `matter.stringify` | **Data loss class, wider than the original bug:** publishing any `export const metadata` MDX doc rewrites it as YAML frontmatter — #44 has no format-preservation subsystem at all |
| P1 | 3a097c3 namespace imports | `components/mdx-runtime/transformImports.ts:64-66` — no `ImportNamespaceSpecifier` branch, unconditional `file.fail(...)`; reachable via `components/preview-sandbox/compatible-worker.ts:104` | Regressed from "import dropped silently" to "entire compatible preview fails to compile" on `import * as X` |
| P1 | 4f5a6fc deep-link half | `components/studio/hooks/use-studio-file.ts:205-214` — caches + applies an empty snapshot when tree lacks sha and no cache exists | Deep links opened before tree hydration render an empty editor; regression test `use-studio-file.test.tsx` also missing in #44 |
| P2 | 53be735 sidebar layout | `components/studio/studio-layout.tsx:1406` — `StudioPanelShell` missing `flex flex-col`; children at `:1411`/`:1430` depend on it | File tree doesn't scroll; History/Settings not pinned to bottom |
| P2 | cbea505 folder-picker hardening | `components/edit-project-dialog.tsx:100-103` omits `projectAccessToken` (query fails closed → PAT users blocked); repo `page.tsx` never mints per-project tokens; `components/ui/tree.tsx` lacks button semantics / keyboard nav | Access + a11y hardening lost; riders if ported: 451cbc1's page.tsx rename, `edit-project-dialog.test.tsx` |

Minor notes from the same audit: (a) #44's inline title extractor
(`convex/documents.ts:60`) only reads YAML `title:` — `export const
metadata` titles fall back to filename; (b) `review_diff.patch` is a stray
diff artifact committed at #44's repo root and should be removed; (c)
`esbuild-wasm` in package.json appears to be a dead dependency after #44's
rewrite (successor sandbox uses `ts.transpileModule`).

Design-system confirmation: #44 contains **none** of #42's design work
(`rp-display` / Instrument Serif absent from its `globals.css`,
`opengraph-image.tsx` byte-identical to main, `docs/design-system/` absent)
— the salvage plan below is required, nothing was already carried over.

## PR #42 review — design increment (#41 → #42: 42 commits, 132 files, +3889/−2038)

Scope audit: ~112 of 132 files are pure presentation (token/className/font
sweeps, copy, JSX restructuring without data-flow change); 20 are docs/assets
(`docs/design-system/**`, TTF, icon); 9 files are genuinely behavioral:

- `convex/projects.ts` + `lib/sync-projects.ts` + 2 tests (commit f91bda7):
  sync-resilience — `detectionFailed` flag preserves `detectedFramework`/
  `resolvedRuntime` when runtime detection throws. **Dead-on-arrival against
  #44**, which removed server-side runtime detection entirely; do not port.
- `vitest.config.ts`: `testTimeout: 20000` (CI flake absorption) — keep.
- `next.config.mjs`: `turbopack: { root: import.meta.dirname }` — keep.
- `app/layout.tsx`: fonts switched to CSS-variable mode + `Instrument_Serif`.
- `app/opengraph-image.tsx` rewrite + bundled `app/InstrumentSerif-Regular.ttf`
  (70 KB, correct `new URL(..., import.meta.url)` edge pattern; runtime was
  already edge).
- Studio header refactor: page-level header removed, theme toggle relocated
  into `StudioHeader`; `statusInfo` prop replaced by typed `StatusBadge`.
- Landing `hero.tsx` → client component with reduced-motion-gated
  framer-motion entrance; navbar scroll listener.

Verified clean: all nine deleted utility classes have zero remaining usages;
no raw palette-scale colors introduced (14 black/white instances are
pre-existing shadcn standards); `docs/design-system/` spec exists and the PR
matches it. Only real defect found: stale "See DESIGN.md" comment at
`app/globals.css:15` (DESIGN.md is deleted by the same PR) — fix during the
port.

## Salvage plan for #42 onto #44

Direct overlap between the design increment and #44 is exactly 20 files.

- **Bucket A — lands clean (~112 files):** all `components/ui/*`,
  `components/landing/*`, `components/dashboard/*`, brand/logo, root
  components (dialogs, settings, folder-picker, project/repo cards+rows),
  every app page except layout/studio-editor, `opengraph-image.tsx` + TTF,
  `icon.svg`, `biome.json`, `vitest.config.ts`, copilot-instructions,
  DESIGN.md deletion, `docs/design-system/**`.
- **Bucket B — small manual re-application onto #44-rewritten files (~15
  files, trivial→moderate):** `globals.css` (keep #44's
  `@import "./typeset.css"`), `layout.tsx` (keep #44's RootChrome),
  `next.config.mjs` (re-add turbopack root pin), `studio-header.tsx`,
  `studio-layout.tsx`, `document-list.tsx`, `component-insert-modal.tsx`,
  `preview.tsx`, `PreviewStatus.tsx`, `smart-create-file-dialog.tsx`,
  `gallery-tab.tsx`, `image-field*.tsx`, `repo-setup-form.tsx`,
  `app/docs/studio-editor/page.tsx`. The StatusBadge/statusInfo refactor
  re-applies as designed — #44 still has the statusInfo plumbing.
- **Bucket C — dead, re-express intent instead:** `PreviewRuntime.tsx`
  styling (#44 gutted it to a 39-line shell delegating to `GenericPreview` /
  `SandboxRuntime` — restyle those successors), `repo-jsx-bridge.tsx`
  (deleted in #44, no successor), f91bda7's convex/lib sync-resilience + its
  two sync-test deltas (obsolete; one is an add/add conflict with #44's own
  test file).

Verdict: mechanically salvageable with the curated exclusions above; the
design system core (tokens, fonts, primitives, landing/dashboard/docs/OG)
is entirely in the clean bucket.

<!-- ACTION PLAN -->
