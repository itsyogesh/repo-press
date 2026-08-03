---
title: Connect an MDX repository
description: Configure a GitHub MDX content root, save an optimistic draft in RepoPress Studio, and publish the reviewed change through a pull request.
---

This tutorial connects an existing GitHub repository, opens a content root in Studio, saves a draft, and publishes through a pull request.

## Before you start

You need:

- a GitHub repository containing `.md` or `.mdx` content;
- read access to browse and write access for setup/publishing;
- a known base branch, usually `main`; and
- the folder one RepoPress project should manage.

Examples include `content/blog`, `apps/docs/content`, `src/content`, or an empty root for a repository composed entirely of content. Project document paths are relative to the selected root.

## 1. Prepare content

Make sure the branch contains at least one document:

```text
content/
└── blog/
    └── hello-world.mdx
```

```mdx
---
title: Hello world
description: The first connected article.
---

# Hello world

This article remains a normal file in the repository.
```

RepoPress supports YAML frontmatter and a bounded static metadata-export form. Existing files do not need to be migrated into a database.

## 2. Sign in and select the repository

1. Sign in with GitHub OAuth or the PAT option.
2. Open **Dashboard**.
3. Find the repository under **Repository hubs**.
4. Choose **Set up repo**, or **Open repo hub** when projects already exist.

If a private or organization repository is missing, verify the OAuth installation or PAT scope.

## 3. Confirm detection

Setup proposes a branch, content root, framework, content type, and metadata conventions. Review every value. Choose the directory that owns the documents, not merely a folder containing `package.json`.

RepoPress has built-in conventions for systems including Blume, Fumadocs, Nextra, Astro, Hugo, Docusaurus, Jekyll, Contentlayer, Next.js MDX, and custom content. Manual roots remain supported.

## 4. Initialize RepoPress

Choose **Initialize RepoPress** to create `repopress.config.json` and synchronize it into Convex.

:::warning
Initialization is a real write to the selected branch. Confirm the branch first. Normal content publishing later uses a dedicated publish lane and pull request.
:::

```json
{
  "version": 1,
  "defaults": { "branch": "main", "framework": "auto" },
  "projects": [
    {
      "id": "main",
      "name": "Example content",
      "contentRoot": "content/blog",
      "framework": "next-mdx",
      "contentType": "blog",
      "branch": "main"
    }
  ]
}
```

One repository can define several projects:

```json
{
  "version": 1,
  "defaults": { "branch": "main", "framework": "auto" },
  "projects": [
    {
      "id": "blog",
      "name": "Blog",
      "contentRoot": "content/blog",
      "framework": "next-mdx",
      "contentType": "blog"
    },
    {
      "id": "docs",
      "name": "Documentation",
      "contentRoot": "apps/docs/content",
      "framework": "blume",
      "contentType": "docs"
    }
  ]
}
```

IDs must be unique. Avoid overlapping roots unless both projects deliberately edit the same paths.

If config already exists, RepoPress validates and synchronizes it rather than overwriting it. **Create without config file** is an advanced compatibility path whose project cannot be reconstructed from Git alone.

## 5. Inspect Studio

Open the project and confirm:

- Explorer begins at the intended content root;
- the selected path is correct;
- Properties shows real metadata;
- preview explicitly reports Generic or Compatible fidelity; and
- supported source is editable.

Generic is the safe baseline. Compatible appears only with a valid preview entry and verifiable signed artifact. See [Preview security](/platform/preview-security).

## 6. Save a draft

Edit the body or Properties and choose **Save draft**. Convex stores the draft with optimistic concurrency and history; GitHub is unchanged. Reloading Studio should restore the draft.

Creates, deletes, and media uploads also remain staged until publish. The publish bar summarizes them with dirty documents.

## 7. Publish

Choose **Publish** and inspect the complete set.

- **Continue current lane** adds non-conflicting changes to its active branch/PR.
- **Create new lane** starts a separate branch/PR when paths do not conflict.

RepoPress pins the lane head, rereads affected paths, validates the planned snapshot, performs one compare-and-swap commit, and opens or reuses a pull request. Review the exact GitHub diff.

If GitHub or draft authority moved after planning, RepoPress returns a conflict instead of committing onto an unexpected base.

## 8. Merge or close

On merge, a signed webhook or authenticated status sync records merge authority and completes reconciliation. Documents become clean against the merged snapshot.

On unmerged close, lane invalidation restores relevant content to staged/dirty state. Do not delete backend records to unstick a closed lane.

## 9. Add product components

To make a custom MDX component insertable and recognizable, add:

1. `projects[].components` authoring metadata;
2. an import-free fixture; and
3. an optional Compatible adapter such as `.repopress/mdx-preview.tsx`.

Continue with [Build a component extension](/tutorials/component-extension).

## Troubleshooting

### Repository is missing

Refresh authorization. For organizations, confirm that the OAuth app is permitted.

### Config cannot be created

The file may already exist, the branch may be protected, or the token may lack write access. Initialization uses create-only semantics.

### Content root is empty

Select the folder containing documents. A configured root must resolve to a directory on the selected branch.

### Config changed but Studio did not

Open the repository hub and run its config synchronization. Git is authoritative; Convex is the application projection.

### Compatible stays Generic

Confirm the project entry exists at the base commit, uses only allowed imports, and the separate Studio/preview deployments have correct signing configuration. Generic fallback is expected when any proof fails.

### Publish reports a conflict

Refresh and inspect the path/lane. A conflict means Git head, draft version, staged operation, or lane authority changed after planning.

## Next steps

- [Platform architecture](/platform/architecture)
- [Component authoring](/components/authoring)
- [Preview security](/platform/preview-security)
