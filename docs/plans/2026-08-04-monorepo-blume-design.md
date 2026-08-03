# RepoPress Monorepo and Blume Documentation Design

Date: 2026-08-04
Status: Approved for implementation
Domains: `repopress.org`, `docs.repopress.org`

## Goal

Turn RepoPress into a small npm-workspaces monorepo with two independently deployable products:

- `apps/web`: the existing Next.js, Convex, Studio, and preview platform;
- `apps/docs`: a Blume documentation site that is itself managed as file-driven content by RepoPress.

The split must preserve the existing web application, make public documentation easier to extend, and demonstrate the product thesis by connecting RepoPress to `apps/docs/content` after deployment.

## Decisions

### Workspace shape

```text
repo-press/
├── apps/
│   ├── web/
│   └── docs/
├── packages/             # reserved until code is actually shared
├── docs/                 # internal plans, reviews, runbooks, and handoffs
├── package.json          # workspace orchestration only
└── package-lock.json     # the only lockfile
```

Use npm workspaces without Turborepo. Two applications do not yet justify a task graph or remote cache. Root scripts delegate to workspace scripts, while application dependencies stay in their owning workspace.

The repository standardizes on Node 22.12 or newer because Blume requires it and CI already uses Node 22. `pnpm-lock.yaml` and `bun.lockb` are removed after the npm workspace lock is regenerated.

### Application boundary

`apps/web` owns all runtime code and configuration for the current product, including Next.js, Convex, Studio, the compatible preview sandbox, Remotion, web tests, and web-only scripts. It remains one deployable unit; Convex is not extracted into a package because it is coupled to this application's generated API and deployment.

`apps/docs` is a standalone Blume application. It owns its package manifest, `blume.config.ts`, public assets, and filesystem content root. It must build without importing code from `apps/web`.

The root owns repository policy, GitHub workflows, internal engineering documentation, and workspace orchestration. `packages/` remains empty until a real cross-application API emerges.

### Documentation boundary

Public product documentation moves into `apps/docs/content`:

- getting started and repository connection guides;
- Studio authoring documentation;
- architecture and preview-security explanations intended for adopters;
- component-authoring and extension tutorials.

Internal plans, differential reviews, deployment runbooks, handoffs, and historical design notes remain under root `docs/`. The Blume content source must never automatically ingest all root documentation.

The current Next.js `/docs` implementation is retired. `repopress.org/docs` and all nested `/docs/*` paths permanently redirect to the corresponding path on `https://docs.repopress.org`.

### Blume configuration

The first docs release pins `blume@1.3.1` and uses its filesystem content source with static build output. It enables built-in navigation, keyless Orama search, code rendering, generated `llms.txt`/`llms-full.txt`, raw Markdown mirrors, and agent-readability metadata. Hosted MCP and Ask AI remain disabled: Blume requires a server output and adapter for MCP, which would change the deployment and security boundary.

Content stays ordinary Markdown or MDX. Blume-specific presentation components may improve a page, but core documentation must remain readable outside Blume and editable through RepoPress.

### RepoPress dogfooding

RepoPress adds `blume` to framework detection and adapter metadata. Detection uses the repository's declared Blume dependency and/or `blume.config.*`; the suggested content root is `content` relative to the Blume workspace. RepoPress must continue to support manually selecting any content root, including `apps/docs/content` from the repository root.

After both applications deploy, the production RepoPress account connects this repository with `apps/docs/content` as a project. A safe documentation-only edit is opened, previewed, saved, and published to a lane as the end-to-end acceptance test.

### Deployment model

Vercel uses two projects from the same GitHub repository:

- existing RepoPress project: root directory `apps/web`, canonical domain `repopress.org`;
- new docs project: root directory `apps/docs`, canonical domain `docs.repopress.org`.

Each project runs its workspace-local build command and has independent deployment status. The docs application does not receive Convex, GitHub, or capability-signing secrets. Existing web environment configuration remains scoped to the web project.

The domain is attached only after the docs preview deployment passes. Rollback is independent: the web redirect can be removed and the docs domain detached without changing content or Convex state.

## Migration sequence

1. Merge the green Studio authoring PR so its new public guides are part of the migration source.
2. Move the existing product into `apps/web` without behavior changes.
3. Establish npm workspace scripts and a single lockfile; restore web lint, typecheck, tests, and production build.
4. Scaffold `apps/docs`, configure Blume, and migrate only public documentation.
5. Add the external `/docs` redirects and update product/README links.
6. Add Blume framework detection and tests.
7. Update CI and Vercel configuration for both deployable applications.
8. Verify both builds, browser navigation, redirects, and mobile/desktop docs layouts.
9. Deploy both projects, attach `docs.repopress.org`, and complete the RepoPress-on-RepoPress publishing test.

## Safety and compatibility

- No application behavior is intentionally changed during the physical `apps/web` move.
- TypeScript aliases remain workspace-local and continue to resolve `@/*` inside the web application.
- Convex commands run from `apps/web`, where the `convex/` directory and generated API remain colocated.
- GitHub Actions use root workspace scripts so one command verifies both applications.
- Vercel project roots prevent the docs build from seeing web secrets or treating internal docs as routable content.
- Existing deep links are preserved by permanent path-for-path redirects.

## Acceptance criteria

- A clean clone needs only `npm ci` at the repository root.
- `npm run lint`, `npm run typecheck`, `npm test`, and `npm run build` validate the complete workspace.
- `npm run dev:web` and `npm run dev:docs` start the applications independently.
- The full pre-migration web test suite and production build remain green.
- Blume builds a static docs site containing the migrated public pages, navigation, search, and valid internal links.
- `/docs` and a nested legacy docs URL redirect to `docs.repopress.org` with the path preserved.
- `docs.repopress.org` serves valid TLS and the Blume site without access to web secrets.
- RepoPress detects or accepts the Blume project at `apps/docs/content`, opens its MDX, and produces a reviewable documentation publish lane.

## Non-goals

- extracting shared UI or configuration packages before duplication exists;
- adding Turborepo, Nx, or a separate package registry;
- replacing Blume internals or committing to it as an irreversible public API;
- migrating internal engineering documents into the public site;
- adding authenticated AI chat to documentation;
- combining the two Vercel deployments into one runtime.
