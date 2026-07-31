import type { Id } from "../_generated/dataModel"
import type { MutationCtx } from "../_generated/server"

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
      createdAt: now,
      updatedAt: now,
    })
    return { deleted: false }
  }
}
