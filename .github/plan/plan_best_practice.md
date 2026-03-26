# RepoPress Plan Template (Best-practice)

This repository-level planning template is a lightweight, review-friendly pattern inspired by high-quality planning templates.
Save drafts here for review. Finalized plans should be referenced from PRs and not committed as working branches without approval.

Filename convention
- Use short, descriptive names without dates. Examples:
  - `editor_save_flow_plan.md`
  - `publish_workflow_feature_plan.md`
  - `e2e_test_plan.md`

Template (fill in each section)

## Title
One-line summary of the work (imperative tense).

## Summary
2–3 sentences describing the problem, why it matters, and the proposed outcome.

## Context
Links to design docs, related PRs, issues, and any prior work. Add short background to help reviewers get up to speed.

## Goals (Success-focused)
- Primary goal (what success looks like).
- Secondary goals (measurable outcomes / metrics).

## Success Criteria / Acceptance
List explicit, testable acceptance criteria. Each should be verifiable in QA or in production once rolled out.
- e.g., "Save returns 200 and document appears in Convex and GitHub with correct frontmatter."

## Scope
- In-scope: what will be delivered.
- Out-of-scope: explicitly call out what will not be done in this effort.

## Non-goals (optional)
Short list clarifying avoided items to prevent scope creep.

## Assumptions
Key assumptions being made (APIs, tokens, data availability, Convex indexes, etc.).

## Dependencies
External systems, teams, PRs, or tasks that must land first.

## Proposed Approach
High-level plan and rationale. Break into phases if helpful.
- Phase A: discovery / design
- Phase B: implementation (components, server, tests)
- Phase C: QA and rollout

## Milestones & Tasks
Concrete checklist with owners (use GitHub usernames) and clear deliverables.
- [ ] Design: document data model — @alice
- [ ] Implement API + Convex function — @bob
- [ ] UI: editor save button + state — @frontend
- [ ] Tests: unit + e2e — @qa
- [ ] Docs + changelog — @writer

(Prefer small, verifiable tasks; each task should map to a PR.)

## Risks & Mitigations
- Risk: e.g., "Convex index update could be expensive". Mitigation: add index migration plan and tests.
- Risk: "GitHub rate limits" → Mitigation: exponential backoff and retries.

## Open Questions
List any unresolved questions that need decisions before work can proceed.

## Acceptance & QA Checklist
Steps QA or reviewers should follow to verify the work.
- Steps to reproduce
- Test data and credentials (if applicable)
- Expected results

## Rollout Plan & Monitoring
How the change is released (feature flag, gradual rollout), and what metrics or alerts to watch.

## Docs / Files to Update
List files, docs, or UI text that must be updated as part of this work.

## Reviewers and Approvers
- Reviewers: @itsYogesh
- Approver: @owner - itsYogesh (final approval required to merge)

## Next Steps
Short, ordered list of the next actions after plan approval.

---

Notes for contributors
- Use this file to collect feedback; use PRs for implementation work.
- Do not push experimental branches directly to `main` — open a feature branch and reference this plan in the PR description.
- Keep tasks small and link each task to a PR or issue.

(Template inspired by planning patterns used in high-quality AI products; adapt as needed.)
