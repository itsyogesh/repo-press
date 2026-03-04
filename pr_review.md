# Code Review Summary: Phase 2 MDX runtime and studio experience

While this PR introduces impressive functionality and sophisticated runtime evaluation, it contains **CRITICAL** security vulnerabilities and architectural risks that must be addressed before merging.

## File: `convex/documents.ts`
### L16: [CRITICAL] Authentication bypass and identity spoofing in `resolveCallerUserId`.
The helper falls back to returning `explicitUserId` if no authenticated session is found. Because Convex mutations are public RPC endpoints, an unauthenticated attacker can supply any user's ID as `explicitUserId` and the function will blindly trust it, bypassing all ownership checks.

### L207: [HIGH] Race condition in `saveDraft` due to last-write-wins.
The mutation performs a read-then-patch without any versioning or optimistic locking. If two collaborators save drafts simultaneously, one will overwrite the other's changes without warning.

## File: `convex/documentHistory.ts`
### L7: [CRITICAL] Authentication bypass and identity spoofing in `resolveCallerUserId`.
This contains the exact same logic flaw as in `convex/documents.ts`. An unauthenticated user can provide a victim's `userId` via `explicitUserId` to maliciously restore document history.

## File: `convex/mediaOps.ts`
### L6: [CRITICAL] Broken access control in `requireProjectOwnership`.
The `requireProjectOwnership` helper only verifies that the provided `projectId` belongs to the provided `userId`. It does not verify that the person calling the mutation *is* that user. Since `stage`, `markCommitted`, and `clearCommittedForProject` are public mutations, an attacker can manipulate anyone's media operations by simply passing the target user's ID.

## File: `convex/explorerOps.ts`
### L214: [CRITICAL] Broken access control in `markCommitted` and `clearCommittedForProject`.
Similar to `mediaOps.ts`, these mutations blindly trust the client-provided `userId` parameter without verifying the actual authentication session via `authComponent.safeGetAuthUser(ctx)`. Unauthenticated attackers can manipulate operations for any project.

## File: `components/studio/repo-jsx-bridge.tsx`
### L84: [HIGH] XSS vulnerability due to unvalidated JSX property names.
While `safeEvalJsExpression` restricts JS execution within the value, it does not prevent an attacker from supplying dangerous property names. If an attacker provides `dangerouslySetInnerHTML={{ __html: "<script>alert(1)</script>" }}`, the payload will be evaluated and applied to the component, causing a Cross-Site Scripting (XSS) execution.

## File: `components/mdx-runtime/evaluateMdx.ts`
### L12: [HIGH] Incomplete global variable shadowing in MDX sandbox.
The `BLOCKED_GLOBALS` array is missing critical globals like `window` and `globalThis`. An attacker can easily bypass the shadowing by using `window.fetch` or `window.document` to execute an XSS payload.

## File: `convex/projects.ts`
### L347: [MEDIUM] Potential duplicate batch scheduling in two-phase deletion.
The `removeFull` mutation doesn't check if the project is already in a `[DELETING]` state before scheduling `_removeFullBatch`. If a user invokes deletion multiple times rapidly, it will enqueue multiple concurrent batch deletion jobs for the same project.