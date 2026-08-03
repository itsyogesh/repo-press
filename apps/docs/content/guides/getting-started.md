---
title: Getting started
description: Connect your first Markdown or MDX repository, confirm its project boundary, edit safely in Studio, and publish a reviewable pull request.
---

RepoPress manages website content directly in GitHub. You connect a repository, choose the content root one project owns, edit in Studio, and publish the reviewed change through a Git branch and pull request.

## Prerequisites

- A GitHub account.
- A repository containing `.md` or `.mdx` files.
- Read access to browse the repository and write access for setup and publishing.
- A known base branch and the folder that contains the content you want to manage.

## 1. Sign in

Open [repopress.org](https://repopress.org) and sign in with GitHub. RepoPress can also use a Personal Access Token when OAuth is not suitable; scope it to only the repositories the application needs.

RepoPress never asks for your GitHub password. GitHub remains responsible for repository authorization.

## 2. Choose a repository

The dashboard lists repositories available to the authenticated GitHub identity. Select a repository, then choose **Set up repo**. Existing RepoPress repositories instead open through their repository hub.

If an organization or private repository is missing, check the OAuth installation or PAT permissions before continuing.

## 3. Confirm the project

RepoPress inspects repository files and suggests:

- the base branch;
- framework and content type;
- a content root; and
- common frontmatter fields.

Treat detection as a proposal. Confirm the actual branch and select the narrowest folder that should belong to this project. A monorepo can have several RepoPress projects with distinct content roots.

## 4. Initialize and open Studio

The portable setup path creates or synchronizes `repopress.config.json`. Initialization is a real Git write to the branch you selected, so review it before confirming.

Open Studio and verify that the Explorer begins at the expected content root. Select a document to see its structured properties, source editor, and labelled preview.

## 5. Edit, save, and publish

Make a change, then choose **Save draft**. RepoPress stores the unpublished draft and its history in Convex; GitHub is unchanged.

When the complete change set is ready, choose **Publish**. RepoPress pins Git authority, validates the draft and staged operations, writes one compare-and-swap commit to a publish lane, and opens or reuses a pull request. Merge that PR through your normal review process.

## Continue

- [How RepoPress works](/guides/how-it-works)
- [Connect a repository in detail](/tutorials/connect-an-mdx-repository)
- [Studio editor](/studio/editor)
