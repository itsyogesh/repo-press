# RepoPress.org Domain Migration Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Move RepoPress and its isolated Compatible preview to stable first-party domains without weakening the preview security boundary or interrupting GitHub OAuth.

**Architecture:** `repopress.org` is the canonical application origin, `www.repopress.org` redirects to it, and `preview.repopress.org` is a distinct sandbox origin. Domain Collective manages Namecheap DNS through its product UI while Vercel, Convex Better Auth, and GitHub OAuth are updated only after the exact DNS records resolve.

**Tech Stack:** Vercel, Namecheap via Domain Collective, Convex, Better Auth, GitHub OAuth, Next.js 16

---

## Completion status

Completed on 2026-08-03. The production application, OAuth authority, and isolated Compatible preview now use the first-party domains. Existing `vercel.app` aliases are retained as rollback targets that require the coordinated configuration changes below; they are not seamless OAuth failover origins.

### Task 1: Capture the reversible production baseline

**Files:**
- Modify: `docs/plans/2026-08-02-repopress-org-domain-migration.md`

**Step 1: Record application and sandbox deployments**

Run:

```bash
npx vercel inspect repo-press.vercel.app
npx vercel inspect repo-press-preview.vercel.app
```

Expected: both production deployments are `Ready`; record their deployment IDs without recording any environment-variable values.

**Step 2: Record public DNS before mutation**

Run:

```bash
dig +short A repopress.org
dig +short A www.repopress.org
dig +short A preview.repopress.org
```

Expected: a newly purchased domain may have parking records or no records. Preserve the output in the execution report.

**Step 3: Confirm the existing Vercel aliases remain healthy**

Run:

```bash
curl -I https://repo-press.vercel.app
curl -I https://repo-press-preview.vercel.app/preview/sandbox
```

Expected: the application responds successfully and the sandbox route remains reachable before any migration.

### Task 2: Attach the three domains to Vercel

**Files:**
- Modify: `docs/plans/2026-08-02-repopress-org-domain-migration.md`

**Step 1: Attach application domains**

Use the Vercel CLI or dashboard to attach `repopress.org` and `www.repopress.org` to the `repo-press` project. Do not detach existing `vercel.app` aliases.

**Step 2: Attach the sandbox domain**

Attach `preview.repopress.org` to the `repo-press-preview` project. It must never be attached to the application project.

**Step 3: Capture exact DNS instructions**

Run Vercel domain inspection for all three names and copy the exact required record type, host, and value into the execution report. Do not substitute remembered Vercel defaults.

### Task 3: Apply DNS through Domain Collective

**Files:**
- No repository changes.

**Step 1: Resync the Namecheap integration**

In the deployed Domain Collective UI, trigger a registrar resync and verify that `repopress.org` is imported exactly once.

**Step 2: Enter only Vercel's exact records**

Create or update the required apex, `www`, and `preview` records. Preserve mail, verification, nameserver, DNSSEC, and unrelated records. Stop for approval if a conflicting record must be deleted.

**Step 3: Verify persistence and provider state**

Reload the UI, resync again, and confirm the records remain normalized and visible. Record product feedback, latency, errors, and every UX problem separately from registrar propagation.

### Task 4: Verify DNS and TLS before changing auth

**Files:**
- No repository changes.

**Step 1: Verify authoritative and public resolution**

Run:

```bash
dig +short A repopress.org
dig +short A www.repopress.org
dig +short A preview.repopress.org
```

Expected: each name matches the exact Vercel instruction captured in Task 2.

The exact record set selected by Vercel and applied through Domain Collective was:

- `A @ 76.76.21.21`
- `A www 76.76.21.21`
- `A preview 76.76.21.21`

**Step 2: Verify Vercel ownership and certificates**

Inspect all three domains until Vercel reports valid configuration and TLS certificates. Do not move authentication while any certificate is pending or invalid.

### Task 5: Switch production origins atomically

**Files:**
- Modify only managed Vercel, Convex, and GitHub OAuth configuration.
- Never write secrets to repository files or terminal output.

**Step 1: Update production Convex auth origin**

Run:

```bash
npx convex env set --prod SITE_URL https://repopress.org
```

Expected: Better Auth uses the exact canonical application origin.

**Step 2: Update the RepoPress Vercel project**

Set production values:

- `NEXT_PUBLIC_APP_URL=https://repopress.org`
- `NEXT_PUBLIC_PREVIEW_ORIGIN=https://preview.repopress.org`

Preserve all secrets and signing keys unchanged.

**Step 3: Update the sandbox Vercel project**

Set production `NEXT_PUBLIC_APP_URL=https://repopress.org`. Preserve `REPOPRESS_DEPLOYMENT_ROLE=sandbox`, the public verification key, and the existing Convex public URLs. Never add the capability secret, GitHub token, or private signing key to the sandbox.

**Step 4: Update GitHub OAuth**

Set the GitHub OAuth application's homepage to `https://repopress.org` and callback to the exact Better Auth callback on that origin. Keep the old application available until a fresh OAuth round trip succeeds.

### Task 6: Redeploy and verify end to end

**Files:**
- No source changes unless verification exposes a reproducible bug.

**Step 1: Redeploy both Vercel projects**

Redeploy production application and sandbox after their environment changes. Verify each custom domain points to the new `Ready` deployment.

**Step 2: Verify routing and isolation**

Confirm:

- `https://repopress.org` loads RepoPress.
- `https://www.repopress.org` redirects to the canonical origin.
- `https://preview.repopress.org/preview/sandbox` loads the sandbox document.
- dashboard, auth, API, and mutation routes remain unavailable on the sandbox origin.

**Step 3: Verify fresh GitHub OAuth**

Use a fresh login flow, confirm the callback remains on `repopress.org`, and verify a protected dashboard page loads. Do not inspect browser cookies or storage.

**Step 4: Verify Merry Magic Mail Compatible preview**

Open the known Merry article, verify Compatible fidelity, the isolated iframe, all five product components, component editing, the insert palette, and responsive preview controls.

**Step 5: Verify old aliases remain safe fallbacks**

Confirm the old `vercel.app` application alias either remains usable or redirects safely during the transition. Do not remove it during this migration.

## Execution report

### Deployment and routing evidence

- Pre-migration application baseline: `dpl_3GZCW6G5mfjAx393CAGijSgNtoL1`, source `b798e124af749bebea12f8324fbfaf6d31e4f475`.
- Pre-migration sandbox baseline: `dpl_6sgTdaJbA7SKnBrw2xqDiVQgpFAP`, source `c2185cd97c714ccc3e0790851842344e72750724`.
- Application deployment: `dpl_Hs3p7EW6ufzUUhZ1WwAgjSaF3k4i` (`Ready`), a configuration redeploy of source `b798e124af749bebea12f8324fbfaf6d31e4f475`, aliased to `repopress.org` and the retained `repo-press.vercel.app` rollback target.
- Sandbox deployment: `dpl_6xwYJnprGErBbYJ9Q15zDXr1yL2n` (`Ready`), a configuration redeploy of source `c2185cd97c714ccc3e0790851842344e72750724`, aliased to `preview.repopress.org` and the retained `repo-press-preview.vercel.app` rollback target. The later application-only commits affect Studio component editing, not the isolated runtime; both projects must nevertheless be redeployed from the merged migration head before handoff so their source provenance is aligned.
- `repopress.org` resolves only to `76.76.21.21`, presents valid TLS, and returns HTTP 200.
- `www.repopress.org` resolves only to `76.76.21.21`, presents valid TLS, and permanently redirects with HTTP 308 to the apex.
- `preview.repopress.org/preview/sandbox` returns HTTP 200. The sandbox root, dashboard, and auth/API routes intentionally return HTTP 404; a root 404 is the deployment-role gate working, not a missing deployment.
- The sandbox response allows embedding only from `https://repopress.org` through both CORS and CSP `frame-ancestors`.

### Auth and MDX browser evidence

- GitHub OAuth homepage and callback were moved to the apex origin. A fresh GitHub sign-in returned to `https://repopress.org/dashboard` and loaded the authenticated project list.
- The Merry Magic Mail article canonicalized to its full repository path and rendered in Compatible fidelity inside the isolated iframe.
- `CoverImage`, `InfoBox`, `Checklist`, `CTABox`, and `LetterPaper` all rendered. Each was discoverable in the insert palette, CoverImage exposed its declared literal props in the component editor, and cancelling did not modify the document.
- Desktop, tablet, and mobile preview controls each entered their checked state. The one visible diagnostic correctly describes the `static-inert-v1` fidelity and is informational rather than a render error.

### Domain Collective product audit

The registrar resync and DNS mutation were performed in the dedicated Domain Collective task. The audit found:

- The UI initially hid the conflicting Namecheap parking record.
- Changing a record type required a delete-and-add sequence rather than one atomic edit.
- Propagation and authoritative-conflict feedback was too weak, and the roughly 20-second resync showed only generic progress.
- Record action buttons need host-specific accessible names.
- Domain discovery, nameserver hierarchy, deletion confirmation, `@` normalization, and TTL handling worked well.

The old parking address was ultimately removed from Namecheap authoritatively and disappeared from public resolvers.

### Task 7: Document and hand off

**Files:**
- Modify: `README.md`
- Modify: `docs/plans/2026-08-02-production-hardening-design.md`
- Modify: `docs/plans/2026-08-02-production-hardening.md`
- Modify: `docs/plans/2026-08-02-repopress-org-domain-migration.md`

**Step 1: Replace the transitional Vercel canonical origin**

Update production guidance to use `https://repopress.org` and `https://preview.repopress.org`, while retaining `vercel.app` URLs only as operational fallbacks.

**Step 2: Record verification evidence and rollback**

Record deployment IDs, DNS record types without secrets, OAuth result, browser E2E result, Domain Collective critique location, and rollback instructions.

**Step 3: Verify documentation**

Run:

```bash
git diff --check
rg -n "repo-press\.vercel\.app|repo-press-preview\.vercel\.app" README.md docs
```

Expected: any remaining Vercel-domain references are explicitly labeled as fallback or historical evidence.

**Step 4: Commit through a reviewed PR**

Run the repository's proportional verification, commit the migration documentation on this feature branch, push it, open a PR, and merge only after CI and the live E2E are green.

## Rollback

If OAuth or the custom application domain fails, perform an ordered origin rollback:

1. Set the sandbox project's production `NEXT_PUBLIC_APP_URL` to `https://repo-press.vercel.app` and redeploy the sandbox first. Verify its `/preview/sandbox` response now allows that origin in CORS and CSP `frame-ancestors`.
2. Restore production Convex `SITE_URL` and the Studio project's `NEXT_PUBLIC_APP_URL` to `https://repo-press.vercel.app`.
3. Restore the GitHub OAuth homepage and exact callback to the `repo-press.vercel.app` origin, then redeploy the Studio and test a fresh OAuth round trip.

If only the custom preview origin fails, restore the Studio project's `NEXT_PUBLIC_PREVIEW_ORIGIN` to `https://repo-press-preview.vercel.app` and redeploy the Studio; the sandbox parent-origin setting does not change in that case. Do not weaken iframe sandboxing. DNS records and custom-domain attachments can remain in place while the old aliases serve as rollback targets.
