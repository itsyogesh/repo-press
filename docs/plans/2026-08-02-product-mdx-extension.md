# Product MDX Extension Pilot Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Render Merry Magic Mail's five product-owned MDX components through RepoPress's signed compatible sandbox while keeping authoring, production runtime, and framework bindings portable.

**Architecture:** RepoPress reads a single bounded product preview entry from the authenticated project's immutable base commit, signs the exact document-plus-adapter artifact, and transfers it to the existing opaque sandbox. Product code composes a frozen `@repopress/preview` primitive set; Studio never imports or executes repository code in its host realm and falls back to Generic preview on every failure.

**Tech Stack:** Next.js 16 route handlers, React 19, TypeScript, Zod, Web Crypto P-256, Convex project state, GitHub immutable reads, MDX, Vitest, existing compatible worker/iframe protocol.

---

### Task 1: Define the compatible preview request and response contract

**Files:**
- Create: `lib/preview/product-extension.ts`
- Create: `lib/preview/__tests__/product-extension.test.ts`
- Modify: `lib/preview/compatible-artifact.ts`

**Step 1: Write the failing contract tests**

Cover valid requests and reject:

- unknown fields;
- non-MDX paths;
- non-40-hex base commits;
- empty or oversized source;
- zero, negative, or unsafe snapshot versions;
- unsafe preview entry paths;
- malformed response authority/resolution combinations.

Use a strict request shape:

```ts
{
  projectId: string
  filePath: string
  baseCommitSha: string
  snapshotVersion: number
  documentSource: string
}
```

**Step 2: Run the test and verify RED**

Run: `npx vitest run lib/preview/__tests__/product-extension.test.ts`

Expected: FAIL because the new schemas do not exist.

**Step 3: Implement bounded schemas and canonical wire serialization**

Export:

```ts
export const compatiblePreviewRequestSchema = z.object({ ... }).strict()
export const compatiblePreviewRouteResponseSchema = z.object({
  previewResult: previewResultSchema,
  resolution: z.string().max(COMPATIBLE_ARTIFACT_MAX_BYTES),
  authority: compatiblePreviewAuthorityContextSchema,
}).strict()
```

Add one canonical `serializeSignedCompatiblePreviewResolution()` export to `compatible-artifact.ts`. It must sort adapter sources exactly like digest calculation and must not expose a second signing format.

**Step 4: Run GREEN**

Run: `npx vitest run lib/preview/__tests__/product-extension.test.ts lib/preview/__tests__/compatible-artifact.test.ts`

Expected: PASS.

**Step 5: Commit**

```bash
git add lib/preview/product-extension.ts lib/preview/__tests__/product-extension.test.ts lib/preview/compatible-artifact.ts
git commit -m "feat(preview): define product extension resolution contract"
```

### Task 2: Add a server-only P-256 approval signer

**Files:**
- Create: `lib/preview/compatible-signing.server.ts`
- Create: `lib/preview/__tests__/compatible-signing.test.ts`
- Modify: `lib/__tests__/review-regression-guards.test.ts`
- Modify: `.env.example`
- Modify: `README.md`

**Step 1: Write failing signing tests**

Generate a test P-256 key pair and assert:

- the signer accepts only an EC P-256 private JWK with `sign` capability;
- missing, public-only, wrong-curve, oversized, or malformed key material fails closed;
- the signature is low-S, raw 64-byte P-256 encoded, and accepted by `verifySignedCompatiblePreviewResolution`;
- mutation of project, commit, session, snapshot, expiry, profile, document, or adapter invalidates verification;
- expiry never exceeds five minutes;
- the server-only module is not reachable from client modules.

**Step 2: Run RED**

Run: `npx vitest run lib/preview/__tests__/compatible-signing.test.ts lib/__tests__/review-regression-guards.test.ts`

Expected: FAIL because the signer is missing.

**Step 3: Implement the signer**

Implement:

```ts
export async function signCompatiblePreviewResolution(input: {
  artifact: CompatibleSourceArtifact
  authority: CompatiblePreviewAuthorityContext
  approvalId: string
  keyId: string
  now?: number
}): Promise<SignedCompatiblePreviewResolution>
```

Read `PREVIEW_APPROVAL_PRIVATE_KEY_JWK` only in this `server-only` module. Compute the executable digest with the existing helper, sign `createCompatibleApprovalPayload`, normalize ECDSA `s` to its low-S twin when necessary, validate the final strict schema, freeze, and serialize only through the canonical helper.

Document the server-only private JWK and existing browser public JWK as a matched pair. Never log either value.

**Step 4: Run GREEN**

Run: `npx vitest run lib/preview/__tests__/compatible-signing.test.ts lib/preview/__tests__/compatible-artifact.test.ts lib/__tests__/review-regression-guards.test.ts`

Expected: PASS.

**Step 5: Commit**

```bash
git add lib/preview/compatible-signing.server.ts lib/preview/__tests__/compatible-signing.test.ts lib/__tests__/review-regression-guards.test.ts .env.example README.md
git commit -m "feat(preview): sign compatible product artifacts"
```

### Task 3: Expose frozen framework-neutral preview primitives in the worker

**Files:**
- Create: `lib/preview/preview-capabilities.ts`
- Create: `lib/preview/__tests__/preview-capabilities.test.ts`
- Modify: `components/preview-sandbox/compatible-worker.ts`
- Modify: `components/preview-sandbox/compatible-render-tree.tsx`
- Modify: `components/preview-sandbox/__tests__/compatible-worker-containment.test.ts`
- Modify: `components/preview-sandbox/__tests__/compatible-render-tree.test.tsx`
- Modify: `app/typeset.css`

**Step 1: Write failing capability and containment tests**

Compile a fixture adapter importing named and namespace bindings from `@repopress/preview`. Assert it can render:

```tsx
<PreviewBox tone="info">
  <PreviewStack>
    <PreviewText weight="medium">Title</PreviewText>
    <PreviewAction label="Open" href="/target" />
  </PreviewStack>
</PreviewBox>
```

Test all initial primitives and their bounded enums. Assert:

- the module export map and nested option maps are frozen with null prototypes;
- unknown props/options are ignored or downgraded deterministically;
- actions produce no anchor, button, event, or URL attribute;
- images produce an inert labelled placeholder, never `img` or network attributes;
- no function or repository object crosses the worker boundary;
- existing React and import containment tests remain green.

**Step 2: Run RED**

Run: `npx vitest run lib/preview/__tests__/preview-capabilities.test.ts components/preview-sandbox/__tests__/compatible-worker-containment.test.ts components/preview-sandbox/__tests__/compatible-render-tree.test.tsx`

Expected: FAIL because `@repopress/preview` is unavailable.

**Step 3: Implement the capability module**

Define the public compile-time names and enums in `lib/preview/preview-capabilities.ts`. Mirror their self-contained runtime implementations inside `compatibleWorkerMain`, because that function is stringified and cannot close over imports.

Initial exports:

```ts
PreviewBox
PreviewStack
PreviewInline
PreviewText
PreviewList
PreviewAction
PreviewImage
PreviewIcon
```

Use only already-allowed inert tags and static `repopress-preview-*` class names. Add matching semantic CSS under `[data-compatible-preview]` in `app/typeset.css`; use RepoPress tokens and support dark mode. Do not allow arbitrary styles, raw class injection, navigation, or image requests.

**Step 4: Run GREEN**

Run the command from Step 2 plus `npx vitest run components/preview-sandbox/__tests__/SandboxRuntime.test.tsx`.

Expected: PASS.

**Step 5: Commit**

```bash
git add lib/preview/preview-capabilities.ts lib/preview/__tests__/preview-capabilities.test.ts components/preview-sandbox app/typeset.css
git commit -m "feat(preview): add portable sandbox primitives"
```

### Task 4: Resolve and sign a pinned product preview entry

**Files:**
- Create: `app/api/preview/compatible/route.ts`
- Create: `app/api/preview/compatible/__tests__/route.test.ts`
- Create: `lib/preview/adapter-import-policy.ts`
- Create: `lib/preview/__tests__/adapter-import-policy.test.ts`
- Modify: `lib/github.ts` only if an existing typed immutable read cannot be reused

**Step 1: Write failing route tests**

Mock Convex/project auth and GitHub reads. Cover:

- 401 without an authenticated GitHub credential;
- 403 without project editor access;
- 404 for missing project;
- 409 when the requested base commit is not the current project branch head;
- 422 when no preview entry exists, the entry is absent, the entry path is unsafe, source exceeds limits, or imports are unsupported;
- 503 when signing configuration is missing;
- 200 with a signed compatible result bound to the exact project, base commit, file, document source, session, and snapshot;
- no signing after an ambiguous GitHub read;
- no repository source or internal exception in error responses.

The pilot import policy accepts only:

```ts
react
react/jsx-runtime
react/jsx-dev-runtime
@repopress/preview
```

Reject dynamic imports, `require` with a nonliteral, framework modules, absolute aliases, and relative imports in this first single-file pilot.

**Step 2: Run RED**

Run: `npx vitest run app/api/preview/compatible/__tests__/route.test.ts lib/preview/__tests__/adapter-import-policy.test.ts`

Expected: FAIL because the route and policy are missing.

**Step 3: Implement the route**

Flow:

1. parse the bounded request;
2. load the project with a server query token;
3. call `resolveRouteAuth(project, "editor")`;
4. compare `getBranchHeadSha` with the requested base commit;
5. require `project.previewEntry` and validate it as a normalized repository path;
6. call `getFileForPublish` at the exact commit and require `found`;
7. statically validate imports without executing source;
8. build a one-file `CompatibleSourceArtifact`;
9. sign it and return a strict response containing a `compatible` `PreviewResult`, canonical resolution wire, and authority context.

Use a random 128-bit session ID, monotonically supplied snapshot version, `static-inert-v1`, a maximum five-minute expiry, `Cache-Control: no-store`, and generic public diagnostics.

**Step 4: Run GREEN**

Run the command from Step 2 plus route-auth and GitHub typed-read tests.

Expected: PASS.

**Step 5: Commit**

```bash
git add app/api/preview/compatible lib/preview/adapter-import-policy.ts lib/preview/__tests__/adapter-import-policy.test.ts lib/github.ts
git commit -m "feat(preview): resolve pinned product adapters"
```

### Task 5: Orchestrate Compatible preview from Studio

**Files:**
- Create: `components/studio/hooks/use-compatible-preview.ts`
- Create: `components/studio/hooks/__tests__/use-compatible-preview.test.tsx`
- Modify: `components/studio/studio-layout.tsx`
- Modify: `components/studio/__tests__/preview-compatible-downgrade.test.tsx`
- Modify: `components/studio/__tests__/preview-compile-forwarder.test.ts`

**Step 1: Write failing hook tests**

Using fake timers and mocked fetch, assert:

- no request without project, MDX file, preview entry, or signing public key;
- a bounded debounce coalesces rapid edits;
- request body contains only project ID, file path, exact base commit, snapshot version, and document source;
- non-2xx and invalid response bodies retain Generic preview;
- an older response cannot replace a newer snapshot;
- changing file/project/base commit aborts the old request and resets authority;
- the current Generic render model stays supplied as `fallbackResult` while compatible resolution verifies or renders;
- unmount aborts and releases timers.

**Step 2: Run RED**

Run: `npx vitest run components/studio/hooks/__tests__/use-compatible-preview.test.tsx components/studio/__tests__/preview-compatible-downgrade.test.tsx`

Expected: FAIL because the hook does not exist.

**Step 3: Implement the hook and Studio wiring**

Return:

```ts
{
  previewResult: PreviewResult
  compatibleResolution: string | null
  compatibleAuthority: CompatiblePreviewAuthorityContext | null
}
```

Use the generic result as the initial and failure state. When the route returns a strict current response, pass its compatible result to `Preview`, the generic result as `fallbackResult`, and the resolution/authority pair together. Do not store source or artifacts in Convex or localStorage.

**Step 4: Run GREEN**

Run all Studio preview and hook tests.

Expected: PASS.

**Step 5: Commit**

```bash
git add components/studio/hooks/use-compatible-preview.ts components/studio/hooks/__tests__/use-compatible-preview.test.tsx components/studio/studio-layout.tsx components/studio/__tests__
git commit -m "feat(studio): request signed product previews"
```

### Task 6: Add the Merry product extension

**Repository:** `itsyogesh/merry-magic-mail`

**Files:**
- Modify: `repopress.config.json`
- Replace: `.repopress/mdx-preview.tsx`
- Create: `.repopress/merry-preview.fixture.mdx`
- Test or typecheck using Merry's existing workspace commands discovered from `package.json`

**Step 1: Create a Merry feature branch from the current `main`**

Use a temporary worktree or clone under `/tmp`. Confirm `main` still includes configuration PR #15 and has no RepoPress E2E branches merged.

**Step 2: Write the component contracts**

Declare all five components with complete metadata:

- `CoverImage`: `src` image/string, `alt` string;
- `InfoBox`: `type` enum and MDX children;
- `Checklist`: `items` expression with an authoring placeholder explaining JSON array syntax;
- `CTABox`: four required string props;
- `LetterPaper`: title string, showStamp boolean, templateText string, and MDX children.

Set `preview.entry` to `.repopress/mdx-preview.tsx`.

**Step 3: Implement the self-contained Merry adapter**

Import only React and `@repopress/preview`. Export `adapter.components` containing product-owned compositions of the portable primitives. Preserve Merry's labels, tone choices, CTA wording, preset cover labels, stamp treatment, and letter structure without importing Next.js or performing navigation/network work.

**Step 4: Add a representative fixture**

The fixture must render every component in one document using the same prop shapes as Merry's current posts.

**Step 5: Validate locally**

Run JSON/schema validation through RepoPress tests, then Merry's formatter/typecheck/test commands that cover the changed files. Expected: all pass.

**Step 6: Commit, push, and open a Merry PR**

```bash
git add repopress.config.json .repopress/mdx-preview.tsx .repopress/merry-preview.fixture.mdx
git commit -m "feat(content): add RepoPress component preview extension"
git push origin <branch>
gh pr create --repo itsyogesh/merry-magic-mail --base main --head <branch> --title "feat: add RepoPress MDX preview extension"
```

Do not merge until RepoPress browser E2E proves the exact PR head.

### Task 7: Add cross-repository pilot fixtures and regression coverage

**Files:**
- Create: `lib/preview/__tests__/merry-product-extension.test.ts`
- Modify: `lib/__tests__/review-regression-guards.test.ts`
- Modify: `docs/plugins_guide.md`
- Modify: `docs/multi_project_mdx_spec.md`
- Modify: `app/docs/studio-editor/page.tsx`

**Step 1: Write the failing fixture test**

Copy the reviewed Merry config, adapter, and fixture into test-only strings or load them from an explicitly pinned test fixture. Assert:

- config normalization exposes all five complete authoring contracts;
- the import policy accepts the adapter and rejects a `next/link` substitution;
- signed resolution verifies;
- worker output contains recognizable structural output for all five names;
- unsupported/missing capability paths downgrade safely;
- Generic output still contains five placeholders when no compatible artifact exists.

**Step 2: Run RED, implement the fixture, then run GREEN**

Run: `npx vitest run lib/preview/__tests__/merry-product-extension.test.ts lib/__tests__/review-regression-guards.test.ts`

Expected final result: PASS.

**Step 3: Update documentation**

Document the product-extension contract, portable primitive boundary, signing variables, single-file pilot limit, Generic fallback, and exact meaning of compatible structural fidelity.

**Step 4: Commit**

```bash
git add lib/preview/__tests__/merry-product-extension.test.ts lib/__tests__/review-regression-guards.test.ts docs app/docs/studio-editor/page.tsx
git commit -m "test(preview): prove the Merry product extension"
```

### Task 8: Run local verification and independent review

**Files:**
- Modify only files required by verified findings

**Step 1: Run focused security and preview suites**

```bash
npx vitest run lib/preview components/preview-sandbox components/mdx-runtime components/studio/hooks/__tests__/use-compatible-preview.test.tsx app/api/preview/compatible/__tests__/route.test.ts
```

Expected: PASS.

**Step 2: Run the complete local gate**

```bash
npm run test
./node_modules/.bin/tsc --noEmit
npm run lint
git diff --check
npm run build
npx convex codegen
```

Expected: all commands exit 0; only documented pre-existing warnings remain.

**Step 3: Request independent differential/security review**

Review authorization, immutable Git authority, signer key isolation, artifact/source bounds, import parsing, sandbox escape surfaces, stale-response handling, and cross-repository coupling. Address every P0-P2 finding with a regression test.

**Step 4: Commit corrections**

Use narrow commits describing each corrected boundary.

### Task 9: Test the Merry UI end to end

**Files:**
- No source changes unless the browser run exposes a defect

**Step 1: Configure matched preview signing keys locally**

Generate one ephemeral P-256 key pair without printing private material. Configure the private JWK only in the Next server environment and the public JWK in the browser environment. Keep `REPOPRESS_CAPABILITY_SECRET` unchanged.

**Step 2: Run Next and Convex development servers**

```bash
npx convex dev
npx next dev --port 3001
```

**Step 3: Use the browser for the real Merry flow**

On the Merry extension PR head:

- sync the project and confirm nine posts;
- open `santa-letter-template-free/page.mdx`;
- confirm the fidelity badge reaches `Compatible`;
- inspect recognizable `CoverImage`, `InfoBox`, `LetterPaper`, `Checklist`, and `CTABox` structures;
- insert or edit `InfoBox` through the schema form;
- save and reload;
- publish to a real test PR;
- inspect the GitHub diff for exact metadata preservation and intended MDX changes only;
- close unmerged, reload, confirm recovery, and discard.

**Step 4: Verify repository state**

Confirm Merry `main` was not changed by the content test PR. Merge only the separate product-extension PR after its checks and the RepoPress pilot pass.

### Task 10: Push PR #44 and complete CI

**Files:**
- No new files unless CI exposes a defect

**Step 1: Verify clean scope and push**

```bash
git status --short
git log --oneline --decorate -12
git push origin docs/mdx-native-preview-architecture
```

**Step 2: Wait for all checks**

Run: `gh pr checks 44 -R itsyogesh/repo-press`

Expected: Lint, Typecheck, Test, and Vercel all pass.

**Step 3: Mark ready only after both repositories are verified**

If PR #44 was returned to draft while extending it, mark it ready only when local verification, independent review, browser E2E, Merry extension PR checks, and RepoPress CI are all green.
