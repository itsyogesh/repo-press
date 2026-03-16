import { v } from "convex/values"
import { verifyProjectAccessToken } from "../lib/project-access-token"
import type { QueryCtx } from "./_generated/server"
import { authComponent } from "./auth"

/**
 * Common helper to verify that a caller has access to a project.
 * Supports both Better Auth sessions (OAuth) and signed project tokens (PAT).
 */
export async function resolveProjectCaller(
  ctx: QueryCtx,
  projectId: string,
  explicitUserId?: string,
  projectAccessToken?: string,
) {
  const authUser = await authComponent.safeGetAuthUser(ctx)
  if (authUser?._id) {
    const authUserId = authUser._id as string
    if (explicitUserId && explicitUserId !== authUserId) {
      throw new Error("Unauthorized: caller identity does not match userId")
    }
    const project = (await ctx.db.get(projectId as any)) as {
      userId: string
    } | null
    if (!project || project.userId !== authUserId) {
      throw new Error("Unauthorized")
    }
    return { userId: authUserId, project }
  }

  const payload = await verifyProjectAccessToken(projectAccessToken)
  if (payload && payload.projectId === projectId) {
    const project = (await ctx.db.get(projectId as any)) as {
      userId: string
    } | null
    if (!project || project.userId !== payload.userId) {
      throw new Error("Unauthorized")
    }
    if (explicitUserId && explicitUserId !== payload.userId) {
      throw new Error("Unauthorized: caller identity does not match userId")
    }
    return { userId: payload.userId, project }
  }

  throw new Error("Unauthorized: Not authenticated")
}
