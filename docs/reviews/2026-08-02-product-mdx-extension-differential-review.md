# RepoPress Product MDX Extension Differential Review

## Executive Summary

| Severity | Open | Resolved during review |
|---|---:|---:|
| Critical | 0 | 0 |
| High | 0 | 0 |
| Medium | 0 | 1 |
| Low | 0 | 1 |

**Overall risk:** Low for the implemented first batch; the complete feature remains non-mergeable until its authenticated resolver, Studio orchestration, and browser E2E are implemented.

**Recommendation:** Conditional approval of commits `c873ee7`, `0fa5ea0`, and `299eb29` after the two review corrections below. Keep PR #44 in draft until the remaining plan is complete.

**Key metrics:**

- Commit range reviewed: `origin/docs/mdx-native-preview-architecture..299eb29`
- Files analyzed: 20/20 changed files; 100% of security-sensitive production changes
- Source size: 535 JavaScript/TypeScript production and test files, so the review used a surgical high-risk strategy
- Focused gate before review corrections: 8 files / 158 tests passing, TypeScript clean
- Security regressions detected: 0
- Removed security controls: 0

## What Changed

The six-commit range adds an approved architecture and the first three implementation layers:

1. a strict product-preview request/response contract and canonical signed wire;
2. a server-only P-256 signing boundary;
3. a frozen `@repopress/preview` capability module rendered only inside the existing locked worker;
4. eight inert framework-neutral primitives and RepoPress-owned static styling.

The range adds 1,904 lines and removes 8 lines across 20 files. The eight removals only replace a TypeScript authority type with an equivalent strict Zod schema and wrap the inert render tree in a style-scoping element. No authorization, verification, containment, rate-limit, or sanitizer control was removed.

| Area | Risk | Blast radius | Review result |
|---|---|---|---|
| `compatible-signing.server.ts` | High: private key and signatures | One planned server route | Approved after source-budget correction |
| `compatible-artifact.ts` | High: approval and transport authority | Compatible frame and worker pipeline | Existing verification invariants preserved |
| `compatible-worker.ts` | High: untrusted repository execution | Compatible sandbox only | Capability map stays frozen and worker-contained |
| `product-extension.ts` | Medium: public API validation | Planned Studio hook and server route | Approved after control-character correction |
| `compatible-render-tree.tsx` | Medium: final DOM projection | Compatible sandbox only | Still restricted to inert tags and props |
| Types and CSS | Low | Product preview presentation | No repository style or URL channel introduced |

## Resolved Findings

### Medium: Signer accepted artifacts the verifier would reject for size

**Files:** `lib/preview/compatible-signing.server.ts:111`, `lib/preview/compatible-artifact.ts:176`  
**Introduced by:** `0fa5ea0`  
**Blast radius:** Low today (no production caller); one authenticated preview route after Task 4  
**Test coverage:** Added

The structural artifact schema intentionally does not allocate against all source-size limits because the untrusted wire verifier performs a cheap preflight. The new trusted producer originally parsed that structural schema and immediately hashed and signed it. An authenticated editor controlling a repository preview entry could therefore make the server digest an adapter larger than the verifier's 256 KiB per-file or 768 KiB source-closure budgets. The resulting approval could not render, but repeated requests could consume unnecessary memory and CPU.

The correction adds `assertCompatibleSourceArtifactWithinBounds()` using the verifier's existing UTF-8 limits and invokes it before private-key parsing, digesting, or signing. A regression test proves an oversized adapter is rejected.

### Low: Repository preview paths admitted control characters

**File:** `lib/preview/product-extension.ts:14`  
**Introduced by:** `c873ee7`  
**Blast radius:** Planned resolver route only  
**Test coverage:** Added

The path contract rejected absolute paths, backslashes, empty segments, and dot traversal, but still accepted C0/DEL control characters. GitHub can represent unusual filenames, but accepting control characters in this security-sensitive configuration path creates ambiguous diagnostics and unsafe downstream encodings without helping the product-extension use case.

The correction rejects `U+0000` through `U+001F` and `U+007F`; tests cover newline and NUL paths.

## Adversarial Analysis

**Attacker model:** An authenticated project editor who controls content and `.repopress` files in their connected repository, but does not possess the RepoPress private signing key and cannot execute code in the Studio host realm.

**Relevant entry point:** The planned authenticated `POST /api/preview/compatible` route.

**Attempted attacks and outcomes:**

1. **Swap source under a valid signature.** Fails because document and adapter bytes are hashed into `executableDigest`, the digest is part of the signed approval payload, and the browser and sandbox independently recompute it.
2. **Replay an approval across project, commit, session, or snapshot.** Fails because each value is signed and independently supplied as expected authority by the Studio frame.
3. **Import framework/network capabilities.** The worker only resolves React, JSX runtimes, existing fixed shims, and the frozen `@repopress/preview` module. Task 4 must additionally reject unsupported imports before signing.
4. **Navigate or fetch through `PreviewAction`/`PreviewImage`.** Fails because these primitives emit only spans, figures, static classes, and text. They do not emit `a`, `button`, `img`, URL attributes, styles, or event props.
5. **Mutate the capability module or poison intrinsics.** The module, nested option maps, functions, React shim, and JSX runtime are deep-frozen. Worker code uses captured intrinsics and the final tree is sanitized again in the navigable iframe before React rendering.
6. **Force unbounded signing work.** Closed by the review correction that applies the verifier's source budgets before digest/sign operations.

No attack path was found from repository code to the Studio/Next.js host realm, parent navigation, browser network APIs, persistent storage, or the signing key.

## Test Coverage Analysis

Every new callable production boundary has direct coverage:

- request and response validation: strictness, commit shape, source size, snapshot bounds, authority pairing;
- signing: key type/capability, malformed configuration, low-S raw signatures, expiry, authority/source mutation;
- capabilities: exact exported names/options, freezing, namespace containment, deterministic downgrade;
- render projection: navigation/media/event/style stripping, size/depth budgets, scoped primitive rendering;
- source-boundary regression guard: private key remains in a `server-only` module with no client import.

The current tests do not yet cover route authorization, immutable Git reads, stale fetch responses, or real browser orchestration because those are Tasks 4, 5, and 9. Those omissions block final merge approval but are not missing tests for code already shipped in this batch.

## Blast Radius Analysis

| Function/surface | Production callers now | Planned callers | Risk |
|---|---:|---:|---|
| `signCompatiblePreviewResolution` | 0 | 1 server route | High, tightly scoped |
| `serializeSignedCompatiblePreviewResolution` | 0 | 1 server route | Medium |
| `compatiblePreviewRequestSchema` | 0 | Route and Studio hook | Medium |
| `@repopress/preview` worker module | 1 worker evaluator | Same | High, sandbox-contained |
| `CompatibleRenderTreeView` style wrapper | 1 sandbox runtime | Same | Low |

The new execution surface does not add any host-realm adapter import. Existing regression guards still scan all production source files for preview-sandbox and repository-adapter execution edges.

## Historical Context

The baseline compatible pipeline was introduced by `9b705c3` to remove repository execution from Studio, then hardened by `841e8a6`, `7265cfa`, `7e84861`, `f7f83c7`, and `5aa17db`. Those commits established the invariants preserved here:

- untrusted repository source executes only in the non-navigable locked worker;
- only inert tree data crosses to the iframe renderer;
- the iframe re-sanitizes the tree;
- authority is exact and independently supplied;
- signatures use bounded low-S raw P-256 values;
- capability and namespace exports are frozen null-prototype objects;
- unsupported behavior records a bounded fidelity loss or fails closed.

No code previously removed by those security commits was reintroduced into the host realm.

## Recommendations

### Immediate

- [x] Apply source budgets before signing.
- [x] Reject control characters in product-preview repository paths.
- [ ] Commit the review corrections and rerun the combined focused gate.

### Before PR #44 is mergeable

- [ ] Authenticate the resolver against the server-loaded project and require editor access.
- [ ] Pin both branch-head confirmation and adapter reads to the exact requested 40-hex commit.
- [ ] Statically reject dynamic, relative, framework, alias, and nonliteral imports before signing.
- [ ] Keep Generic preview as the initial and failure state; reject stale compatible responses.
- [ ] Prove the exact Merry adapter head in a real browser and publish/close/recovery flow.
- [ ] Run the complete test, typecheck, lint, build, Convex codegen, and CI gates.

## Analysis Methodology

**Strategy:** Surgical high-risk review of a 535-file codebase.

**Coverage:** All 20 changed files were inspected. High-risk production changes and their one-hop dependencies received line-by-line, history, caller, test, and adversarial analysis. Documentation and CSS received a surface review. External dependency internals (`server-only`, Web Crypto, TypeScript transpilation) were not re-audited; their use was validated through integration tests.

**Techniques:** Diff classification, history/blame of the compatible security boundary, caller search, removed-control scan, executable-budget comparison, signature mutation tests, worker containment tests, DOM output inspection, and concrete attacker modeling.

**Confidence:** High for this first implementation batch; medium for the eventual end-to-end feature until the route, Studio hook, Merry repository adapter, and browser test exist.
