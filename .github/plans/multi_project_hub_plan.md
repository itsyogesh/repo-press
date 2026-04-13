# Multi-Project Hub Plan (Issue #19)

Branch: feature/multi-project-hub
Base: feature/publish-lane-choice

Summary
-------
Add a multi-project "hub" that lets repository owners define multiple projects in a single repo via `repopress.config.json`, supports config-driven onboarding, safe removal, and an admin UI for creating/editing/removing projects.

Goals
-----
- Provide a config-driven project sync that maps repopress.config.json entries to `projects` in Convex.
- Allow safe removal via tombstones when a project is removed from the config.
- Provide UI actions (Add/Edit/Remove dialogs) under repo Settings and a Project Hub component on the dashboard.
- Preserve manual projects and allow merge of config/detected values safely.

Phases & Tasks
--------------
Task 1 - Config sync & schema
  1.1 Add tombstone table `deletedConfigProjects` to schema.
  1.2 Extend `projects` table with `configProjectId`, `configVersion`, `configPath`, `previewEntry`, `enabledPlugins`, `components`, `frameworkSource`.
  1.3 Implement `syncProjectsFromConfig` mutation that:
    - Parses `repopress.config.json` (via lib/repopress/config)
    - Matches entries by `configProjectId` or legacy repo+branch+contentRoot
    - Creates/patches projects and skips tombstoned entries

Task 2 - Safe removal & server actions
  2.1 Add server action `removeProjectFromConfig(owner, repo, branch, configProjectId, token)` that updates or deletes the config file on GitHub.
  2.2 Implement two-phase project deletion: soft-delete + scheduled batch cleanup and tombstone recording for config-driven removals.

Task 3 - Settings UI & Hub component
  3.1 Add Project Hub component (dashboard) wiring to `listProjectsForRepo` and show config/manual source.
  3.2 Add Settings page actions: AddProjectDialog, EditProjectDialog, RemoveProjectDialog; hook remove to server action above.

Task 4 - Tests & verification
  4.1 Add unit tests for sync logic (matching, tombstone skipping, migration path).
  4.2 Add route/action tests for config removal and error paths.
  4.3 Add UI integration smoke tests for Settings Hub flows.

Acceptance Criteria
-------------------
- `syncProjectsFromConfig` correctly creates/updates projects from `repopress.config.json` and ignores tombstoned ids.
- Removing a project from config via UI calls `removeProjectFromConfig` and either updates or deletes the repo file.
- Tests (unit + route) pass locally: `npm run test`.
- Build succeeds: `npm run build` with placeholder Convex env vars.

Verification Steps
------------------
- Run lint/test/build in the feature worktree.
- Manually verify Settings → Project Hub shows config vs manual projects.
- Remove project via UI and confirm tombstone prevents immediate re-creation on next sync.

Notes
-----
- Branch created from feature/publish-lane-choice in a dedicated worktree (`.worktrees/feature-multi-project-hub`).
- This plan was recovered from uncommitted work and committed as recovery groundwork in the branch; the plan file is now being committed so it is versioned with the branch.

