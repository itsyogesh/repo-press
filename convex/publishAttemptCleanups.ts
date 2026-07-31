import { v } from "convex/values"
import { internalMutation } from "./_generated/server"
import { processPublishAttemptCleanupBatch } from "./lib/publishAttemptCleanup"

/** Durable continuation for one attempt-scoped cleanup job. */
export const continueCleanup = internalMutation({
  args: { cleanupId: v.id("publishAttemptCleanups") },
  handler: async (ctx, args) => await processPublishAttemptCleanupBatch(ctx, args.cleanupId),
})
