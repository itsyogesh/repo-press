# Open PR Review & Production Readiness Plan — 2026-07-17

Review of all 8 open PRs (#34, #35, #37, #39, #40, #41, #42, #44), their git
relationships, and the recommended sequence to reach a clean base for the
final production-readiness work.

> **Revised 2026-07-18** after the owner's differential review
> (143/143 targeted tests). Corrections incorporated and independently
> re-verified where disputed: the multiline-prop corruption major was a
> false positive (repro: blank lines in quoted attributes parse fine in
> flow context against remark-mdx 3.1.1; only inline-context tags fail,
> unreachable via the single-line UI); the publish metadata issue is
> missing *format provenance* (duplicate metadata / legacy-draft
> conversion), not an unconditional rewrite; the optimistic-lock issue is
> delete-specific; deep links are substantially mitigated by server-side
> initial file loading; #44's tree controls do support Enter/Space; #37
> must be closed explicitly; and one missed finding was added (title-sync
> HTTP 500s recorded client-side as success).

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
  **#44 is the keeper; #42's design work gets salvaged on top.** The
  survival audit found **5 fixes from the #41 lineage genuinely missing in
  #44** — two blocker-class (publish metadata format provenance,
  namespace-import handling) — that must be ported.
- #44's architecture claims held up under adversarial domain reviews
  (installs, integrity, sandbox, auth), but the reviews surfaced **7 major
  robustness bugs** to fix before merge.
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
- #37's base is `feature/remotion-videos`, not main — close it explicitly
  (closing #35 alone does not auto-close it).
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
and the survival audit found the access-token wiring genuinely missing in
#44 (see matrix: P3; the a11y half was overstated — #44's tree already
handles Enter/Space). Action: port `cbea505` (+ its 451cbc1 rider) onto the
#44 line, then close #34 with a comment pointing at the port commit.

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
exists on main; #42 restyles it). Its base is #35's branch — note closing
#35 does **not** auto-close #37 (that only happens if the base *branch* is
deleted). Action: close #37 explicitly as fully absorbed.

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
pointer. Closing #41 without the ports would silently reintroduce the
blocker-class publish provenance and namespace-import bugs (P0/P1 above).

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
| P0 | f8e9853 publish metadata format | `app/api/github/publish-ops/route.ts` — per-doc `matter.stringify(body, frontmatter)` with no record of the source file's metadata format | **Missing format provenance** (confirmed blocker, corrected framing): depending on how a doc entered Convex, publish either prepends YAML over a body that still embeds `export const metadata` (duplicate metadata) or converts legacy drafts' metadata to YAML. Not an unconditional rewrite of every metadata doc |
| P1 | 3a097c3 namespace imports | `components/mdx-runtime/transformImports.ts:64-66` — no `ImportNamespaceSpecifier` branch, unconditional `file.fail(...)`; reachable via `components/preview-sandbox/compatible-worker.ts:104` | Confirmed blocker: regressed from "import dropped silently" to "entire compatible preview fails to compile" on `import * as X` |
| P2 | 53be735 sidebar layout | `components/studio/studio-layout.tsx:1406` — `StudioPanelShell` missing `flex flex-col`; children at `:1411`/`:1430` depend on it | File tree doesn't scroll; History/Settings not pinned to bottom |
| P3 | 4f5a6fc deep-link half | `components/studio/hooks/use-studio-file.ts:205-214` — caches + applies an empty snapshot when tree lacks sha and no cache exists | **Downgraded after correction:** the studio page server-loads the deep-linked file at the pinned SHA (`page.tsx:140,164`), so deep links are substantially mitigated. Residual: the client cache path + missing `use-studio-file.test.tsx` regression test |
| P3 | cbea505 folder-picker hardening | `components/edit-project-dialog.tsx:100-103` omits `projectAccessToken` (query fails closed → PAT users blocked); repo `page.tsx` never mints per-project tokens | **Narrowed after correction:** the a11y half was overstated — #44's `components/ui/tree.tsx` already has `role="button"`, `tabIndex={0}`, and Enter/Space handling (`:280-299`). Remaining substance is the access-token wiring; riders if ported: 451cbc1's page.tsx rename, `edit-project-dialog.test.tsx` |

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

## PR #44 review — safe MDX component ecosystem (73 commits, 192 files, +31.6k/−6k)

Four independent domain reviews (Convex boundary, registry/integrity libs,
GitHub API routes, studio edit/discovery libs) plus a direct review of the
init-actions hardening. CI green at head `4076760`.

### Headline claims — verification results

| Claim | Verdict | Evidence |
|-------|---------|----------|
| Registry installs write only to a dedicated branch + PR, never the base branch | **Verified** | Branch forced to `repopress/install/` prefix from a pinned SHA; `batchCommitAtExpectedHead` refuses the protected base branch and fast-forwards with `force:false`; PR head/base re-verified after creation; collision resumes are tree-verified (SHA-1 recomputed locally) or 409 |
| Integrity-pinned registry artifacts | **Verified (install-time)** | SHA-256 over a domain-separated, length-framed manifest+bytes construction; fails closed at resolver, planner, and lock layers. Gap: integrity is *not* re-verified when the committed lock is later loaded for Studio metadata (declarative-only exposure) |
| No SSRF / fetch containment | **Verified** | Only non-GitHub server fetch is the registry, allowlisted to exact `repopress.dev` URLs, redirects re-validated per hop, size/type/timeout caps |
| Route auth, no server-credential injection, Convex ownership | **Verified** | Every GitHub call uses the caller's own token; new Convex actions derive the actor server-side from the token, cross-check the session, require editor + push/admin, and rate-limit. This *fixes* main, where `syncTreeTitles` had no authorization at all |
| No repository-code execution in the Studio/host realm | **Verified** | Generic preview is an inert render model (raw HTML → name-only placeholders, expressions/ESM dropped, URL schemes allowlisted, no `dangerouslySetInnerHTML`); source edits are parser-anchored with snapshot equality + offset re-verification (offsets empirically confirmed exact for astral/CRLF/tab input); compatible execution only via the sandbox worker path |
| Exact-SHA reads | **Partial** | Verified for install / title-sync / gallery-scan (40-hex `readRef`, ancestor-proven). publish-ops still reads via mutable branch refs (prefetch at `baseBranch`, commit re-resolves `heads/<branch>`). Framing corrected: mutable refs are not inherently an exact-SHA violation here — the defect is *ambiguous reads with no durable link between the state that was checked and the state that gets committed* |
| Convex conventions (CLAUDE.md) | **Pass with nits** | Ownership checks, `v.id` FKs, indexes, state machine, getOrCreate all hold; `githubActionRateLimits` table omits `createdAt` |

### Major findings — fix before merge

Theme: new fail-closed validation converts previously-graceful degradation
into permanent, project-wide outages; plus one state-consistency bug in
publish.

1. **Publish/commit ordering (delete-specific)** —
   `convex/explorerOps.ts:405-407` +
   `app/api/github/publish-ops/route.ts:338→377`: `markCommitted`'s
   `expectedUpdatedAt` optimistic lock throws *after* the irreversible
   GitHub commit. Scope corrected: the lock only guards
   `deleteAssociations`, so the failure requires a concurrent edit to a doc
   tied to a *staged delete* — but when it fires, GitHub has the commit/PR
   while every op stays `pending`, and a retry re-commits already-committed
   operations.
2. **Title sync bricks per project (legacy paths)** —
   `convex/documents.ts:881-889`: one legacy row whose stored path isn't
   under the *current* `contentRoot` (mutable via project update/config
   sync) throws `DOCUMENT_OUTSIDE_CONTENT_ROOT` and aborts every title sync
   for the project; the same resolution crashes the studio render.
3. **Title sync fails whole-batch on a single outlier file** —
   `convex/documents.ts:915,929-932`: one file rejects the batch
   `Promise.all` where main skipped per-file. Two distinct modes (framing
   corrected): a markdown file >256KB (or >1MB GitHub no-encoding
   response) is a *deterministic* per-project failure; a *transient* fetch
   failure is not permanent by itself but becomes **session-sticky**
   because the client records HTTP 500 as success
   (`components/studio/hooks/use-studio-queries.ts:89-91` chains
   `.then(() => { entry.status = "done" })` with no `response.ok` check),
   so the failed sync is never retried and never surfaced.
4. **Gallery scan bricks per repo** — `convex/mediaGallery.ts:45,72,202`:
   every tree entry repo-wide is hard-validated *before* the image filter,
   so one filename with a Unicode format char/backslash/scheme-like prefix —
   or >20k entries or a truncated tree — permanently breaks scanning.
   Validate-and-skip for non-image entries preserves the invariant without
   the outage. (Compounding: the rate limiter is consumed before these
   deterministic failures and never refunded — findings 2-4 also lock users
   out at 4/min / 2/min while nothing can succeed.)
5. **Studio page crash on exotic component names** —
   `lib/studio/component-discovery.ts:28-30` +
   `lib/studio/authoring-catalog.ts:562/576` +
   `components/studio/editor.tsx:140-146`: a valid-MDX dashed/namespaced
   component (`<Ab-cd />`, `<Ab:cd />` — confirmed to parse in remark-mdx
   3.1.1) passes discovery but throws in `validateMdxName` above the error
   boundary — opening/typing such a document crashes the whole Studio page.
6. **`getFile` conflates 404 with failure, bypassing publish conflict
   detection** (elevated to blocker in the differential review) —
   `lib/github.ts:166-172` returns `null` on *any* error, so a transient
   GitHub 5xx/rate-limit during publish prefetch makes `existing`
   undefined and skips the sha-conflict check. Framing corrected: this does
   not clobber the base branch directly — it produces an *unflagged
   overwrite on the publish branch* that a later merge can land. Fix shape:
   typed reads where only 404 means absent; any other failure aborts the
   publish.
7. **HTML comment empties the preview** —
   `lib/preview/generic-render-model.ts:108-112,728-764`: any
   `<!-- comment -->` makes the whole document a PARSE_ERROR and the
   placeholder fallback yields zero blocks — a plain `.md` with one comment
   renders a completely empty preview with no diagnostic.

### Ports required from the #41 lineage (see survival matrix)

Blocker-class: P0 metadata format provenance (f8e9853 semantics — record
and preserve each doc's source metadata format to prevent duplicate
metadata / legacy-draft conversion on publish) and P1 namespace-import
handling (3a097c3). Non-blocking: P2 sidebar flex layout (53be735), P3
deep-link residual + regression test (4f5a6fc), P3 folder-picker
access-token wiring (cbea505 + 451cbc1 rider).

### Selected minor findings (fast-follow backlog)

- Multiline prop values (reclassified from major — false positive per the
  differential review, confirmed by repro): blank lines inside quoted JSX
  attributes parse fine in *flow* context on remark-mdx 3.1.1 (incl. CRLF);
  only *inline-context* tags fail (`Unexpected end of file in attribute
  value`), and the single-line `<Input>` prop form can't produce them.
  Residual hardening: `editComponentProp`
  (`lib/studio/mdx-source-edit.ts:611-616`) still returns `ok:true` without
  re-parsing the edited result — add a post-edit re-parse guard.
- PAT-only users: the new Convex actions hard-require a Better Auth account
  and surface all authz failures as generic 500s — a deliberate access-model
  change hidden as a server error (`convex/lib/githubActionAccess.ts:35-44`).
- `lib/project-access-role.ts:14`: project ownership now takes precedence
  over the GitHub-derived role — a creator whose repo access was revoked
  still passes editor gates (contained by their token failing at GitHub).
- Install route: no rate limiting (~136 sequential reads per request);
  same-origin `Origin` check 403s behind TLS-terminating proxies; failed
  installs strand `repopress/install/*` branches (nothing calls
  `deleteBranchRef`).
- Insert path still uses the permissive serializer — brace-wrapped strings
  (including registry `default`s) become raw JSX expression source
  (`components/studio/component-insert-modal.tsx:294,314`); the strict
  `formatSafeLiteralPropValue` exists but is only used for edits.
- NFC path normalization breaks byte-exact matching for NFD (macOS-created)
  filenames (`lib/preview/path-policy.ts:46-49`).
- Lock integrity not re-verified at load; `~/`-alias projects silently
  un-installable; masking-scanner quote-state bug drops discovery on prose
  apostrophes; `truncated` response field now dead; rate-limit table missing
  `createdAt`.

### Hygiene

`review_diff.patch` committed at the repo root (junk — remove);
`esbuild-wasm` appears to be a dead dependency after the sandbox rewrite;
the new inline title extractor drops `export const metadata` title support
(falls back to filename).

### #44 verdict

The architecture is real and the safety claims substantiate under
adversarial review — this is the right base for production. It is **not
mergeable today**: one fix round is needed (7 majors + P0/P1 ports +
hygiene), then it merges and everything else rebases onto it.

## Action plan — getting to the production-readiness start line

**Phase 0 — repo hygiene (no code risk, do immediately)**
1. Close #35 and #37 (fully absorbed into main; carry their PR-body caveats
   — verify Remotion `durationInFrames`, replace placeholder music with
   licensed audio — into the launch checklist below).
2. Close #39 (superseded by #44's architecture; content preserved in the
   #41/#42 lineage).
3. #40: owner decision — recommend merge after a rebase + CI run (confirm no
   test/fixture reads the root `repopress.config.json`).
4. Comment on #34/#41/#42 linking this review; keep them open until their
   salvage ports land, then close with pointers.

**Phase 1 — #44 fix round → merge (the gate for everything else)**
1. Fix the confirmed blockers on the #44 branch: majors 1-7 above
   (delete-reconciliation ordering, title-sync/gallery single-outlier
   failure modes, exotic-name Studio crash, `getFile` 404/failure
   conflation, HTML-comment empty preview) plus the client-side
   sync-status `response.ok` guard.
2. Port the survival-matrix blockers: metadata format provenance (P0) and
   namespace-import handling (P1); schedule the P2/P3 ports (sidebar
   layout, deep-link residual + test, folder-picker token wiring) in the
   same round or as immediate fast-follows.
3. Hygiene: drop `review_diff.patch`, remove `esbuild-wasm` if confirmed
   dead, restore metadata-title extraction or document the regression.
4. Re-run CI + the host-execution guard; then merge #44 into main.
5. Close #34, #39, #41 with pointers to the port commits.

**Phase 2 — design salvage (after #44 merges)**
1. Fresh branch from main; apply #42's increment per the salvage plan
   (Bucket A mechanical ~112 files; Bucket B hand-apply ~15 files; Bucket C
   re-express preview styling on `GenericPreview`/`SandboxRuntime`).
2. Exclusions: skip f91bda7's convex/lib sync-resilience (obsolete under
   #44); keep the vitest `testTimeout` and turbopack root pin; fix the stale
   `DESIGN.md` comment at `app/globals.css:15`.
3. Open the fresh design PR; close #42 with a pointer.

**Phase 3 — auth branch + dependency remediation (parallel with Phase 2)**
1. Open a PR for `fix/login-auth-redirects` keeping `8bf276e` (login
   redirect + proxy session-cookie signals, tested); drop or redo `681df36`
   (no `bun.lockb` in an npm repo; keep `package-lock.json` authoritative).
2. Replace the `"latest"` version ranges in package.json with real pinned
   semver for `better-auth`, `@convex-dev/better-auth`, `convex`,
   `@octokit/rest`.
3. Execute the documented dependency upgrades: better-auth 1.4.9 → ~1.6.23
   with @convex-dev/better-auth 0.10.10 → ~0.12.5 (full
   OAuth/session/PAT/Convex auth matrix rerun), Next.js 16.0.10 → patched
   16.x (~16.2.10) (proxy/auth/RSC/Server Action/build regressions), then
   burn down the `npm audit --omit=dev` backlog per the staged plan.

**Phase 4 — launch checklist (final production readiness work)**
- Fast-follow backlog: file issues for the minor findings above (PAT 500s,
  owner-precedence flip, install route rate limit/Origin check/branch
  cleanup, insert-path serializer, NFD paths). Publish prefetch error
  handling is intentionally NOT here — it is the Phase 1 typed-reads
  blocker.
- Remotion: verify composition durations in `remotion studio`; replace
  ffmpeg-generated placeholder music with licensed audio before publishing.
- Decide deployment protection / domains on Vercel; review the recorded
  build warnings (Sentry deprecations, OpenTelemetry duplication, baseline
  browser mapping).
- Re-run `convex-security-audit` style checks on the post-merge tree and
  keep the host-execution guard in CI.
