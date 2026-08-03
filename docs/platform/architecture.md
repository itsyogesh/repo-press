# RepoPress platform architecture

RepoPress is a Git-native CMS for Markdown and MDX repositories. It gives authors a visual Studio and a draft/publish workflow without making the RepoPress database the published-content source of truth.

## Authority boundaries

| Concern | Authority | What the other layers may store |
|---|---|---|
| Published content and media | The configured GitHub repository, branch, and content root | Convex tracks drafts, staged operations, Git baselines, and publish provenance |
| Project definition | `repopress.config.json` in Git for config-backed projects | Convex keeps an access-scoped projection used by the application |
| Installed component contract | The nearest valid `repopress.lock.json` at the exact Git commit | Studio receives frozen declarative authoring metadata, not component functions |
| Unpublished edits | Convex | The repository is unchanged until publish |
| Application orchestration | Next.js route handlers and server components | They authenticate requests, read GitHub, call Convex, and construct bounded preview inputs |
| Authentication and durable workflow state | Better Auth inside Convex and Convex tables | Next.js proxies auth and mints narrowly scoped server/project capabilities |

This separation is deliberate:

- Git is the portable, reviewable output. Removing RepoPress does not remove published content.
- Convex makes drafts, optimistic concurrency, staged operations, recovery, and real-time UI practical.
- Next.js is an orchestrator, not a second content database and not a host for repository code.

## Main request path

```text
Browser Studio
  -> authenticated Next.js page/route
  -> Convex project and draft state
  -> GitHub repository at a pinned branch head
  -> Generic preview or signed Compatible preview
```

The Studio page resolves the project from the authenticated repository route. A `projectId` supplied in a URL is not trusted as repository authority. The project record supplies the owner, repository, base branch, and `contentRoot`; GitHub supplies the current committed bytes.

## Repository configuration

A config-backed repository has a root `repopress.config.json`:

```json
{
  "version": 1,
  "defaults": {
    "branch": "main",
    "framework": "auto"
  },
  "projects": [
    {
      "id": "blog",
      "name": "Company blog",
      "contentRoot": "content/blog",
      "framework": "next-mdx",
      "contentType": "blog",
      "branch": "main"
    }
  ]
}
```

One repository can contain multiple projects as long as each has its own project ID and content root. A project can also set a Compatible preview entry and declarative component metadata. See [Component authoring](./component-authoring.md).

On setup, RepoPress:

1. authenticates the GitHub user and determines repository access;
2. detects the default branch and framework from repository files;
3. asks the user to confirm the branch, content root, framework, and content type;
4. creates `repopress.config.json` when it is absent; and
5. synchronizes each config project into Convex.

The advanced setup path can create a Convex project without a config file, but config-backed projects are the portable path.

## Framework adapters and preview adapters are different

RepoPress uses two kinds of adapter:

| Adapter | Runs where | Responsibility |
|---|---|---|
| Framework adapter | RepoPress application | Detect framework conventions, suggest content roots, define frontmatter fields, and choose naming/meta-file conventions |
| Compatible preview adapter | Isolated Compatible worker | Map a product's MDX vocabulary to RepoPress preview primitives |

A framework adapter does not render repository components. A Compatible preview adapter does not define the production implementation. This distinction keeps the core framework-neutral: a Next.js, Astro, or Fumadocs site may bind the same MDX name differently while exposing the same authoring contract.

## Document and draft lifecycle

### Loading

Committed Markdown/MDX is read from GitHub. RepoPress parses supported frontmatter or a supported static metadata export without evaluating repository code. If a Convex document has a newer draft snapshot, Studio hydrates the editor from that draft.

Paths stored on current document rows are relative to the project's `contentRoot`. Git operations resolve them back to repository-relative paths at the boundary.

### Saving a draft

`Save draft` calls the Convex `documents.saveDraft` mutation. It:

- checks project ownership or the scoped project access token;
- requires the expected `updatedAt` when provided, preventing silent last-write-wins;
- appends the previous content to document history; and
- updates the draft body, frontmatter, content version, and draft status.

Saving a draft does not write to GitHub. File creates/deletes and media uploads are staged separately as `explorerOps` and `mediaOps` so one publish can review the complete change set.

### Publishing

The production publish path is pull-request based:

1. Studio saves the current document draft.
2. The publish route gathers dirty documents and pending explorer/media operations.
3. It chooses the active publish lane or creates a new lane.
4. It pins one Git authority SHA and performs typed preflight reads at that SHA.
5. It serializes content while preserving each document's metadata format.
6. A durable `publishAttempts` row records the plan, expected head, associations, and digest before committing.
7. Git changes are committed with compare-and-swap semantics to the lane branch.
8. RepoPress opens or reuses a pull request and reconciles exact commit provenance into Convex.

Retries recover from the durable attempt and Git evidence instead of creating a second commit. A moved branch head, stale draft, changed staged operation, or ambiguous GitHub read fails closed before a new commit.

When GitHub reports that the pull request merged, RepoPress records the immutable merge authority and finishes bounded cleanup. If the pull request closes without merging, lane invalidation restores still-relevant staged work and marks lane-published documents dirty again. Closing a PR therefore does not silently discard authored content.

## Component authority flow

There are three separate pieces:

1. **Production component**: owned by the product repository and executed only by that product's runtime.
2. **Authoring metadata**: JSON data describing the MDX name, props, slots, fixture paths, and provenance.
3. **Compatible mapping**: an optional repository adapter that maps the component to bounded semantic preview primitives.

For installed registry items, RepoPress writes implementation files, the product runtime-map binding, styles/dependencies when required, and `repopress.lock.json` in a reviewed pull request. Studio loads the closest lock candidate from the exact base commit. If both project config and an integrity-bound lock define the same MDX name, the installed lock metadata wins.

No React function from the repository or registry enters Studio state. The host receives only validated, frozen metadata. Executable Compatible source is independently fetched, bounded, signed, and executed in the sandbox described in [Preview security](./preview-security.md).

## Authentication boundary

Better Auth is instantiated only in `convex/auth.ts`. Browser clients use the Convex Better Auth client, while Next.js server helpers proxy to Convex. Do not create a Better Auth instance in a Next.js route or component.

GitHub OAuth tokens or PAT credentials are used server-side for repository access. Mutations that change project data validate ownership or a scoped project access token. Server-only capabilities and Compatible signing keys must never be sent to the browser.

## Code landmarks

- Project/config schema: [`lib/config-schema.ts`](../../lib/config-schema.ts)
- Config synchronization: [`lib/sync-projects.ts`](../../lib/sync-projects.ts)
- Framework detection: [`lib/framework-adapters/`](../../lib/framework-adapters/)
- Convex schema: [`convex/schema.ts`](../../convex/schema.ts)
- Draft mutations: [`convex/documents.ts`](../../convex/documents.ts)
- Publish route: [`app/api/github/publish-ops/route.ts`](../../app/api/github/publish-ops/route.ts)
- Registry and lock schemas: [`lib/repopress/registry-schema.ts`](../../lib/repopress/registry-schema.ts), [`lib/repopress/lock-schema.ts`](../../lib/repopress/lock-schema.ts)
- Preview contracts: [`lib/preview/`](../../lib/preview/)

## Continue reading

- [Component authoring and extension contract](./component-authoring.md)
- [Preview fidelity and security](./preview-security.md)
- [Connect an MDX repository](../tutorials/connect-an-mdx-repository.md)
- [Build a component extension](../tutorials/build-a-component-extension.md)
