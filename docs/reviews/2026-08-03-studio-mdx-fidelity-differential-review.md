# RepoPress Studio MDX Fidelity — Final Differential Security Review

**Review date:** 2026-08-03
**Commit range:** `origin/main...cb0ec6b` (`4dd8348..cb0ec6b`)
**Branch:** `fix/studio-mdx-fidelity`
**Strategy:** FOCUSED (medium TypeScript/JavaScript codebase; 75 changed files)
**Overall risk:** **LOW**
**Recommendation:** **APPROVE**

## Executive Summary

| Severity | Count |
|---|---:|
| Critical / P0 | 0 |
| High / P1 | 0 |
| Medium / P2 | 0 |
| Low / P3 | 0 |

Final head materially strengthens the reviewed boundaries. Unsupported metadata remains immutable and publish-revalidated; compatible MDX still executes only in a short-lived capability-free worker; the iframe accepts only inert, bounded render data over a session/snapshot-bound port; external image resolution remains SSRF/rebinding resistant; and commits `52304c5`/`cb0ec6b` add server-side image validation plus durable byte and decoded-pixel budgets.

The earlier functional blocker is resolved. The sandbox no longer relies on a repository-authored root: `e881b44` converts `PreviewDocument` into a worker-owned, WeakSet-authenticated presentation selection and always synthesizes the final `<article>` itself. The exact Merry fixture now receives a bounded article/warm reading surface without allowing arbitrary wrapper markup, CSS, events, URLs, or child replacement.

The previous direct-route budget finding is resolved. Every authenticated asset request must reserve a Convex-backed per-user/project budget before GitHub or external I/O: eight attempts, three concurrent reservations, 12 MiB and 48 million decoded pixels per one-minute window, with transactional settlement, abort, migration-safe fallback, and TTL cleanup.

The decoded-work finding is also resolved. Each image is limited to 12 million pixels per frame and 16 million pixels across animation pages. Sharp returns the exact validated aggregate pixel count; the route must transactionally settle that value before returning bytes. Each active reservation pessimistically holds 16 million pixels, and the one-minute per-user/project window cannot exceed 48 million. Individually compressed images can no longer multiply into an unaccounted snapshot-wide decode workload.

No sandbox escape, DOM injection, metadata evaluation, source-authority bypass, publish corruption, SSRF/DNS-rebinding bypass, cross-user budget mutation, or stale-session asset injection was found.

### Key metrics

- **75/75 changed files triaged**: 9,908 additions, 922 deletions across 33 commits.
- **44 non-test files** and **31 test/fixture files** classified.
- **100% of High-risk changes deep-reviewed**, including one-hop callers and state cleanup.
- Final-head adversarial verification: **15 files / 488 tests passed**; the focused pixel/budget slice was **2 files / 44 tests**.
- TypeScript verification: `tsc --noEmit` passed.
- `git diff --check origin/main...cb0ec6b` passed.
- Security regressions detected: **0**.

## What Changed

### Commit timeline

| Slice | Commits | Security relevance |
|---|---|---|
| Ratified design | `0aaeb8b` | Defines source preservation and sandbox/image invariants |
| Static metadata parsing | `38e754f`–`f509518` | Non-evaluating bounded parser; unsupported syntax fails closed |
| Studio authority and publish | `cbec675`–`b77b21b` | Tri-state source authority, mutation guards, exact-byte relocation |
| Route tree and edge-to-edge UI | `aee7b69`–`aa3c97c` | Presentation-only tree transform and preview sizing |
| Inert images and asset bridge | `2491a9e`–`34a66b0` | Bounded references, authenticated reads, SSRF-safe fetch, blob-only sandbox delivery |
| Portable product primitives | `7680949`, `1bf7a7b` | Small inert component vocabulary and paper semantics |
| Portable document surface | `0f3a481`, `e881b44` | Reading surface added, then hardened so the worker owns root identity and children |
| Image workload and route budgets | `52304c5` | Sharp metadata bounds plus durable Convex attempt/concurrency/byte accounting |
| Guidance and exact Merry fixture | `91da084` | Documents the final boundary and synchronizes the product fixture |
| Aggregate decoded-pixel hardening | `cb0ec6b` | Lowers per-image work and transactionally reserves/settles a 48M-pixel window |

### Risk-classified file coverage

**High risk — deeply reviewed**

- `app/api/github/publish-ops/route.ts`
- `app/api/media/download-external/route.ts`
- `app/api/preview/asset/route.ts`
- `components/mdx-runtime/CompatiblePreviewFrame.tsx`
- `components/preview-sandbox/SandboxRuntime.tsx`
- `components/preview-sandbox/compatible-render-tree.tsx`
- `components/preview-sandbox/compatible-worker.ts`
- `components/studio/hooks/use-studio-file.ts`
- `components/studio/studio-layout.tsx`
- `convex/documents.ts`
- `convex/previewAssetBudgets.ts`
- `convex/projects.ts`
- `convex/schema.ts`
- `lib/content-metadata.ts`
- `lib/github.ts`
- `lib/preview/asset-budget-policy.ts`
- `lib/preview/image-source-policy.ts`
- `lib/preview/preview-capabilities.ts`
- `lib/preview/sandbox-protocol.ts`
- `lib/publish-content.ts`
- `lib/server/external-image.ts`
- `lib/server/preview-image-workload.ts`
- `next.config.mjs`
- `package.json` and `package-lock.json` (new direct `sharp` workload validator and pinned `undici` fetch transport)

**Medium risk — reviewed for mutation bypasses, authority propagation, and unsafe rendering defaults**

- `components/studio/command-palette.tsx`
- `components/studio/editor.tsx`
- `components/studio/file-context-menu.tsx`
- `components/studio/file-tree-item.tsx`
- `components/studio/file-tree.tsx`
- `components/studio/frontmatter-panel.tsx`
- `components/studio/hooks/use-studio-queries.ts`
- `components/studio/insert-component-modal-context.tsx`
- `components/studio/insert-jsx-button.tsx`
- `components/studio/preview.tsx`
- `components/studio/studio-header.tsx`
- `components/studio/studio-save-shortcut.ts`
- `components/studio/studio-toolbar.tsx`
- `lib/studio/route-document-tree.ts`
- `app/typeset.css`
- `convex/_generated/api.d.ts`

**Low risk — diff-triaged**

- `docs/plans/2026-08-03-studio-mdx-fidelity-design.md`
- `docs/plans/2026-08-03-studio-mdx-fidelity.md`
- `docs/plugins_guide.md`
- all 31 changed test and fixture files under `__tests__` or named `*.test.*`

## Deep Boundary Review

### Metadata and Git publish authority

`lib/content-metadata.ts` recognizes only a static JSON-compatible subset and never evaluates repository code. It rejects accessors, cycles, prototype-pollution keys, unsupported continuations and syntax, and applies payload, node, depth, key, array, and string budgets. Unsupported frontmatter or metadata exports return an immutable exact-source representation.

That result is enforced twice. Studio holds `unknown | editable | read-only` authority and blocks editor, command-palette, insert, save-shortcut, and frontmatter mutations until authority is established. `app/api/github/publish-ops/route.ts` then independently parses the pinned Git snapshot. Unsupported existing content may publish only with exact raw-body preservation; relocation requires one unclaimed staged delete matching the source SHA and bytes.

History shows the publish scanner originated in security/integrity work (`8d4568d`, `7996c57`, `bff2957`) and was centralized and strengthened here, not removed. No access-control or pinned-authority regression was found.

### Worker-owned document presentation

`0f3a481` initially introduced an adapter `Document` wrapper. The same review range hardens it in `e881b44`:

- adapter exports are read only through stable own data descriptors;
- inherited properties and accessors are ignored, and proxy failures fall back;
- `PreviewDocument` creates a frozen WeakSet-owned selection, not an element/root;
- selection values are limited to `article | wide` and `default | warm`;
- an exact opaque child sentinel must occur once, so omission, duplication, or substitution falls back;
- repository-authored `Document` cannot return arbitrary markup as the root;
- the trusted worker synthesizes the final fixed-class `<article>` after document evaluation.

Tests exercise named/default/adapter exports, inherited values, accessors, proxies, prototype pollution, arbitrary roots, omitted and duplicated children, exceptions, recursion, and malicious active markup. The iframe sanitizer remains a second boundary and removes events, styles, URLs, active/network/media/frame/form/navigation elements, refs, and dangerous HTML.

The associated CSS supplies bounded width, responsive padding, semantic typography, overflow handling, and product-selectable tone without accepting repository CSS. The exact Merry fixture renders one worker-owned warm article containing all five product primitives.

### Authenticated image resolution

The route requires project editor authority, verifies the project's current base head equals the signed artifact commit, and reads repository assets at that exact SHA. External sources pass the shared SSRF-safe downloader: strict HTTP(S), no credentials/fragments, public-only IPv4/IPv6 DNS answers, DNS-pinned Undici connection, redirect revalidation, HTTPS downgrade rejection, one five-second deadline, streamed 4 MiB bound, MIME allowlist, and magic-byte agreement. SVG remains excluded.

`52304c5` adds a second format check with `sharp(...).metadata()` and fails closed for malformed data, unexpected decoder format, non-AV1 HEIF, missing dimensions, excessive width/height, excessive per-frame pixels, excessive frames/pages, or excessive aggregate pixels. `cb0ec6b` lowers the frame limit to 12 million pixels, limits each image/animation to 16 million aggregate pixels, and returns that exact validated value for durable settlement.

### Durable route budgets

The public Convex mutations require the server HMAC proof before state access. `begin` validates the project and actor, serializes a budget row through Convex transactions, deletes stale reservations, enforces attempt/concurrency/reserved-byte/reserved-pixel limits, schedules TTL cleanup, and increments attempts even when later I/O fails. `settle` binds reservation, project and user, validates actual bytes and decoded pixels, rechecks both window totals transactionally, then accounts both values and deletes the reservation. `abort` releases only an exact project/user reservation; an uncertain cleanup remains bounded by TTL. Project deletion removes reservations before budgets.

The asset route reserves only after editor authorization and before branch/GitHub/external I/O. It returns image bytes only after exact decoded-work settlement succeeds, and fails closed with 429 on exhaustion or 503 on uncertain reservation/settlement state. Active reservations pessimistically hold the maximum byte and pixel work, so concurrent requests cannot oversubscribe either limit. Legacy rows without pixel fields are handled fail-closed: prior attempts consume the old window, old active reservations reserve the maximum, and old reservations cannot settle. This resolves the previous bypass in which a direct HTTP caller could ignore host budgets and closes the cross-image decode gap.

## Final Findings

No P0, P1, or P2 finding remains at `cb0ec6b`.

The aggregate decoded-image scenario from the prior review is closed by a server-side transactional invariant rather than a trusted-client counter:

```text
consumed decoded pixels
+ active reservations × 16,000,000
+ one new 16,000,000 reservation
<= 48,000,000 pixels per user/project window
```

After Sharp validates the bytes, settlement replaces the pessimistic reservation with the exact aggregate pixel count. The route does not return the body if settlement is missing, expired, mismatched, over-limit, or uncertain. Concurrent begins/settles execute as Convex transactions, abandoned reservations expire, failures abort, and migration-era rows fail closed. The attack that previously combined eight compressed 24-megapixel images can no longer pass the route: one frame is now capped at 12 million pixels, one image/animation at 16 million, and outstanding plus consumed work at 48 million.

The remaining decoder/compositor cost is finite and deliberately bounded. Real-device memory telemetry and later downscaling/re-encoding remain useful defense in depth, but no concrete P2 denial-of-service path remains under the reviewed limits and authorization model.

## Resolved Prior Findings and Blocker

| Prior item | Final-head result |
|---|---|
| Unbounded decoded pixels/frame work per image | **Resolved** by Sharp format, dimension, 12M frame, 16M image/animation and MIME checks |
| Client-only image request/byte budget | **Resolved** by durable Convex per-user/project attempt, concurrency and byte reservations before I/O |
| Missing portable document/reading surface | **Resolved** by worker-owned fixed article root and bounded adapter-selected presentation |
| Cross-image aggregate decoded work | **Resolved** by pessimistic 16M reservations and transactional 48M consumed-plus-active window accounting before response |

## Test Coverage Analysis

Final-head targeted adversarial command covered metadata, publish integrity, GitHub binary reads, SSRF, route authorization and workload validation, durable budget transitions, sandbox protocol, host and iframe state, worker containment, tree sanitization, source authority, capabilities, and the exact Merry extension.

```text
Test Files  15 passed (15)
Tests       488 passed (488)
TypeScript  tsc --noEmit passed
```

Expected stderr came from explicit fail-closed publish tests and did not represent failures.

Strong new negative coverage includes malformed decoders, MIME disagreement, oversized PNG/WebP/AVIF canvases, excessive GIF frames and aggregate frame pixels, exact pixel settlement, 12M frame rejection, fourth-request concurrency refusal, eight-attempt refusal, 12 MiB refusal, 48M decoded-pixel refusal, reservation-to-actual replacement, window reset, abandoned-reservation expiry, settlement identity mismatch, direct-route budget rejection, uncertain settlement, and all adversarial document-root shapes listed above.

## Blast Radius

| Boundary | Production callers | Blast radius | Assessment |
|---|---:|---|---|
| `parseContentFile` | 4 modules / multiple call sites | All MD/MDX reads, title sync and publishes | Fail-closed |
| publish source revalidation | 1 route | Git commit contents and draft reconciliation | Exact pinned authority |
| compatible worker/root | 1 sandbox runtime | All compatible previews | Worker-owned inert root; safe fallback |
| `fetchBoundedExternalImage` | 2 routes | External media egress | SSRF/rebinding resistant |
| `getFileBytesForPublish` | 1 preview route | GitHub image reads/quota | Exact SHA and encoded-byte bound |
| `assertSafePreviewImageWorkload` | 1 preview route | Every compatible image delivery | Exact 12M-frame/16M-image decoded-work result |
| `previewAssetBudgets.begin/settle/abort` | 1 preview route | Per-user/project preview egress, decode work and concurrency | Transactional, identity-bound, pixel/byte reserved, TTL-cleaned |
| sandbox asset protocol | Host + iframe | Cross-origin byte transfer | Session/snapshot/request/source bound |
| route document tree | Studio file tree | Navigation/presentation only | No Git or publish authority change |

## Historical Context

- No validation originating in a prior security fix was removed without replacement.
- The metadata scanner was moved from publish code into a shared bounded parser while preserving pinned format provenance.
- The external downloader replaces older media-route SSRF handling with stricter DNS pinning, IPv6 default-deny ranges, redirect checks, total timeout, and streamed bounds.
- `0f3a481`'s repository-controlled document wrapper was immediately superseded by `e881b44` in the reviewed range. The final root is trusted and worker-owned; history inspection found no reintroduction of the earlier arbitrary-root design.
- `52304c5` adds rather than relaxes the asset route's trust boundaries. Budget rows are also included in project cascade cleanup.
- `cb0ec6b` extends those durable reservations with migration-safe decoded-pixel accounting and lowers the per-image bound; it does not move accounting back into trusted client state.

## Recommendations

### Before production image enablement

- [ ] Load-test Sharp metadata inspection and Convex byte/pixel reservations under the configured serverless concurrency.
- [ ] Capture real-device browser memory telemetry to tune the deliberately finite 12M/16M/48M limits if needed.

### Defense in depth

- [ ] Consider a project-wide/global abuse ceiling in addition to the current per-user/project budget so multiple collaborator identities or many projects cannot multiply egress indefinitely.
- [ ] Run dependency/SBOM vulnerability scanning for the new native `sharp` runtime in the deployment build matrix.
- [ ] Regenerate/confirm `convex/_generated/api.d.ts` against the deployment-connected Convex environment before merge if CI does not already do so.

## Analysis Methodology and Limitations

**Strategy:** FOCUSED. All 75 files were triaged; all High-risk files were read in final form; the final three commits and their one-hop callers/state cleanup were re-reviewed line by line. Analysis included baseline/final diffs, commit history and blame, removed-validation checks, caller search, state-flow tracing, concrete attacker modeling, plan cross-check, and targeted adversarial execution.

**Confidence:** High for source authority, publish integrity, worker/root containment, SSRF, route authorization, protocol validation, and durable byte/pixel budget accounting. Medium for native-decoder internals and real browser memory behavior.

**Limitations:** This pass did not fuzz libvips, conduct a third-party dependency vulnerability audit, benchmark serverless concurrency, or perform live browser memory profiling. It verifies repository tests and source behavior, not deployment configuration or DNS/Vercel/Convex operational state.

## Final Recommendation

**APPROVE.** No P0, P1, or P2 finding remains at `cb0ec6b`. The source-preservation, publish-integrity, worker/root, sandbox protocol, SSRF, authenticated asset, and durable byte/pixel budget boundaries are fail-closed in the reviewed range, and the prior functional/document-surface and image-workload blockers are resolved. The defense-in-depth operational items above do not block merge.
