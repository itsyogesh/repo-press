# Production Hardening Design

## Goal

Make the merged MDX component ecosystem usable in production by fixing GitHub OAuth, replacing the bare crash screen with actionable recovery UI, and deploying Compatible preview on a separately isolated origin.

## Confirmed failures

- Production Convex has no `SITE_URL`, so Better Auth rejects `POST /api/auth/sign-in/social` with HTTP 403.
- The login client catches thrown exceptions but ignores Better Auth's returned `{ error }`, so OAuth failures are silent.
- Production Vercel has no `REPOPRESS_CAPABILITY_SECRET`, so repository hubs fail closed while minting project capabilities.
- `app/global-error.tsx` is an unstyled last-resort boundary, and there is no dashboard route boundary to preserve useful navigation and recovery actions.
- A Vercel-protected preview deployment cannot be embedded as a third-party iframe. Compatible preview requires a distinct, publicly reachable sandbox origin.

## Architecture

### Error recovery UI

Add a reusable branded error-state component using the Editorial design system. A dashboard-level `error.tsx` keeps failures inside the authenticated product shell and offers `Try again` and `Back to dashboard`. The root `global-error.tsx` uses the same visual language as a standalone last resort without depending on application providers that may have failed.

Messages remain calm and specific: the workspace could not open, saved GitHub content is unaffected, and retry/navigation are available. Unexpected error details remain in telemetry; only the opaque digest may be shown for support.

### GitHub OAuth

Treat `signIn.social` as a result-bearing API. A returned Better Auth error becomes a visible destructive alert, thrown/network failures use a generic retry message, and successful results retain the requested safe in-app callback. Loading state always settles and duplicate submission remains disabled.

Production Convex receives `SITE_URL=https://repo-press-itsyogesh.vercel.app`. The GitHub OAuth callback remains routed through `/api/auth/callback/github` on the application origin so the application domain receives the session cookies.

### Capability configuration

Copy the existing production Convex `REPOPRESS_CAPABILITY_SECRET` into production Vercel without displaying or persisting its value outside the managed environment. This remains a production setting because repository, media, and publish capabilities depend on it.

### Dedicated Compatible preview origin

Add a deployment-role gate controlled by `REPOPRESS_DEPLOYMENT_ROLE=sandbox`. In sandbox mode, only `/preview/sandbox` and the static assets required to render it are reachable; application, dashboard, auth, and mutation routes return 404. Normal Studio deployments are unchanged.

Create a dedicated public Vercel sandbox project from the same reviewed commit. Generate one P-256 key pair: the private JWK is server-only in the Studio production environment, while the matching public JWK is browser-readable in both Studio and sandbox builds. Point `NEXT_PUBLIC_PREVIEW_ORIGIN` at the dedicated sandbox production origin. The sandbox remains public at the network edge because repository code is admitted only through RepoPress's signed approval protocol and executes inside the opaque iframe containment boundary.

### Data flow

1. User authenticates with GitHub through the production app and Convex Better Auth.
2. Studio loads a repository document and requests a compatible artifact from the production server.
3. The production server resolves the pinned product adapter and signs the exact artifact with the private P-256 key.
4. The browser sends the artifact and signature to the opaque iframe hosted on the dedicated sandbox origin.
5. The sandbox verifies the public-key signature and existing protocol constraints before executing the approved adapter.

## Testing

- Unit/component tests for returned OAuth errors, thrown OAuth failures, callback retention, loading state, and successful redirection behavior.
- Component tests for branded dashboard and global recovery states, including accessible headings and actions.
- Proxy/route-gate tests proving sandbox mode allows only the preview document and required Next.js assets while rejecting dashboard, auth, and API routes.
- Existing capability, signing, sandbox-containment, and Studio suites remain green.
- Full lint, typecheck, test, build, and `git diff --check` verification.
- Production browser E2E: GitHub OAuth, PAT fallback, Merry Magic Mail setup, target MDX document, five product components, Compatible preview iframe, error recovery, and 375 px responsive controls.

## Rollback

The code change is isolated in one PR. Deployment rollback consists of restoring the previous Studio deployment, removing the sandbox project, removing the preview signing variables and origin from Studio, and retaining the production capability secret and `SITE_URL` because they are required independently of Compatible preview.
