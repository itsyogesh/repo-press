# Connect an MDX repository

This tutorial connects an existing GitHub repository to RepoPress, opens a content root in Studio, saves a draft, and publishes through a pull request.

## Before you start

You need:

- a GitHub repository containing `.md` or `.mdx` content;
- read access to browse it and write access to initialize/configure it;
- a known base branch, usually `main`; and
- a folder containing the content you want one RepoPress project to manage.

Examples of content roots are `content/blog`, `content/docs`, `src/content`, or an empty string for the repository root. Paths inside a RepoPress project are relative to this root.

If you use a Personal Access Token instead of GitHub OAuth, give it access only to the repositories RepoPress needs. RepoPress ultimately relies on GitHub's API to authorize repository writes.

## 1. Prepare the repository

Make sure the selected branch contains at least one Markdown or MDX document. For example:

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

RepoPress supports frontmatter and a bounded static metadata-export form. Existing files do not need to be migrated into a database.

## 2. Sign in and choose the repository

1. Sign in to RepoPress with GitHub OAuth or the PAT option.
2. Open **Dashboard**.
3. Under **Repository hubs**, find the repository.
4. Choose **Set up repo**. If it already has a project, choose **Open repo hub**.

If a private or organization repository is missing, verify that the OAuth installation or PAT can read it.

## 3. Confirm detection

The setup page reads the selected repository and proposes:

- branch;
- content root;
- framework;
- content type; and
- frontmatter conventions.

Review every value. In particular, do not accept an inferred branch without checking it. Use the folder picker to select the actual content directory, not the repository merely because it contains `package.json`.

RepoPress currently has built-in detection for Fumadocs, Nextra, Astro, Hugo, Docusaurus, Jekyll, Contentlayer, Next.js MDX, and custom content.

## 4. Initialize RepoPress

Choose **Initialize RepoPress**. The recommended path creates `repopress.config.json` on the selected branch and then synchronizes it into Convex.

> Initialization is a real Git write to the selected branch. Review the branch before confirming. Normal content publishing later uses a dedicated publish lane and pull request.

The generated configuration is intentionally small:

```json
{
  "version": 1,
  "defaults": {
    "branch": "main",
    "framework": "auto"
  },
  "projects": [
    {
      "id": "main",
      "name": "example Content",
      "contentRoot": "content/blog",
      "framework": "next-mdx",
      "contentType": "blog",
      "branch": "main"
    }
  ]
}
```

Commit this file like any other repository configuration. The same repository can contain more than one project:

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
      "contentRoot": "content/docs",
      "framework": "fumadocs",
      "contentType": "docs"
    }
  ]
}
```

Project IDs must be unique. Avoid overlapping content roots unless both projects intentionally edit the same files.

### Existing config

If `repopress.config.json` already exists, RepoPress validates it and offers **Sync from Config**. An invalid config is not silently replaced: fix it in Git, push the correction, and refresh the setup page.

The **Create without config file** option is an advanced compatibility path. It creates only a Convex project, so another RepoPress installation cannot reconstruct the project from Git alone.

## 5. Open Studio

After synchronization, choose **Open Studio** for the project. Check:

- Explorer starts at the expected content root;
- the selected document path is correct;
- Properties shows the document's real metadata fields;
- the preview shows Generic or Compatible fidelity explicitly; and
- the source is editable rather than marked read-only because of unsupported metadata.

Generic preview is always safe. Compatible preview appears only when the project has a valid preview entry and the deployment can verify a signed artifact. See [Preview fidelity and security](../platform/preview-security.md).

## 6. Make and save an edit

Edit the document body or Properties, then choose **Save draft**.

The draft is saved to Convex with optimistic concurrency and document history. GitHub is unchanged. Reloading Studio should restore the draft. If another writer updated the same document record, RepoPress refuses the stale save rather than silently overwriting it.

Creating/deleting a file or uploading media also remains staged until publish. The publish bar summarizes these operations with dirty document changes.

## 7. Publish

Choose **Publish** and review the complete change set.

- **Continue current lane** adds the changes to the project's active publish branch and pull request.
- **Create new lane** starts a separate branch/PR when the paths do not conflict with another open lane.

RepoPress pins the Git head, re-reads affected paths, validates the draft snapshot, writes one compare-and-swap commit, and opens or reuses a pull request. Open that pull request on GitHub and review the exact file diff.

If GitHub changed after planning, RepoPress returns a conflict instead of committing against an unexpected base. Retry after reviewing the new repository state.

## 8. Merge or close the pull request

When the PR merges, the signed GitHub webhook or authenticated status sync records the merge authority and completes bounded reconciliation. The document becomes clean against the merged Git snapshot.

If the PR closes without merging, RepoPress invalidates that lane. Relevant content is restored to the staged/draft state so it can be reviewed, discarded, or published on a fresh lane. Do not delete Convex records to “unstick” a closed PR.

## 9. Add product components (optional)

To make custom MDX components insertable and recognizable in preview, add:

1. declarative `projects[].components` metadata;
2. import-free fixture MDX; and
3. a Compatible adapter entry such as `.repopress/mdx-preview.tsx`.

Continue with [Build a component extension](./build-a-component-extension.md).

## Troubleshooting

### Repository is not listed

Refresh the GitHub authorization or PAT scope. For organizations, confirm that the OAuth app is allowed by the organization.

### `repopress.config.json` cannot be created

The path may already exist, the selected branch may be protected, or the token may not have write access. RepoPress uses create-only semantics and will not overwrite an existing config during initialization.

### Content root is empty

Reopen setup and choose the folder containing the documents. A content root must be a directory on the configured branch; selecting a file is rejected.

### Config changed but Studio did not

Open the repository hub to trigger config synchronization, or use its retry/sync action. The Git file is authoritative; Convex is the application projection.

### Compatible preview stays Generic

Check that the project has `preview.entry`, the entry exists at the current base commit, the adapter uses only allowed imports, and the Studio/preview deployments have the signing key pair and separate preview origin configured. Generic fallback is expected whenever any of those checks fails.

### Publish reports a conflict

Review the listed path and the active publish lane. A conflict normally means the Git head, draft version, staged operation, or another lane changed after the reviewed plan. Refresh first; do not bypass the compare-and-swap guard.

## Next steps

- [Platform architecture](../platform/architecture.md)
- [Component authoring contract](../platform/component-authoring.md)
- [Preview security](../platform/preview-security.md)
