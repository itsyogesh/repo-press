# Blume docs deployment runbook

The RepoPress documentation site is a separate static Vercel project backed by `apps/docs` in the same repository. Its canonical production origin is `https://docs.repopress.org`.

## Project settings

| Setting | Value |
|---|---|
| Git repository | `itsyogesh/repo-press` |
| Root Directory | `apps/docs` |
| Framework Preset | Other |
| Node.js | 24.x on Vercel (workspace minimum: `>=22.12.0`) |
| Install Command | `npm ci` (resolved from the repository workspace root) |
| Build Command | `npm run build` |
| Output Directory | `dist` |
| Production domain | `docs.repopress.org` |

Keep Vercel's access to files outside the Root Directory enabled. npm must be able to read the repository-root `package.json` and sole `package-lock.json` to install the workspace consistently.

## Environment boundary

The static docs project requires no Convex, GitHub, Better Auth, preview-signing, or capability secrets. Do not copy web-project variables into it. The only canonical-origin configuration lives in `blume.config.ts` and contains no secret.

## Dependency audit exception

Blume 1.3.1 currently brings `@astrojs/vercel` into its build toolchain even when the site uses Astro's static output. That adapter pins `@vercel/routing-utils`, which in turn pins a vulnerable `path-to-regexp` 6.1.0. RepoPress does not deploy the adapter or its route compiler: the docs build emits static files from `dist`, and Vercel serves those files directly. Treat the remaining `npm audit --omit=dev` finding as a tracked, build-time-only upstream exception until Blume updates its dependency tree. Do not use `npm audit fix --force`, and re-evaluate the exception on every Blume upgrade.

Both existing Next.js Vercel projects change their Root Directory to `apps/web` and switch their install/build commands from Bun to npm:

- `repo-press` (`repopress.org`);
- `repo-press-preview` (`preview.repopress.org`).

Use `npm ci` as the install command and `npm run build` as the build command. All existing web variables remain attached only to those projects. Update both projects before expecting Git-connected previews from the monorepo branch.

## Pre-domain verification

Before attaching the production domain:

1. Run `npm ci`, `npm run docs:validate`, `npm run docs:doctor`, and `npm run build` from the repository root.
2. Verify the Vercel preview serves the home page, navigation, search index, `llms.txt`, sitemap, and a nested guide.
3. Verify an internal root document such as `docs/plans/...` is not routable.
4. Check desktop and mobile navigation, code blocks, images, focus states, and broken-link output.
5. Confirm the deployment has no environment variables copied from the web project.

## Domain cutover

1. Attach `docs.repopress.org` to the docs project.
2. In Namecheap Advanced DNS, add `A docs 76.76.21.21`. The repository currently keeps the authoritative `registrar-servers.com` nameservers, so attaching the hostname in Vercel alone is not enough.
3. Confirm Vercel verifies the domain, provisions TLS, and the hostname returns the Blume site.
4. Confirm `https://repopress.org/docs` and a nested legacy `/docs/*` path permanently redirect to the matching docs-domain path.
5. Verify canonical URLs, sitemap URLs, and raw Markdown/LLM endpoints use the production hostname.

## Dogfood acceptance

In RepoPress, create or sync a project for this repository with content root `apps/docs/content`. Open a public page, make a harmless documentation edit, save it, preview it, publish to a RepoPress lane, and inspect the resulting pull request. Record any setup, framework-detection, editing, preview, or publishing friction before merging or closing that test PR.

## Rollback

Detach `docs.repopress.org` from the docs project and remove the external `/docs` redirect from the web application. This does not alter Git content or Convex state. The docs deployment can be rolled back independently through Vercel while the web application remains online.
