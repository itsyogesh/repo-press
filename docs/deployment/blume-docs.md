# Blume docs deployment runbook

The RepoPress documentation site is a separate static Vercel project backed by `apps/docs` in the same repository. Its canonical production origin is `https://docs.repopress.org`.

## Project settings

| Setting | Value |
|---|---|
| Git repository | `itsyogesh/repo-press` |
| Root Directory | `apps/docs` |
| Framework Preset | Other |
| Node.js | 22.x (`>=22.12.0`) |
| Install Command | `npm ci` (resolved from the repository workspace root) |
| Build Command | `npm run build` |
| Output Directory | `dist` |
| Production domain | `docs.repopress.org` |

Keep Vercel's access to files outside the Root Directory enabled. npm must be able to read the repository-root `package.json` and sole `package-lock.json` to install the workspace consistently.

## Environment boundary

The static docs project requires no Convex, GitHub, Better Auth, preview-signing, or capability secrets. Do not copy web-project variables into it. The only canonical-origin configuration lives in `blume.config.ts` and contains no secret.

The existing RepoPress Vercel project changes its Root Directory to `apps/web`; all existing web variables remain attached only to that project.

## Pre-domain verification

Before attaching the production domain:

1. Run `npm ci`, `npm run docs:validate`, `npm run docs:doctor`, and `npm run build` from the repository root.
2. Verify the Vercel preview serves the home page, navigation, search index, `llms.txt`, sitemap, and a nested guide.
3. Verify an internal root document such as `docs/plans/...` is not routable.
4. Check desktop and mobile navigation, code blocks, images, focus states, and broken-link output.
5. Confirm the deployment has no environment variables copied from the web project.

## Domain cutover

1. Attach `docs.repopress.org` to the docs project.
2. Confirm Vercel provisions TLS and the hostname returns the Blume site.
3. Confirm `https://repopress.org/docs` and a nested legacy `/docs/*` path permanently redirect to the matching docs-domain path.
4. Verify canonical URLs, sitemap URLs, and raw Markdown/LLM endpoints use the production hostname.

## Dogfood acceptance

In RepoPress, create or sync a project for this repository with content root `apps/docs/content`. Open a public page, make a harmless documentation edit, save it, preview it, publish to a RepoPress lane, and inspect the resulting pull request. Record any setup, framework-detection, editing, preview, or publishing friction before merging or closing that test PR.

## Rollback

Detach `docs.repopress.org` from the docs project and remove the external `/docs` redirect from the web application. This does not alter Git content or Convex state. The docs deployment can be rolled back independently through Vercel while the web application remains online.
