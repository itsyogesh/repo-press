---
title: Connect a repository
description: Connect a GitHub repository to RepoPress with appropriate permissions, the correct base branch, and a deliberately scoped content root.
---

RepoPress connects to GitHub to browse committed content and create reviewed publish commits. One repository can contain several projects, each with its own branch and content root.

## GitHub access

GitHub OAuth is the normal sign-in path. A Personal Access Token is available as a compatibility option. In either case, the GitHub identity must be able to read the repository and write the setup or publishing branch.

Use least privilege. Organization policies and GitHub App installation scope can hide a repository even when it is visible in your normal GitHub session.

## Choose the content root

The content root tells RepoPress which subtree one project manages. Common values include:

```text
content/
content/blog/
apps/docs/content/
src/content/
posts/
```

Paths stored for documents are relative to this root. Only select the repository root when the entire repository is intentionally content.

For this RepoPress monorepo, the public documentation project uses `apps/docs/content`. Internal engineering material remains under root `docs/` and is deliberately outside the project.

## Confirm framework detection

RepoPress detects common content systems from their package dependencies and configuration files, then suggests appropriate roots and metadata fields. Detection does not override your choice. Select a folder manually when a custom layout or monorepo makes the intended boundary clearer.

## Config-backed projects

The recommended setup records project definitions in `repopress.config.json` so another RepoPress installation can reconstruct them from Git:

```json
{
  "version": 1,
  "defaults": { "branch": "main", "framework": "auto" },
  "projects": [
    {
      "id": "docs",
      "name": "Documentation",
      "contentRoot": "apps/docs/content",
      "framework": "blume",
      "contentType": "docs",
      "branch": "main"
    }
  ]
}
```

Project IDs must be unique. Avoid overlapping roots unless two projects are intentionally allowed to modify the same paths.

## Private repositories

Private content is fetched through authenticated GitHub requests. Draft bytes and workflow state persist in Convex so authors can resume work; the published files remain in the repository. See [Platform architecture](/platform/architecture) for the exact authority boundary.

## Troubleshooting

- **Repository missing:** refresh OAuth authorization or PAT scope, including organization approval.
- **Content root empty:** confirm the folder exists on the configured branch and contains Markdown or MDX.
- **Config rejected:** fix the existing `repopress.config.json` in Git; setup does not silently overwrite invalid configuration.
- **Publish conflict:** refresh the repository and active lane. RepoPress fails closed when the Git head, draft version, or staged operation changes after planning.

For an end-to-end walkthrough, continue to [Connect an MDX repository](/tutorials/connect-an-mdx-repository).
