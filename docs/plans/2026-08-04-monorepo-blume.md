# RepoPress Monorepo and Blume Documentation Implementation Plan

> **Execution:** Use the subagent-driven workflow, keep implementation slices in isolated worktrees, and review each slice before integration.

**Goal:** Move the existing web product into `apps/web`, add a standalone Blume site in `apps/docs`, deploy it at `docs.repopress.org`, and connect RepoPress to its own docs content.

**Architecture:** npm workspaces orchestrate two independently deployable applications. The web application retains Next.js and Convex as one boundary. The docs application consumes only public Markdown/MDX from its own content root. Root configuration coordinates CI and repository policy.

**Tech stack:** npm workspaces, Node 22, Next.js 16, Convex, Vitest, Biome, Blume, Vercel.

---

### Task 1: Establish the workspace contract

**Files:**
- Modify: `package.json`
- Regenerate: `package-lock.json`
- Delete: `pnpm-lock.yaml`
- Delete: `bun.lockb`
- Create: `scripts/verify-workspace.mjs`
- Create: `packages/.gitkeep`

**Steps:**

1. Add a failing workspace verifier that asserts exactly `apps/web` and `apps/docs` are declared, both manifests exist, only the root npm lockfile exists, and application packages are private.
2. Replace the root manifest with a private workspace manifest using `workspaces: ["apps/*", "packages/*"]`, Node `>=22.12.0`, and orchestration scripts for `dev:web`, `dev:docs`, `lint`, `typecheck`, `test`, `build`, and `verify:workspace`.
3. Move the existing manifest to `apps/web/package.json`, preserving its dependency versions and web scripts.
4. Regenerate the root npm lock and make the verifier green.
5. Commit as `chore(repo): establish npm workspace contract`.

### Task 2: Move the web application without changing behavior

**Files:**
- Move into `apps/web/`: `app`, `components`, `convex`, `hooks`, `lib`, `public`, `registry`, `remotion`, `scripts`, `styles`, and web runtime/config files
- Modify: path-sensitive scripts and configuration under `apps/web`
- Modify: `.gitignore`, `.env.example`, `README.md`, `AGENTS.md`, `CLAUDE.md`

**Steps:**

1. Record the current typecheck, focused foundation tests, and build contract before the move.
2. Use `git mv` for web-owned files and directories. Keep `.github`, `.agents`, internal `docs`, repository guides, and root workspace files at the root.
3. Update path-sensitive configuration only where the new workspace root requires it. Preserve `@/*`, Next.js output tracing, Convex code generation, instrumentation, Sentry, Remotion, and test setup.
4. Run `npm run verify:workspace`, web typecheck, focused tests, and production build.
5. Commit as `refactor(repo): move web application into apps web`.

### Task 3: Scaffold the Blume application

**Files:**
- Create: `apps/docs/package.json`
- Create: `apps/docs/blume.config.ts`
- Create: `apps/docs/content/**`
- Create: `apps/docs/public/**`
- Create: `apps/docs/README.md`

**Steps:**

1. Inspect the pinned Blume release and its generated project shape before adding dependencies.
2. Create the smallest standalone Blume app with filesystem content rooted at `content`, the RepoPress name/description, canonical docs URL, static build, search, and framework-native machine-readable docs features.
3. Add a smoke test or build assertion that fails when the content root or required navigation pages are absent.
4. Run the Blume development server and production build.
5. Commit as `feat(docs): add Blume documentation application`.

### Task 4: Migrate and structure public documentation

**Files:**
- Move/adapt: `docs/platform/*.md` to `apps/docs/content/platform/**`
- Move/adapt: `docs/tutorials/*.md` to `apps/docs/content/tutorials/**`
- Convert: `apps/web/app/docs/**` into `apps/docs/content/**`
- Modify: `apps/docs/content/**` navigation metadata and links
- Delete: retired `apps/web/app/docs/**`

**Steps:**

1. Build a public-content inventory and explicitly exclude plans, reviews, handoffs, and operational runbooks.
2. Convert the existing Next documentation pages to portable Markdown/MDX while retaining their useful media and examples.
3. Organize navigation into Introduction, Guides, Studio, Platform, Components, and Tutorials.
4. Validate all internal links, code blocks, images, headings, and navigation entries.
5. Run the docs production build and inspect representative pages at desktop and mobile widths.
6. Commit as `docs: migrate public guides into Blume`.

### Task 5: Add web redirects and workspace-aware links

**Files:**
- Modify: `apps/web/next.config.mjs`
- Modify: web navigation/footer/docs links under `apps/web`
- Modify: root `README.md`
- Add/modify: redirect tests under `apps/web`

**Steps:**

1. Write failing tests for path-preserving permanent redirects from `/docs` and `/docs/:path*` to `https://docs.repopress.org`.
2. Add the redirect configuration and update all public docs links to the canonical domain.
3. Ensure auth/proxy behavior does not intercept the redirects.
4. Run redirect tests, web lint, and web typecheck.
5. Commit as `feat(web): redirect documentation to docs domain`.

### Task 6: Teach RepoPress about Blume

**Files:**
- Modify: `apps/web/lib/framework-detector.ts`
- Modify: `apps/web/lib/framework-adapters/**`
- Modify: corresponding Vitest files
- Modify: framework labels/icons only where existing UI requires them

**Steps:**

1. Write failing fixtures for a root Blume project and a nested `apps/docs` Blume workspace.
2. Detect Blume from `blume.config.*` and/or the declared package without weakening detection for Astro, Fumadocs, or custom MDX.
3. Return `content` as the suggested root relative to the detected workspace and expose the standard Markdown/MDX fields.
4. Add an adapter entry and human-readable UI label.
5. Run detector, adapter, setup, and project-sync regressions.
6. Commit as `feat(web): detect Blume documentation projects`.

### Task 7: Update CI and deployment configuration

**Files:**
- Modify: `.github/workflows/**`
- Create/modify: Vercel configuration only where repository configuration is needed
- Create: `docs/deployment/blume-docs.md` or update the canonical deployment runbook

**Steps:**

1. Make CI install once at the root and run workspace verification, lint, typecheck, tests, and both builds.
2. Preserve web-specific test environment behavior without providing web secrets to docs.
3. Document Vercel project roots, commands, Node version, domains, required web variables, and the docs no-secrets rule.
4. Validate workflow syntax and run all CI commands locally.
5. Commit as `ci: verify web and docs workspaces`.

### Task 8: Integrated local and browser verification

**Steps:**

1. From a clean install, run `npm run verify:workspace`, `npm run lint`, `npm run typecheck`, `npm test`, and `npm run build`.
2. Start both applications using root scripts.
3. In a browser, verify the web landing page, login boundary, Studio route, `/docs` redirect, docs landing page, navigation, search, code blocks, and responsive layout.
4. Verify no docs request receives Convex or GitHub credentials and no internal root document is publicly routed.
5. Request a differential/code review of the complete branch and resolve all blocker/P1 findings.

### Task 9: Preview deployment and dogfood acceptance

**Steps:**

1. Push the feature branch and open a review-ready PR.
2. Configure the existing Vercel web project root as `apps/web` and create a docs project rooted at `apps/docs`.
3. Test both preview deployments before changing production domains.
4. Attach `docs.repopress.org`, verify TLS/HTTP/navigation, and verify apex `/docs` redirects.
5. In RepoPress, create or sync the project whose content root is `apps/docs/content`.
6. Open a documentation page, edit a harmless test value, save, preview, publish to a lane, inspect the generated PR, and close or merge it according to the test plan.
7. Record deployment URLs, the dogfood result, rollback steps, and any product friction discovered during setup.
