import { v } from "convex/values"
import { internal } from "./_generated/api"
import { internalMutation } from "./_generated/server"
import { processPublishAttemptCleanupBatch } from "./lib/publishAttemptCleanup"

/** Durable continuation for one attempt-scoped cleanup job. */
export const continueCleanup = internalMutation({
  args: { cleanupId: v.id("publishAttemptCleanups") },
  handler: async (ctx, args) => await processPublishAttemptCleanupBatch(ctx, args.cleanupId),
})

/** Bounded round-robin watchdog for continuations lost to transient failure. */
export const resumePendingCleanups = internalMutation({
  args: {},
  handler: async (ctx) => {
    const pending = await ctx.db
      .query("publishAttemptCleanups")
      .withIndex("by_status_lastRescheduledAt_createdAt", (q) => q.eq("status", "pending"))
      .order("asc")
      .take(25)
    const now = Date.now()
    for (const cleanup of pending) {
      await ctx.db.patch(cleanup._id, { lastRescheduledAt: now, updatedAt: now })
      await ctx.scheduler.runAfter(0, (internal as any).publishAttemptCleanups.continueCleanup, {
        cleanupId: cleanup._id,
      })
    }
    return { scheduled: pending.length }
  },
})
