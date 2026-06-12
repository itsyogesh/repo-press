# MDX Runtime Refactor — Bug-Fix Batch Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Close the verified bugs found in the code review of `chore/misc-updates` (the MDX runtime refactor + studio polish branch, PR #41) so the branch is safe to deploy and maintain.

**Architecture:** The branch replaced `gray-matter`-only parsing with a unified `content-file` parser (YAML frontmatter + MDX `export const metadata`), added a `resolvedRuntime` concept persisted to Convex, and reworked the preview adapter selection + caching. The fixes below harden the boundaries of that work: Convex bundle safety, cache-key correctness, sync resilience, and a set of correctness/cleanup items.

**Tech Stack:** Next.js 16, Convex, esbuild-wasm, TypeScript, Vitest, Biome.

**Branch:** Work continues on `chore/misc-updates` (already checked out). Commit per task.

---

## Findings triage (what we fix vs. what we deliberately skip)

**FIXING (verified real):**
- Convex action bundles the full `typescript` compiler (devDependency) via `content-file.ts`.
- Adapter transpile cache key omits `adapterRoot` → cross-project cache collisions.
- `Promise.all` in server-side sync fails the whole sync if any one project's detection throws.
- `initEsbuild` race relies on a brittle error-string match.
- Dead `frontmatterKey` triggers a full MDX recompile on every frontmatter keystroke.
- `resolvedRuntimeValidator` duplicated verbatim in `schema.ts` and `projects.ts`.
- `import * as X` namespace specifiers silently produce an undefined binding.
- Publish can reformat an MDX file's metadata block when a dirty doc has no `githubSha`.
- `keepAsManual` leaves a stale `resolvedRuntime` on a converted project.
- `token` loop variable shadows the GitHub token in `page.tsx`.
- Minor: hardcoded `"content-file.mdx"` filename in the TS parser; dead `commonKeys` loop.

**DEFERRED (needs design decision, tracked separately — NOT in this batch):**
- Unifying the two `standardComponents` definitions. They are *intentionally different* (the PreviewRuntime copy is studio-styled with `studio-accent` tokens and closes over `resolveAssetUrl`; the `standard-library.tsx` copy is the canonical merge set). A blind merge risks breaking studio preview styling. Track as a follow-up with an explicit decision on whether the studio set should derive from a shared factory.
- `new Function()` sandbox escape via `[].constructor.constructor` / unblocked `process`. Already acknowledged in code as a future task (their "Task 4"). Out of scope for a bug-fix batch; needs the iframe/worker sandbox rework.
- `buildMergedContext` dropping `onPreviewError` / `componentsByContext`. Latent and likely pre-existing; `componentsByContext` is never populated today so the studio-layout fallback already always takes the else branch. Investigate separately before changing behavior.

**NOT A BUG (false positives — no action):**
- `DOCS_SETUP_MEDIA` removal from the eval scope. Zero production references (only `docs/` and one JSX-string-generation test that still passes). Intentional cleanup of RepoPress-specific hardcoded constants, same family as the deleted `fallback-data.ts`.
- `JSON.stringify` key-ordering in change detection. Pre-existing pattern used consistently for `components`/`pluginRegistry`; not introduced here.

---

# Phase 1 — Critical (must land before any production deploy)

## Task 1: Remove the `typescript` compiler from the Convex action bundle

**Problem:** `convex/documents.ts` `syncTreeTitles` (an `action`) calls `extractTitleFromContentFile` from `lib/repopress/content-file.ts`, which `import ts from "typescript"` (a devDependency) and `import matter from "gray-matter"`. Convex bundles actions with esbuild; this pulls the ~15 MB TS compiler into the action bundle (Convex's per-action limit is 20 MB) and breaks any `npm ci --omit=dev` deploy step. The action only needs a title string.

**Files:**
- Create: `lib/repopress/content-title.ts`
- Create: `lib/repopress/__tests__/content-title.test.ts`
- Modify: `convex/documents.ts` (import + line 605)

- [ ] **Step 1: Write the failing test**

`lib/repopress/__tests__/content-title.test.ts`:
```ts
import { describe, expect, it } from "vitest"
import { extractTitleFromContent } from "../content-title"

describe("extractTitleFromContent", () => {
  it("reads title from YAML frontmatter", () => {
    expect(extractTitleFromContent(`---\ntitle: Hello World\n---\n# Body`, "blog/a.md")).toBe("Hello World")
  })

  it("reads quoted YAML title", () => {
    expect(extractTitleFromContent(`---\ntitle: "Quoted Title"\n---\n`, "blog/a.md")).toBe("Quoted Title")
  })

  it("reads title from an export const metadata block", () => {
    const src = `export const metadata = {\n  title: "From Export",\n  description: "x"\n}\n\n# Body`
    expect(extractTitleFromContent(src, "app/blog/page.mdx")).toBe("From Export")
  })

  it("falls back to the filename stem when no title exists", () => {
    expect(extractTitleFromContent(`# Just a heading`, "docs/getting-started.mdx")).toBe("getting-started")
  })

  it("falls back to the filename stem on empty content", () => {
    expect(extractTitleFromContent("", "content/my-post.markdown")).toBe("my-post")
  })
})
```

- [ ] **Step 2: Run it and confirm it fails**

Run: `vitest run lib/repopress/__tests__/content-title.test.ts`
Expected: FAIL — `extractTitleFromContent` is not defined.

- [ ] **Step 3: Implement the lightweight, dependency-free extractor**

`lib/repopress/content-title.ts`:
```ts
/**
 * Dependency-free title extraction for server/runtime contexts (e.g. Convex actions)
 * where bundling the TypeScript compiler or gray-matter is undesirable.
 * Handles YAML frontmatter `title:` and MDX `export const metadata = { title: ... }`.
 */
export function extractTitleFromContent(rawContent: string, filePath: string): string {
  const fallback = filePath.split("/").pop()?.replace(/\.(mdx?|markdown)$/i, "") || filePath

  const fmMatch = rawContent.match(/^---\r?\n([\s\S]*?)\r?\n---/)
  if (fmMatch) {
    const titleMatch = fmMatch[1].match(/^title:\s*["']?(.+?)["']?\s*$/m)
    if (titleMatch?.[1]?.trim()) return titleMatch[1].trim()
  }

  const metaMatch = rawContent.match(
    /export\s+const\s+metadata\s*=\s*\{[\s\S]*?\btitle\s*:\s*["'`]([^"'`]+)["'`]/,
  )
  if (metaMatch?.[1]?.trim()) return metaMatch[1].trim()

  return fallback
}
```

- [ ] **Step 4: Switch the Convex action to the lightweight extractor**

In `convex/documents.ts`:
- Replace the import `import { extractTitleFromContentFile } from "../lib/repopress/content-file"` with `import { extractTitleFromContent } from "../lib/repopress/content-title"`.
- At line ~605 replace `const title = extractTitleFromContentFile(content, file.path)` with `const title = extractTitleFromContent(content, file.path)`.

- [ ] **Step 5: Run the test + confirm no other Convex file imports content-file**

Run: `vitest run lib/repopress/__tests__/content-title.test.ts`
Expected: PASS.
Run: `grep -rn "repopress/content-file" convex/`
Expected: no matches (the action no longer drags in `typescript`/`gray-matter`).

- [ ] **Step 6: Commit**

```bash
git add lib/repopress/content-title.ts lib/repopress/__tests__/content-title.test.ts convex/documents.ts
git commit -m "fix(convex): drop typescript compiler from syncTreeTitles action bundle"
```

---

## Task 2: Include `adapterRoot` in the transpiled-adapter cache key

**Problem:** `runtimeRoot` changes how `@/` and `~/` alias imports resolve during esbuild bundling (`esbuild-browser.ts:148-151`), but `buildAdapterCacheKey` keys only on `entryPath` + `sourceSha`. The in-flight dedup key was already updated to include `adapterRoot` — the persisted IndexedDB key was not. Two contexts with the same entry path + SHA but different roots collide and serve each other's bundle.

**Files:**
- Modify: `lib/repopress/adapter-cache.ts` (`buildAdapterCacheKey`, lines 89-97)
- Modify: `lib/hooks/use-preview-context.ts` (call site, line ~166)
- Modify: `lib/repopress/__tests__/` (add a cache-key test if an `adapter-cache` test file exists; otherwise add one)

- [ ] **Step 1: Write the failing test**

`lib/repopress/__tests__/adapter-cache-key.test.ts`:
```ts
import { describe, expect, it } from "vitest"
import { buildAdapterCacheKey } from "../adapter-cache"

describe("buildAdapterCacheKey", () => {
  it("produces distinct keys for different adapter roots", () => {
    const a = buildAdapterCacheKey("o", "r", "main", "mdx-components.tsx", "apps/docs", "sha1")
    const b = buildAdapterCacheKey("o", "r", "main", "mdx-components.tsx", "apps/marketing", "sha1")
    expect(a).not.toBe(b)
  })

  it("treats null root as a stable empty segment", () => {
    const a = buildAdapterCacheKey("o", "r", "main", "e.tsx", null, "sha1")
    const b = buildAdapterCacheKey("o", "r", "main", "e.tsx", null, "sha1")
    expect(a).toBe(b)
    expect(a).toContain("e.tsx::sha1")
  })
})
```

- [ ] **Step 2: Run it and confirm it fails**

Run: `vitest run lib/repopress/__tests__/adapter-cache-key.test.ts`
Expected: FAIL — `buildAdapterCacheKey` currently takes 5 args; the 6-arg call is a type/arity mismatch and keys do not differ by root.

- [ ] **Step 3: Add the `adapterRoot` segment**

In `lib/repopress/adapter-cache.ts` replace `buildAdapterCacheKey`:
```ts
export function buildAdapterCacheKey(
  owner: string,
  repo: string,
  branch: string,
  entryPath: string,
  adapterRoot: string | null,
  sourceSha: string,
) {
  return `${owner}/${repo}@${branch}:${entryPath}:${adapterRoot ?? ""}:${sourceSha}`
}
```

- [ ] **Step 4: Update the call site**

In `lib/hooks/use-preview-context.ts` (~line 166), pass `options.adapterRoot` before `sourceSha`:
```ts
const cacheKey = buildAdapterCacheKey(
  options.owner,
  options.repo,
  options.branch,
  options.adapterPath,
  options.adapterRoot,
  sourceSha,
)
```

- [ ] **Step 5: Run the test**

Run: `vitest run lib/repopress/__tests__/adapter-cache-key.test.ts`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add lib/repopress/adapter-cache.ts lib/hooks/use-preview-context.ts lib/repopress/__tests__/adapter-cache-key.test.ts
git commit -m "fix(preview): include adapterRoot in transpiled adapter cache key"
```

---

## Task 3: Make server-side project sync resilient to per-project failures

**Problem:** `lib/sync-projects.ts:38` uses `Promise.all` over `config.projects`. Each iteration now calls `buildDetectionContext` + `detectFrameworkFromContext` + `resolveResolvedRuntime`, all of which make GitHub API calls that can throw (rate limit, 404, parse error). A single rejection aborts the entire sync, so one bad project blocks every other project from syncing.

**Files:**
- Modify: `lib/sync-projects.ts` (lines 38-69)
- Modify: `lib/__tests__/sync-projects-server-side.test.ts` (add a resilience test)

- [ ] **Step 1: Write the failing test**

Add to `lib/__tests__/sync-projects-server-side.test.ts` a case where one project's `resolveResolvedRuntime`/detection throws and assert the other project still appears in the mutation payload. (Follow the existing mocking style in that file for `buildDetectionContext`, `detectFrameworkFromContext`, `resolveResolvedRuntime`, and the Convex client.) The assertion: the `projects` array passed to `syncProjectsFromConfig` contains the healthy project, and the failing project is still present with `resolvedRuntime: undefined`.

- [ ] **Step 2: Run it and confirm it fails**

Run: `vitest run lib/__tests__/sync-projects-server-side.test.ts`
Expected: FAIL — the thrown error currently rejects `Promise.all` and no mutation is sent.

- [ ] **Step 3: Wrap each project's detection in try/catch**

Replace the `projectsToSync` block in `lib/sync-projects.ts` (lines 38-69):
```ts
const projectsToSync = await Promise.all(
  config.projects.map(async (p) => {
    const previewEntry = p.preview?.entry || config.defaults?.preview?.entry
    const base = {
      configProjectId: p.id,
      name: p.name,
      contentRoot: p.contentRoot,
      contentType: p.contentType as "blog" | "docs" | "pages" | "changelog" | "custom",
      branch: p.branch || config.defaults?.branch || branch,
      previewEntry,
      enabledPlugins: p.preview?.plugins || config.defaults?.preview?.plugins,
      components: p.components,
    }

    try {
      const detectionContext = await getDetectionContext(p.contentRoot)
      const detectedFramework =
        p.framework === "auto" || p.framework === "detected"
          ? (await detectFrameworkFromContext(detectionContext)).framework
          : p.framework
      const resolvedRuntime = await resolveResolvedRuntime({
        owner,
        repo,
        branch,
        framework: detectedFramework,
        contentRoot: p.contentRoot,
        overrideEntry: previewEntry,
        readFile: detectionContext.readFile,
      })
      return { ...base, framework: detectedFramework, resolvedRuntime }
    } catch (error) {
      console.error(
        `[RepoPress] Runtime detection failed for project ${p.id} (${owner}/${repo}); syncing without resolvedRuntime.`,
        error,
      )
      const framework =
        p.framework === "auto" || p.framework === "detected" ? "custom" : p.framework
      return { ...base, framework, resolvedRuntime: undefined }
    }
  }),
)
```

- [ ] **Step 4: Run the test**

Run: `vitest run lib/__tests__/sync-projects-server-side.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add lib/sync-projects.ts lib/__tests__/sync-projects-server-side.test.ts
git commit -m "fix(sync): isolate per-project detection failures during server-side sync"
```

---

## Task 4: Make `initEsbuild` concurrency-safe via a shared init promise

**Problem:** `esbuild-browser.ts:7-29` guards on a boolean that is only set *after* `await esbuild.initialize(...)` resolves. Two concurrent callers both pass the guard; the second throws and is recovered only by matching the esbuild error string — brittle across esbuild-wasm versions.

**Files:**
- Modify: `lib/repopress/esbuild-browser.ts` (lines 3-29)

- [ ] **Step 1: Replace the init function with promise memoization**

```ts
let esbuildInitialized = false
let esbuildInitPromise: Promise<void> | null = null

export async function initEsbuild() {
  if (esbuildInitialized) return
  if (esbuildInitPromise) return esbuildInitPromise

  esbuildInitPromise = (async () => {
    try {
      if (typeof window === "undefined") {
        esbuildInitialized = true
        return
      }
      await esbuild.initialize({
        worker: false,
        wasmURL: "/esbuild.wasm",
      })
      esbuildInitialized = true
    } catch (e: any) {
      if (typeof e?.message === "string" && e.message.includes('Cannot call "initialize" more than once')) {
        esbuildInitialized = true
        return
      }
      esbuildInitPromise = null // allow a genuine failure to be retried
      console.error("Failed to initialize esbuild", e)
      throw e
    }
  })()

  return esbuildInitPromise
}
```

- [ ] **Step 2: Verify the existing repo-module-bundle / transpile tests still pass**

Run: `vitest run lib/repopress/__tests__/repo-module-bundle.test.ts lib/repopress/__tests__/evaluate-adapter.test.ts`
Expected: PASS (no behavior change for the single-caller path).

- [ ] **Step 3: Commit**

```bash
git add lib/repopress/esbuild-browser.ts
git commit -m "fix(preview): make initEsbuild concurrency-safe with a shared init promise"
```

---

# Phase 2 — Correctness

## Task 5: Remove the dead `frontmatterKey` recompile trigger

**Problem:** In `components/mdx-runtime/PreviewRuntime.tsx`, `frontmatterRef` (lines 114-115) and `frontmatterKey` (line 119) remain after `currentFrontmatter`/`DynamicImage` were removed. `frontmatterKey` feeds `compileInputsKey` (line 128), which is an effect dependency (line 421). Frontmatter is no longer read during compilation, so every frontmatter keystroke fires the 300 ms-debounced full MDX recompile. `source` is already a direct effect dependency, so body edits remain covered.

**Files:**
- Modify: `components/mdx-runtime/PreviewRuntime.tsx` (lines 114-128, props destructuring)

- [ ] **Step 1: Remove the ref + frontmatter key, simplify the compile key**

- Delete lines 114-115 (`const frontmatterRef = useRef(frontmatter)` and `frontmatterRef.current = frontmatter`).
- Delete line 119 (`const frontmatterKey = useMemo(...)`).
- Replace line 128 with:
```ts
const compileInputsKey = adapterKey
```
- Remove `frontmatter` from the destructured params (keep `frontmatter?: Record<string, unknown>` in the props **type** so existing callers compile unchanged):
```ts
export function PreviewRuntime({
  source,
  adapter,
  externalDiagnostics = [],
  resolveAssetUrl,
  onStatusChange,
  onWarningsChange,
}: {
  source: string
  frontmatter?: Record<string, unknown>
  adapter?: RepoPressPreviewAdapter
  externalDiagnostics?: string[]
  resolveAssetUrl?: (path: string) => string
  onStatusChange?: (isCompiling: boolean) => void
  onWarningsChange?: (warnings: string[]) => void
}) {
```

- [ ] **Step 2: Verify the effect dependency array still references `compileInputsKey`**

Confirm line ~421 remains `}, [source, compileInputsKey, resolveAssetUrl])` and the `void compileInputsKey` reference (line ~149) still compiles.

- [ ] **Step 3: Run the mdx-runtime tests**

Run: `vitest run components/mdx-runtime/__tests__/`
Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add components/mdx-runtime/PreviewRuntime.tsx
git commit -m "fix(preview): stop recompiling MDX on every frontmatter change"
```

---

## Task 6: Single-source the `resolvedRuntimeValidator`

**Problem:** The identical `resolvedRuntimeValidator` is defined in both `convex/schema.ts` (lines 4-10) and `convex/projects.ts` (lines 342-348). If one drifts, `ctx.db.patch` throws at runtime with no compile-time signal.

**Files:**
- Modify: `convex/schema.ts` (export the validator)
- Modify: `convex/projects.ts` (import it, delete the local copy)

- [ ] **Step 1: Export from schema.ts**

In `convex/schema.ts` change `const resolvedRuntimeValidator = v.object({...})` to `export const resolvedRuntimeValidator = v.object({...})`.

- [ ] **Step 2: Import in projects.ts and delete the duplicate**

In `convex/projects.ts`:
- Delete the local `const resolvedRuntimeValidator = v.object({...})` (lines 342-348).
- Add to the existing schema import (or a new import): `import { resolvedRuntimeValidator } from "./schema"`.

- [ ] **Step 3: Verify**

Run: `vitest run` (full suite — quickest way to catch a broken Convex import in tests that touch projects).
Expected: PASS. Also confirm `npx convex dev` / typecheck has no unresolved-import error if running locally.

- [ ] **Step 4: Commit**

```bash
git add convex/schema.ts convex/projects.ts
git commit -m "refactor(convex): single-source resolvedRuntimeValidator from schema"
```

---

## Task 7: Bind `import * as X` namespace specifiers in the preview sandbox

**Problem:** `components/mdx-runtime/transformImports.ts:69-71` routes `ImportNamespaceSpecifier` to the generic "unsupported specifier" diagnostic and drops it. The local name is then undefined at runtime; the first reference throws inside `ErrorBoundary` instead of degrading gracefully.

**Files:**
- Modify: `components/mdx-runtime/transformImports.ts` (specifier loop)
- Modify: `components/mdx-runtime/PreviewRuntime.tsx` (importBindings loop, lines ~268-281)
- Modify: `components/mdx-runtime/__tests__/compileMdx.test.ts` (add a namespace-import case)

- [ ] **Step 1: Write the failing test**

Add to `components/mdx-runtime/__tests__/compileMdx.test.ts` a case compiling `import * as Lib from 'allowed-source'` with `allowed-source` in the allowed map, asserting the extracted import has `imported: "*"` and `local: "Lib"` (mirror the existing test's structure for reading `extractedImports`/diagnostics).

- [ ] **Step 2: Run it and confirm it fails**

Run: `vitest run components/mdx-runtime/__tests__/compileMdx.test.ts`
Expected: FAIL — namespace import is reported as an unsupported specifier and not extracted.

- [ ] **Step 3: Handle the namespace specifier in the transform**

In `components/mdx-runtime/transformImports.ts`, add a branch before the final `else` (after the `ImportDefaultSpecifier` branch, line 68):
```ts
} else if (specifier.type === "ImportNamespaceSpecifier") {
  extracted.push({
    source,
    imported: "*",
    local: specifier.local.name,
  })
} else {
```

- [ ] **Step 4: Bind the namespace object at runtime**

In `components/mdx-runtime/PreviewRuntime.tsx`, in the `for (const imported of imports || [])` loop (starting ~line 268), handle the namespace marker right after the `if (!exportMap) continue` check:
```ts
for (const imported of imports || []) {
  const exportMap = currentAdapter?.allowImports?.[imported.source]
  if (!exportMap) continue

  if (imported.imported === "*") {
    importBindings[imported.local] = { ...exportMap }
    continue
  }

  const importedValue = exportMap[imported.imported]
  // ...unchanged below
```

- [ ] **Step 5: Run the test**

Run: `vitest run components/mdx-runtime/__tests__/compileMdx.test.ts`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add components/mdx-runtime/transformImports.ts components/mdx-runtime/PreviewRuntime.tsx components/mdx-runtime/__tests__/compileMdx.test.ts
git commit -m "fix(preview): bind namespace imports instead of dropping them"
```

---

## Task 8: Don't reformat an existing MDX file's metadata block on publish when a dirty doc lacks `githubSha`

**Problem:** In `app/api/github/publish-ops/route.ts`, dirty docs without `githubSha` are excluded from the prefetch (the `if (!doc.githubSha) continue` guard in the prefetch builder), so at line 187-190 `existingFile` is `undefined` → `metadataSource = "none"` → `serializeContentFile` writes `metadataDefault` (frontmatter by default). For a file that already exists on GitHub using `export const metadata`, this silently rewrites it as YAML. New files (genuinely absent on GitHub) are unaffected, so the fix must distinguish "no SHA but file exists" from "no SHA, new file."

**Files:**
- Modify: `app/api/github/publish-ops/route.ts` (prefetch builder + the dirty-docs update loop, lines ~90-204)
- Modify: `app/api/github/__tests__/` (add/extend a publish-ops test if one exists)

- [ ] **Step 1: Read the prefetch builder**

Open `app/api/github/publish-ops/route.ts` and locate where `pathsToFetch` / `prefetchResults` are assembled (the block with `if (!doc.githubSha) continue`). Confirm the exact variable names before editing.

- [ ] **Step 2: Include dirty docs in the prefetch regardless of `githubSha`**

Change the prefetch builder so dirty docs are fetched even without a `githubSha` (best-effort; a 404 simply leaves no `prefetchResults` entry). Concretely, drop the `if (!doc.githubSha) continue` early-skip for the *metadata-detection* fetch (keep any SHA-based conflict logic as-is). The fetch helper already tolerates missing files (a missing file yields no entry), so a genuinely new file keeps `existingFile === undefined` and correctly serializes with `metadataDefault`.

- [ ] **Step 3: Confirm the update loop now detects the real format**

Verify lines 187-197 are unchanged in shape — `existingFile` will now be populated for an existing-on-GitHub file even when the local doc lost its `githubSha`, so `parseContentFile(existingFile.content, fullPath).metadataSource` returns the true `metadata-export`/`frontmatter` source.

- [ ] **Step 4: Verify**

Run: `vitest run app/api/github/__tests__/` (and the full suite if no targeted test exists).
Expected: PASS. If a publish-ops test exists, add a case: a dirty MDX doc with `githubSha: undefined` whose file exists on GitHub as `export const metadata` is republished as `export const metadata`, not YAML.

- [ ] **Step 5: Commit**

```bash
git add app/api/github/publish-ops/route.ts
git commit -m "fix(publish): preserve MDX metadata format for dirty docs missing a githubSha"
```

---

## Task 9: Clear `resolvedRuntime` when converting a config project to manual

**Problem:** `convex/projects.ts` `keepAsManual` clears the config fields but leaves `resolvedRuntime` populated. After conversion the project is manual yet still carries config-derived runtime settings, with no UI path to clear them.

**Files:**
- Modify: `convex/projects.ts` (`keepAsManual` patch, ~lines 734-743)

- [ ] **Step 1: Add the field to the patch**

In the `keepAsManual` mutation's `ctx.db.patch(...)` object, add `resolvedRuntime: undefined,` alongside the other cleared fields (`configProjectId`, `configVersion`, `configPath`, `frameworkSource`, `configRemoved`, `configRemovedAt`).

- [ ] **Step 2: Verify**

Run: `vitest run` (or the projects-specific test file if present).
Expected: PASS.

- [ ] **Step 3: Commit**

```bash
git add convex/projects.ts
git commit -m "fix(convex): clear resolvedRuntime when converting a config project to manual"
```

---

## Task 10: Fix `token` shadowing + the hardcoded parser filename

Two small correctness items batched into one commit.

**Files:**
- Modify: `app/dashboard/[owner]/[repo]/page.tsx` (line ~87)
- Modify: `lib/repopress/content-file.ts` (lines 80-86, 150)

- [ ] **Step 1: Rename the shadowing loop variable**

In `app/dashboard/[owner]/[repo]/page.tsx` line 87, rename to avoid shadowing the outer GitHub `token`:
```ts
for (const [projectId, projectToken] of tokens) {
  projectAccessTokens[projectId] = projectToken
}
```

- [ ] **Step 2: Thread the real filePath into the TS source parser**

In `lib/repopress/content-file.ts`:
- Change `extractMetadataExport(source: string)` to `extractMetadataExport(source: string, filePath: string)`.
- Change line 86 `ts.createSourceFile("content-file.mdx", source, ...)` to use `filePath`:
```ts
const sourceFile = ts.createSourceFile(filePath, source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX)
```
- Update the call site (line 150): `const metadataExport = extractMetadataExport(bodyWithoutFrontmatter, filePath)`.

- [ ] **Step 3: Verify**

Run: `vitest run lib/repopress/__tests__/content-file.test.ts`
Expected: PASS (no behavior change — only the diagnostic source name differs).

- [ ] **Step 4: Commit**

```bash
git add "app/dashboard/[owner]/[repo]/page.tsx" lib/repopress/content-file.ts
git commit -m "fix: rename shadowed token var and pass real filePath to MDX parser"
```

---

# Phase 3 — Cleanup (low risk, no behavior change)

## Task 11: Delete the dead `commonKeys` getter loop

**Problem:** In `PreviewRuntime.tsx:373-397`, every entry in `commonKeys` is already present in `mergedScope` (they come from `standardComponents`, spread into `componentsContext` → `mergedScope`). The `if (!(key in mergedScope))` guard is always false; the loop is dead.

**Files:**
- Modify: `components/mdx-runtime/PreviewRuntime.tsx` (lines 373-397)

- [ ] **Step 1: Remove the `commonKeys` array and the `for` loop entirely** (lines 373-397).

- [ ] **Step 2: Verify the preview still renders standard components**

Run: `vitest run components/mdx-runtime/__tests__/`
Expected: PASS.

- [ ] **Step 3: Commit**

```bash
git add components/mdx-runtime/PreviewRuntime.tsx
git commit -m "chore(preview): remove dead commonKeys scope loop"
```

---

# Phase 4 — Performance (optional; larger, do after Phases 1-3 are green)

## Task 12: Skip GitHub detection work for markdown-first frameworks

**Problem:** `resolveResolvedRuntime` returns the fallback immediately for markdown-first frameworks (hugo, jekyll, etc.) without using `readFile`, yet `getDetectionContext` (2-3 GitHub calls) still runs for them. For an explicitly-configured markdown-first project this is pure waste.

**Approach:** When `p.framework` is an explicit markdown-first framework (not `auto`/`detected`), skip `getDetectionContext` and pass a no-op `readFile` to `resolveResolvedRuntime`. Keep this inside the Task 3 try/catch. Add a unit test asserting `buildDetectionContext` is not called for an explicit `hugo` project. **Note in code/PR:** if a future change makes the markdown-first runtime depend on `readFile`, this shortcut must be revisited.

## Task 13: Avoid re-running runtime detection on every dashboard load when config is unchanged

**Problem:** `syncProjectsServerSide` recomputes `resolvedRuntime` (up to ~15 GitHub calls per distinct content root) on every dashboard visit, even when `repopress.config.json` has not changed. The Convex `projects` row already stores `resolvedRuntime` and a `configVersion`.

**Approach:** Before recomputing, query existing projects for this repo; if the stored `configVersion` equals `config.version` and `resolvedRuntime` is present, reuse the stored value and skip detection for that project. Recompute only when the config version changed or `resolvedRuntime` is missing. This is a measurable win but touches the sync contract — gate it behind a focused test that asserts: (a) unchanged config → zero detection calls, (b) bumped config version → detection re-runs.

> Phases 4's two tasks are independent; either can ship alone. Measure before/after GitHub call counts in the PR description.

---

# Phase 5 — Test coverage backfill (highest-value gaps first)

## Task 14: `use-studio-file.ts` behavior tests

The hook (~575 lines) drives most of the editor's state with only one existing test. Add tests for: cache hit skips the network; SHA mismatch invalidates cache and refetches; `closeFile` with one vs. multiple open tabs; `clearSelection` clears localStorage; dirty-state flips on `setContent`; popstate navigation. Use the existing `use-studio-file.test.tsx` mock setup as the template.

## Task 15: `repo-module-bundle.ts` error-path tests

Cover the two `throw` branches (missing entry → `Module not found`; unresolvable specifier → `Unable to resolve`) and assert the circular-import guard terminates.

## Task 16: `resolved-runtime.ts` edge cases

Add: `contentRoot: ""` (repo root); `next-mdx` with a non-`app/` content root must use `frontmatter` (not `metadata-export`); a non-markdown-first framework with no `mdx-components` file at any level returns `generic-fallback`.

## Task 17: `content-title.ts` / `content-file.ts` extra cases

For `content-file.ts`: malformed-YAML fallback path; metadata export that evaluates to a non-object (warning path); serialize round-trip for an MDX file whose `metadataSource` is `frontmatter`.

---

## Final verification (after the chosen phases)

- [ ] Run the full suite: `npm run test` — expect 0 failures.
- [ ] Run lint: `npm run lint` — expect clean (or only pre-existing warnings).
- [ ] Confirm `grep -rn "repopress/content-file" convex/` returns nothing (Task 1 stuck).
- [ ] Push the branch and update PR #41 with a summary of fixes and the deferred/false-positive notes from the triage section.

---

## Self-review notes

- **Spec coverage:** Every "FIXING" item in the triage maps to a task (T1-T11 + T12-T13 perf). Deferred/false-positive items are explicitly documented, not silently dropped.
- **Type consistency:** `extractTitleFromContent` (T1) is the new name used in `documents.ts`; `extractTitleFromContentFile` stays in `content-file.ts` for browser callers. `buildAdapterCacheKey`'s new 6-arg signature (T2) is updated at its only call site. `compileInputsKey = adapterKey` (T5) keeps the effect dependency name stable.
- **Ordering:** Phase 1 is deploy-blocking and independent; Phases 2-3 are safe follow-ons; Phase 4 is optional perf; Phase 5 is test backfill. Tasks within a phase are independently committable.
