import { cronJobs } from "convex/server"
import { internal } from "./_generated/api"

const crons = cronJobs()

// Clean up expired repo access cache entries every 30 minutes
crons.interval("cleanup expired repo access cache", { minutes: 30 }, internal.repoAccessCache.cleanupExpired)

export default crons
