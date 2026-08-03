---
title: How RepoPress works
description: Understand how RepoPress keeps published content in Git while Convex manages drafts, staged operations, recovery, and workflow state.
---

RepoPress is a Git-native headless CMS. It reads ordinary Markdown and MDX from GitHub, gives authors a visual workflow, and commits reviewed changes back to Git rather than replacing the repository with a CMS database.

## Three collaborating layers

| Layer | Responsibility |
| --- | --- |
| Studio | Browses content, edits frontmatter and source, previews the result, and reviews a publish set. |
| Convex | Stores projects, drafts, history, staged operations, publish attempts, and authentication state. |
| GitHub | Remains the authority for published files, media, branches, commits, and pull requests. |

The Next.js application coordinates these layers. It is not a second published-content store and it does not execute arbitrary repository components in its host process.

## Content lifecycle

### Read from a pinned Git snapshot

Studio resolves the authenticated project, its branch, and its content root. Committed files are read from GitHub. Draft state from Convex is layered onto that baseline when it is newer.

### Edit without changing the live site

Authors edit structured metadata and Markdown/MDX source. Saving creates or updates a draft in Convex. File creates, deletes, and media uploads are staged alongside dirty documents.

### Preview with explicit fidelity

Generic preview renders a bounded Markdown/MDX model and never runs repository imports. A configured Compatible adapter can map product component names to safe preview primitives in an isolated sandbox. Studio labels the active fidelity and reports downgrades.

### Publish a reviewable Git change

Publishing plans the whole change set at one Git authority SHA, validates its references transactionally, commits with compare-and-swap semantics, and opens or reuses a pull request. Durable publish attempts make uncertain retries recoverable without silently producing duplicate commits.

### Merge or close the lane

After merge, webhook or authenticated status synchronization records the merge authority and reconciles the affected documents. Closing without merge invalidates the lane and restores still-relevant work to a staged or dirty state.

## Content status

Documents can move through draft, review, approved, published, and archived states. Git publication is a specific operation rather than a generic status mutation. The repository's commit history remains the durable audit trail for published bytes.

For the full authority model, read [Platform architecture](/platform/architecture).
