# RepoPress documentation

This workspace is the public RepoPress documentation site, built with Blume and deployed independently at [docs.repopress.org](https://docs.repopress.org).

## Commands

Run commands from the repository root:

```sh
npm run dev:docs
npm run typecheck --workspace @repopress/docs
npm run validate --workspace @repopress/docs
npm run doctor --workspace @repopress/docs
npm run build --workspace @repopress/docs
```

Public documentation belongs in `content/`. Internal plans, reviews, runbooks, and handoffs remain in the repository-root `docs/` directory and must not be copied here.

The deployed application is fully static. It does not need or receive RepoPress web, Convex, GitHub OAuth, or capability-signing secrets.

## Workspace compatibility pin

The root workspace pins Zod `4.4.3` as a development dependency for Blume `1.3.1`. Blume's static prerender links its generated runtime to the root `node_modules`, where it requires Zod 4's `prefault` API. The web workspace continues to own and resolve its pinned Zod 3 release independently.
