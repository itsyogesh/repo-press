import { cronJobs } from "convex/server"
import { internal } from "./_generated/api"

const crons = cronJobs()

// Clean up expired repo access cache entries every 30 minutes
crons.interval("cleanup expired repo access cache", { minutes: 30 }, internal.repoAccessCache.cleanupExpired)

// Clean up stale Convex storage files for abandoned pending media ops (older than 7 days)
crons.interval("cleanup stale media uploads", { hours: 24 }, internal.mediaOps.cleanupStaleUploads)

// Re-dispatch bounded attempt cleanups whose scheduled continuation was lost
// or failed. The indexed retry cursor rotates permanently failing jobs.
crons.interval("resume pending publish cleanups", { minutes: 5 }, internal.publishAttemptCleanups.resumePendingCleanups)

export default crons
