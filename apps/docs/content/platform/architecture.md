---
title: Platform architecture
description: Understand RepoPress authority boundaries, project configuration, drafts, publishing, and component extensions.
---

RepoPress is a Git-native CMS for Markdown and MDX repositories. It gives authors a visual Studio and draft/publish workflow without making the application database the published-content source of truth.

## Authority boundaries

| Concern | Authority | What other layers store |
| --- | --- | --- |
| Published content and media | Configured GitHub repository, branch, and content root | Convex tracks drafts, staged operations, Git baselines, and publish provenance. |
| Project definition | `repopress.config.json` for config-backed projects | Convex keeps an access-scoped projection. |
| Installed component contract | Nearest valid `repopress.lock.json` at the exact Git commit | Studio receives frozen declarative metadata, never component functions. |
| Unpublished edits | Convex | Git is unchanged until publish. |
| Application orchestration | Next.js route handlers and server components | They authenticate, read GitHub, call Convex, and build bounded preview inputs. |
| Authentication and durable workflow state | Better Auth inside Convex and Convex tables | Next.js proxies auth and mints narrow server/project capabilities. |

Git remains the portable, reviewable output. Convex supplies real-time drafts, optimistic concurrency, staging, and recovery. Next.js orchestrates those authorities; it is neither a second content repository nor a host for arbitrary repository code.

## Main request path

```text
Browser Studio
  -> authenticated Next.js page or route
  -> Convex project and draft state
  -> GitHub repository at a pinned branch head
  -> Generic preview or signed Compatible preview
```

The Studio route resolves the project from the authenticated owner/repository path. A client-supplied `projectId` is not sufficient authority. The project supplies repository coordinates, branch, and `contentRoot`; GitHub supplies committed bytes.

## Repository configuration

A portable project is recorded at the repository root:

```json
{
  "version": 1,
  "defaults": { "branch": "main", "framework": "auto" },
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

One repository can define several projects with distinct IDs and content roots. Setup detects conventions, asks the user to confirm them, writes configuration only when authorized, then synchronizes a Convex projection.

## Framework and preview adapters are different

| Adapter | Runs where | Responsibility |
| --- | --- | --- |
| Framework adapter | RepoPress application | Detect conventions, suggest roots, define metadata fields, and choose naming patterns. |
| Compatible preview adapter | Isolated Compatible worker | Map a product's MDX vocabulary to RepoPress preview primitives. |

A framework adapter never renders repository components. A preview adapter does not define the production implementation. Next.js, Astro, Blume, Fumadocs, and custom sites can bind the same MDX name differently while sharing one authoring contract.

## Document and draft lifecycle

### Load

RepoPress reads committed Markdown/MDX from GitHub and parses supported frontmatter or a bounded static metadata export without evaluating repository code. A newer Convex draft hydrates the editor over that Git baseline. Document paths are stored relative to the project's content root and resolved at Git boundaries.

### Save a draft

Saving checks project ownership or a scoped capability, applies optimistic concurrency, appends history, and updates the draft snapshot. It does not write Git. Creates, deletes, and media uploads are staged separately so publish can review one complete change set.

### Publish

The production path is pull-request based:

1. Gather dirty documents and pending explorer/media operations.
2. Choose an active publish lane or create a non-conflicting one.
3. Pin one Git authority SHA and perform typed reads at it.
4. Serialize each document while preserving metadata format.
5. Record a durable publish attempt, references, and plan digest.
6. Commit with compare-and-swap semantics.
7. Open or reuse a pull request.
8. Reconcile exact commit provenance into Convex.

Retries recover from the durable attempt and Git evidence rather than producing another commit. A moved head, stale draft, changed operation, ambiguous GitHub read, or unverifiable recovery state fails closed.

When a PR merges, signed webhook or authenticated status synchronization records immutable merge authority. When it closes unmerged, lane invalidation restores relevant work so authored content is not silently discarded.

## Component authority flow

Every reusable MDX component has separate concerns:

1. The product owns and executes the real component.
2. Declarative metadata describes its MDX name, props, slots, fixtures, and provenance.
3. An optional Compatible mapping describes a bounded semantic preview.

Installed registry items also record integrity-bound files and metadata in `repopress.lock.json`. A verified installed definition wins over project metadata with the same MDX name. No repository React function enters Studio state.

## Authentication boundary

Better Auth is instantiated only inside Convex. Browser clients use the Convex Better Auth client and Next.js server helpers proxy to Convex. GitHub credentials remain server-side. Server capabilities and Compatible signing keys must never be exposed to the browser.

## Code landmarks

- [Project configuration schema](https://github.com/itsyogesh/repo-press/blob/main/apps/web/lib/config-schema.ts)
- [Framework adapters](https://github.com/itsyogesh/repo-press/tree/main/apps/web/lib/framework-adapters)
- [Convex schema](https://github.com/itsyogesh/repo-press/blob/main/apps/web/convex/schema.ts)
- [Publish route](https://github.com/itsyogesh/repo-press/blob/main/apps/web/app/api/github/publish-ops/route.ts)
- [Preview contracts](https://github.com/itsyogesh/repo-press/tree/main/apps/web/lib/preview)

Continue with [Component authoring](/components/authoring) or [Preview security](/platform/preview-security).
