# RepoPress Pull Request Workflow

This document explains how RepoPress handles pull requests when publishing documents from the headless CMS to GitHub repositories.

## Overview

When content is published in RepoPress, the system automatically creates a pull request in the connected GitHub repository to propose the changes for review before merging.

## PR Creation Process

Based on the actual implementation in `/app/api/github/publish-ops/route.ts`:

1. **Publish Trigger**: When a user initiates a publish action (via Studio editor or API)
2. **Change Detection**: RepoPress identifies pending operations:
   - Pending file operations (create/update/delete) from Explorer
   - Dirty documents with content changes
   - Pending media operations
3. **Content Preparation**: Files are prepared with proper frontmatter using gray-matter
4. **Branch Management**:
   - Uses active publish branch or creates temporary branch: `repopress/${baseBranch}/${timestamp}`
   - Creates branch via GitHub API if needed
5. **GitHub Operations**: Uses Octokit to:
   - Prefetch existing files to detect conflicts (returns 409 Conflict if files have been modified externally)
   - Create/update/delete files in the temporary branch
   - Commit changes with message: `chore(content): [summary] via RepoPress`
   - Create pull request targeting base branch
6. **Post-Commit Processing**:
   - Updates document GitHub SHA in Convex to match published branch
   - Marks operations as committed in Convex
   - Returns PR URL/number to caller

## PR Title Generation

From the code analysis (lines 236-239):

- If custom title provided: Uses that title
- Otherwise: `"Content update via RepoPress (${parts.join(", ")})"`
- Where parts are: "X created", "Y updated", "Z deleted", etc.

This differs from the initial research findings - RepoPress actually uses descriptive titles based on the changes made, not strictly static formats.

## PR Description Population

From the code analysis (lines 237-238):

- If custom description provided: Uses that description
- Otherwise:

  ```
  Automated content update from RepoPress.

  - [list of changes: created/updated/deleted files and media]
  ```

The description is generated based on the actual operations performed during the publish process.

## Branch Strategy

- **Base Branch**: Configured per project (usually `main` or `master`)
- **Publish Branch**: Auto-generated as `repopress/${baseBranch}/${timestamp}` or reused from active record stored in Convex
- **Branch Reuse**: Intentional design - when publishing to an existing active PR, the same branch is reused and new commits are pushed to that PR rather than creating duplicate PRs
- **Branch Cleanup**: Handled via publish branch tracking in Convex (active branch per project)
- **Media Handling**: Separate tracking for media assets (images, files) with create/update operations

## Why Update Existing PRs?

This approach is the industry-standard best practice for git-based headless CMSes:

| Approach                            | Pros                                                                                                     | Cons                                                                            |
| ----------------------------------- | -------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------- |
| **Update Existing PR** (Current ✅) | Single source of truth, preserves review history, clean commit history, aligns with GitHub's native flow | PR can become large if many changes                                             |
| Create New PR                       | Isolated changes per PR                                                                                  | Review fragmentation, confusing history, merge conflicts between concurrent PRs |

Tools like TinaCMS, Statamic, and GitHub CLI automation workflows use this exact pattern.

## Review and Merge Process

1. **PR Creation**: Automatic via GitHub API (Octokit)
2. **URL Tracking**: PR URL and number stored in Convex (`publishBranches` table)
3. **Post-Commit Updates**: After commit, RepoPress:
   - Updates document GitHub SHA to match published branch
   - Marks operations as committed
   - Returns PR URL/number to caller

## Configuration Reference

While the core PR mechanism is implemented in the publish-ops route, projects can influence behavior through:

### Project Settings (stored in Convex `projects` table):

- `branch`: Target branch for PRs (default: usually main/master)
- `contentRoot`: Root path for content in repository

### Indirect Customization:

- Custom titles/descriptions can be passed via the publish API
- Workflow can be extended via GitHub webhooks and Convex actions

## Files Involved

Key files in the PR workflow:

- `/app/api/github/publish-ops/route.ts` - Main PR creation logic with branch/PR reuse
- `/lib/github.ts` - GitHub API wrapper functions (`createBranch`, `createPullRequest`, `batchCommit`)
- Convex schema: `publishBranches` table for tracking active PRs per project
- Convex functions: `publishBranches.getActiveForProject`, `publishBranches.updateAfterCommit`

## Implementation Details

The system uses:

- **Octokit** (`@octokit/rest`) for all GitHub API interactions
- **Convex transactions** for atomic operations
- **Branch-based workflow** instead of direct pushes to main
- **Conflict detection** by prefetching files before operations
- **Media asset handling** separate from content files

## Error Handling

- Returns 409 Conflict if files have been modified externally (conflicts detected during prefetch)
- Returns 400 Bad Request if no pending changes to publish
- Returns 400 Bad Request if missing projectId
- Returns 404 Not Found if project not found
- Returns 401/403 for authentication/authorization errors
- Returns 500 Internal Error for unexpected failures
- All GitHub API errors are caught and returned as 500 with message

## Verification

To verify a PR was created:

1. Check Convex `publishBranches` table for PR URL/number (updated after PR creation)
2. Look for branch `repopress/${baseBranch}/${timestamp}` in GitHub (created via `createBranch`)
3. Review the PR in GitHub UI showing all changes made (URL returned in API response)
4. Verify document GitHub SHAs were updated in Convex (post-commit processing)
5. Confirm operations were marked as committed in Convex (post-commit processing)
   EOF
