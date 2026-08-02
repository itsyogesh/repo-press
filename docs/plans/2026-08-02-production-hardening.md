# Production Hardening Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Make production OAuth, repository setup, error recovery, and isolated Compatible preview work end to end.

**Architecture:** Keep Better Auth inside Convex and fix its production origin configuration rather than changing auth ownership. Add a shared Editorial recovery component plus route-level boundaries, and restrict a dedicated public sandbox deployment at the Next.js proxy using an explicit deployment role. Production Studio signs exact artifacts; the public sandbox verifies and executes only approved artifacts inside the existing opaque iframe.

**Tech Stack:** Next.js 16 App Router and proxy, React 19, Better Auth in Convex, Vitest and Testing Library, Vercel CLI, Chrome E2E.

---

### Task 1: Surface GitHub OAuth failures

**Files:**
- Create: `app/login/__tests__/page.test.tsx`
- Modify: `app/login/page.tsx`

**Step 1: Write the failing tests**

Mock `signIn.social` and prove that the login page:

- sends the safe `/dashboard` callback;
- renders a returned Better Auth error message;
- renders a generic message for a thrown/network failure;
- disables duplicate submission while the request is pending.

**Step 2: Verify RED**

Run: `npx vitest run app/login/__tests__/page.test.tsx`

Expected: failures because the current handler ignores returned errors and has no local alert state.

**Step 3: Implement the minimal behavior**

Add local `authError` state, clear it before a new attempt, inspect the result returned from `signIn.social`, and surface a safe message in the existing destructive `Alert`. Preserve the loading state and callback.

**Step 4: Verify GREEN**

Run: `npx vitest run app/login/__tests__/page.test.tsx`

Expected: all login component tests pass.

**Step 5: Commit**

Commit message: `fix(auth): surface GitHub sign-in failures`

### Task 2: Add branded recovery boundaries

**Files:**
- Create: `components/error-recovery.tsx`
- Create: `components/__tests__/error-recovery.test.tsx`
- Create: `app/dashboard/error.tsx`
- Modify: `app/global-error.tsx`

**Step 1: Write the failing tests**

Render the recovery component and route boundaries. Assert an accessible heading, calm safety copy, retry action, dashboard navigation, and optional support digest. Assert that retry invokes `reset` exactly once.

**Step 2: Verify RED**

Run: `npx vitest run components/__tests__/error-recovery.test.tsx`

Expected: module-not-found failure for the new component/boundary.

**Step 3: Implement the Editorial UI**

Build a flat, bordered, whitespace-forward recovery state using `BrandMark`, `Button`, Lucide's `RefreshCw` and `ArrowLeft`, token colors, serif display text, and no shadows or gradients. The dashboard boundary renders inside the existing shell; the global boundary supplies its own `html` and `body`.

**Step 4: Verify GREEN**

Run: `npx vitest run components/__tests__/error-recovery.test.tsx`

Expected: all recovery UI tests pass.

**Step 5: Commit**

Commit message: `fix(ui): add actionable error recovery`

### Task 3: Enforce a sandbox-only deployment role

**Files:**
- Create: `lib/deployment-role.ts`
- Create: `lib/__tests__/deployment-role.test.ts`
- Modify: `proxy.ts`
- Modify: `lib/__tests__/proxy.test.ts`
- Modify: `README.md`
- Modify: `docs/production-deployment-guide.md`

**Step 1: Write the failing policy and proxy tests**

Prove that normal deployments preserve all current routing, while `REPOPRESS_DEPLOYMENT_ROLE=sandbox` allows `/preview/sandbox` and required static assets but returns 404 for `/`, `/login`, `/dashboard`, `/api/auth/*`, and mutation APIs. Assert the broader static matcher required to apply the gate.

**Step 2: Verify RED**

Run: `npx vitest run lib/__tests__/deployment-role.test.ts lib/__tests__/proxy.test.ts`

Expected: failures because no deployment-role policy exists and the current matcher covers only root/login/dashboard.

**Step 3: Implement the minimal gate**

Add a pure allow/deny policy. Apply it before auth redirects in `proxy.ts`; return a plain 404 response in sandbox mode for all non-sandbox application routes. Use a negative-lookahead matcher that excludes immutable Next/static and public asset extensions while covering all application paths.

**Step 4: Update deployment documentation**

Document `REPOPRESS_DEPLOYMENT_ROLE`, the separate sandbox project, its public network requirement, Studio/sandbox key placement, and `SITE_URL` as the application origin used by Better Auth.

**Step 5: Verify GREEN**

Run: `npx vitest run lib/__tests__/deployment-role.test.ts lib/__tests__/proxy.test.ts components/__tests__/root-chrome.test.tsx components/preview-sandbox/__tests__/SandboxRuntime.test.tsx`

Expected: all role, proxy, root-chrome, and sandbox tests pass.

**Step 6: Commit**

Commit message: `feat(preview): isolate sandbox deployments`

### Task 4: Verify the code slice

**Files:**
- Review all files changed by Tasks 1-3.

**Step 1: Run focused suites**

Run all new and directly affected tests and confirm they pass without unexpected console output.

**Step 2: Run static verification**

Run:

- `./node_modules/.bin/tsc --noEmit`
- `npm run lint`
- `git diff --check`

Expected: clean typecheck/diff and no new Biome warnings.

**Step 3: Run full verification**

Run:

- `npm test`
- `npm run build`

Expected: all tests and the production build pass.

**Step 4: Commit any test-only cleanup**

Commit message, only if needed: `test: close production hardening regressions`

### Task 5: Configure and deploy production safely

**Files:**
- No secret files. Use managed Convex and Vercel environment stores only.

**Step 1: Configure Convex auth origin**

Set production Convex `SITE_URL` to `https://repo-press-itsyogesh.vercel.app`. Retain the existing production capability secret.

**Step 2: Generate preview signing material**

Generate a P-256 key pair in memory. Never print or write the private JWK.

**Step 3: Configure production Studio**

Set production Vercel:

- `REPOPRESS_CAPABILITY_SECRET` from production Convex;
- `PREVIEW_APPROVAL_PRIVATE_KEY_JWK` to the private JWK;
- `NEXT_PUBLIC_PREVIEW_APPROVAL_PUBLIC_KEY_JWK` to the public JWK;
- `NEXT_PUBLIC_PREVIEW_ORIGIN` to the dedicated sandbox origin.

**Step 4: Create/configure the sandbox project**

Create a dedicated Vercel project from the reviewed branch with:

- `REPOPRESS_DEPLOYMENT_ROLE=sandbox`;
- `NEXT_PUBLIC_APP_URL=https://repo-press-itsyogesh.vercel.app` for CSP `frame-ancestors`;
- the public production `NEXT_PUBLIC_CONVEX_URL` and `NEXT_PUBLIC_CONVEX_SITE_URL` required by the shared build;
- the matching `NEXT_PUBLIC_PREVIEW_APPROVAL_PUBLIC_KEY_JWK`.

Keep the sandbox production deployment public; do not add Studio auth,
`CONVEX_DEPLOYMENT`, the capability secret, or the private key. The deployment
gate must still reject all runtime application/API routes and all non-GET/HEAD
requests.

**Step 5: Push, open PR, review, and merge**

Push `fix/production-hardening`, open a PR, confirm CI, perform a differential review, and merge only when clean.

**Step 6: Redeploy both roles from the merged commit**

Deploy the sandbox project and main Studio production with the finalized configuration. Confirm both deployment SHAs match the reviewed source.

### Task 6: Production browser E2E

**Files:**
- No repository changes unless a reproducible defect is found; any defect starts a fresh RED/GREEN cycle.

**Step 1: Test GitHub OAuth**

Use Chrome to sign out of PAT state, start GitHub OAuth, confirm the redirect reaches GitHub, returns through `/api/auth/callback/github`, sets the app session, and loads the dashboard. Verify a forced returned-error fixture locally renders the new alert.

**Step 2: Test repository connection**

Open `itsyogesh/merry-magic-mail`, create or sync its production project, and confirm no capability/configuration error appears.

**Step 3: Test Studio and MDX components**

Open `apps/web/app/(main)/blog/santa-letter-template-free/page.mdx`. Confirm CoverImage, InfoBox, LetterPaper, Checklist, and CTABox are discovered and available in the insert palette.

**Step 4: Test Compatible iframe**

Switch to Compatible fidelity. Confirm the iframe document loads from the dedicated sandbox origin, the signed adapter renders, there are no CSP/protection failures, and no host-realm repository code executes.

**Step 5: Test recovery and responsive UI**

Exercise a recoverable repository failure and validate the branded boundary. At 375×812, confirm Save and More remain visible and compact project/theme controls are reachable.

**Step 6: Cleanup temporary E2E infrastructure**

After the permanent production Studio and dedicated sandbox pass, delete the obsolete temporary deployments/aliases and revoke the temporary Vercel bypass. Do not remove permanent production configuration.
