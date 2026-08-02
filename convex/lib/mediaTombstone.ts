import type { Id } from "../_generated/dataModel"
import type { MutationCtx } from "../_generated/server"

type StorageOwner = {
  _id: Id<"mediaOps">
  convexStorageId?: string
  storageDeleteAttempts?: number
}

const STORAGE_DELETE_RETRY_BASE_MS = 60_000
const STORAGE_DELETE_RETRY_MAX_MS = 24 * 60 * 60 * 1000

function nextStorageDeleteRetry(now: number, previousAttempts: number | undefined) {
  const storageDeleteAttempts = (previousAttempts ?? 0) + 1
  const backoff = Math.min(
    STORAGE_DELETE_RETRY_MAX_MS,
    STORAGE_DELETE_RETRY_BASE_MS * 2 ** Math.min(storageDeleteAttempts - 1, 10),
  )
  return { storageDeleteAttempts, storageCleanupAt: now + backoff }
}

/**
 * Delete bytes still owned by an existing mediaOps row. The owner row is
 * removed only after storage succeeds; failure converts that SAME row into
 * a retryable tombstone, so ownership is never lost or duplicated.
 */
export async function deleteOwnedMediaStorageOrKeepTombstone(
  ctx: Pick<MutationCtx, "db" | "storage">,
  row: StorageOwner,
): Promise<{ deleted: boolean }> {
  if (row.convexStorageId) {
    try {
      await ctx.storage.delete(row.convexStorageId)
    } catch {
      const now = Date.now()
      await ctx.db.patch(row._id, {
        status: "failed",
        commitSha: undefined,
        publishBranchId: undefined,
        publishAttemptId: undefined,
        ...nextStorageDeleteRetry(now, row.storageDeleteAttempts),
        updatedAt: now,
      })
      return { deleted: false }
    }
  }
  await ctx.db.delete(row._id)
  return { deleted: true }
}

/**
 * Delete a Convex storage object that no mediaOps row references (or is
 * about to stop referencing). When the delete FAILS, insert a durable
 * "failed" tombstone row that owns the object so the nightly cron can retry
 * the delete - swallowing the failure would orphan the object forever,
 * because storage-side objects are only ever found through mediaOps rows.
 */
export async function deleteUnownedStorageOrTombstone(
  ctx: Pick<MutationCtx, "db" | "storage">,
  row: {
    projectId: Id<"projects">
    userId: string
    repoPath: string
    fileName: string
    mimeType: string
    convexStorageId: string
  },
): Promise<{ deleted: boolean }> {
  try {
    await ctx.storage.delete(row.convexStorageId)
    return { deleted: true }
  } catch {
    const now = Date.now()
    await ctx.db.insert("mediaOps", {
      projectId: row.projectId,
      userId: row.userId,
      repoPath: row.repoPath,
      fileName: row.fileName,
      mimeType: row.mimeType,
      sourceType: "convex",
      convexStorageId: row.convexStorageId,
      status: "failed",
      commitSha: undefined,
      ...nextStorageDeleteRetry(now, undefined),
      createdAt: now,
      updatedAt: now,
    })
    return { deleted: false }
  }
}
