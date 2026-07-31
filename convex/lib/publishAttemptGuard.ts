import type { Doc, Id } from "../_generated/dataModel"
import type { DatabaseReader } from "../_generated/server"

const ACTIVE_STATUSES = ["committing", "committed", "cleanup_pending"] as const
type ActivePublishAttempt = Doc<"publishAttempts"> & { status: (typeof ACTIVE_STATUSES)[number] }

function isActiveAttempt(candidate: unknown): candidate is ActivePublishAttempt {
  if (!candidate || typeof candidate !== "object") return false
  const attempt = candidate as Record<string, unknown>
  return (
    typeof attempt.planDigest === "string" &&
    typeof attempt.branchName === "string" &&
    (attempt.status === "committing" || attempt.status === "committed" || attempt.status === "cleanup_pending")
  )
}

/**
 * Find a publish attempt that has crossed (or is crossing) the commit
 * boundary for this project. While one exists, staged operations included in
 * the snapshot must not be undone or discarded - the Git commit either
 * already contains them or is about to.
 *
 * The shape check (not just the index hit) keeps unit tests with loose db
 * mocks from misreading unrelated stub rows as attempts.
 */
export async function findActivePublishAttempt(db: DatabaseReader, projectId: Id<"projects">) {
  for (const status of ACTIVE_STATUSES) {
    const candidate = await db
      .query("publishAttempts")
      .withIndex("by_projectId_status", (q) => q.eq("projectId", projectId).eq("status", status))
      .first()
    if (isActiveAttempt(candidate)) return candidate
  }
  return null
}

export async function assertNoActivePublishAttempt(db: DatabaseReader, projectId: Id<"projects">) {
  const active = await findActivePublishAttempt(db, projectId)
  if (active) {
    throw new Error(
      "A publish is in progress for this project. Wait for it to finish (or recover via publishing again) before undoing staged changes.",
    )
  }
}
