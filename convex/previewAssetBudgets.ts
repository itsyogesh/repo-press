import { v } from "convex/values"
import {
  MAX_PREVIEW_ASSET_ATTEMPTS,
  MAX_PREVIEW_ASSET_BYTES,
  MAX_PREVIEW_ASSET_CONCURRENCY,
  MAX_PREVIEW_ASSET_WINDOW_BYTES,
  PREVIEW_ASSET_RESERVATION_TTL_MS,
  PREVIEW_ASSET_WINDOW_MS,
} from "../lib/preview/asset-budget-policy"
import { verifyServerQueryToken } from "../lib/project-access-token"
import { internal } from "./_generated/api"
import { internalMutation, mutation } from "./_generated/server"

export { MAX_PREVIEW_ASSET_BYTES, PREVIEW_ASSET_RESERVATION_TTL_MS } from "../lib/preview/asset-budget-policy"

const beginResult = v.union(
  v.object({ reserved: v.literal(true), reservationId: v.id("previewAssetReservations") }),
  v.object({
    reserved: v.literal(false),
    reason: v.union(v.literal("attempt-limit"), v.literal("concurrency-limit"), v.literal("byte-limit")),
  }),
)

const settleResult = v.union(
  v.object({ settled: v.literal(true) }),
  v.object({ settled: v.literal(false), reason: v.literal("missing-or-expired") }),
)

const abortResult = v.object({ aborted: v.boolean() })

async function requireServerProof(serverQueryToken: string) {
  if (!(await verifyServerQueryToken(serverQueryToken))) throw new Error("Unauthorized")
}

export const expireReservation = internalMutation({
  args: { reservationId: v.id("previewAssetReservations") },
  returns: v.null(),
  handler: async (ctx, args) => {
    const reservation = await ctx.db.get(args.reservationId)
    if (reservation && reservation.expiresAt <= Date.now()) await ctx.db.delete(reservation._id)
    return null
  },
})

export const begin = mutation({
  args: {
    projectId: v.id("projects"),
    actingUserId: v.string(),
    serverQueryToken: v.string(),
  },
  returns: beginResult,
  handler: async (ctx, args) => {
    await requireServerProof(args.serverQueryToken)
    if (!args.actingUserId || args.actingUserId.length > 256) throw new Error("Invalid actor")
    const project = await ctx.db.get(args.projectId)
    if (!project) throw new Error("Project not found")

    const now = Date.now()
    let budget = await ctx.db
      .query("previewAssetBudgets")
      .withIndex("by_projectId_and_userId", (q) => q.eq("projectId", args.projectId).eq("userId", args.actingUserId))
      .first()

    if (!budget) {
      const budgetId = await ctx.db.insert("previewAssetBudgets", {
        projectId: args.projectId,
        userId: args.actingUserId,
        windowStartedAt: now,
        attempts: 0,
        consumedBytes: 0,
        createdAt: now,
        updatedAt: now,
      })
      const createdBudget = await ctx.db.get(budgetId)
      if (!createdBudget) throw new Error("Preview asset budget creation failed")
      budget = createdBudget
    }
    const budgetRow = budget

    const reservations = await ctx.db
      .query("previewAssetReservations")
      .withIndex("by_budgetId", (q) => q.eq("budgetId", budgetRow._id))
      .collect()
    const windowExpired = now < budgetRow.windowStartedAt || now - budgetRow.windowStartedAt >= PREVIEW_ASSET_WINDOW_MS

    if (windowExpired) {
      for (const reservation of reservations) await ctx.db.delete(reservation._id)
      await ctx.db.patch(budgetRow._id, {
        windowStartedAt: now,
        attempts: 0,
        consumedBytes: 0,
        updatedAt: now,
      })
      budget = { ...budgetRow, windowStartedAt: now, attempts: 0, consumedBytes: 0, updatedAt: now }
    }

    const activeReservations = []
    for (const reservation of windowExpired ? [] : reservations) {
      if (reservation.expiresAt <= now) await ctx.db.delete(reservation._id)
      else activeReservations.push(reservation)
    }

    if (budget.attempts >= MAX_PREVIEW_ASSET_ATTEMPTS) {
      return { reserved: false as const, reason: "attempt-limit" as const }
    }
    if (activeReservations.length >= MAX_PREVIEW_ASSET_CONCURRENCY) {
      return { reserved: false as const, reason: "concurrency-limit" as const }
    }
    const reservedBytes = activeReservations.reduce((total, reservation) => total + reservation.reservedBytes, 0)
    if (budget.consumedBytes + reservedBytes + MAX_PREVIEW_ASSET_BYTES > MAX_PREVIEW_ASSET_WINDOW_BYTES) {
      return { reserved: false as const, reason: "byte-limit" as const }
    }

    const reservationId = await ctx.db.insert("previewAssetReservations", {
      budgetId: budget._id,
      projectId: args.projectId,
      userId: args.actingUserId,
      reservedBytes: MAX_PREVIEW_ASSET_BYTES,
      expiresAt: now + PREVIEW_ASSET_RESERVATION_TTL_MS,
      createdAt: now,
      updatedAt: now,
    })
    await ctx.scheduler.runAfter(PREVIEW_ASSET_RESERVATION_TTL_MS, internal.previewAssetBudgets.expireReservation, {
      reservationId,
    })
    await ctx.db.patch(budget._id, { attempts: budget.attempts + 1, updatedAt: now })
    return { reserved: true as const, reservationId }
  },
})

export const settle = mutation({
  args: {
    projectId: v.id("projects"),
    actingUserId: v.string(),
    reservationId: v.id("previewAssetReservations"),
    actualBytes: v.number(),
    serverQueryToken: v.string(),
  },
  returns: settleResult,
  handler: async (ctx, args) => {
    await requireServerProof(args.serverQueryToken)
    const reservation = await ctx.db.get(args.reservationId)
    if (
      !reservation ||
      reservation.projectId !== args.projectId ||
      reservation.userId !== args.actingUserId ||
      !Number.isSafeInteger(args.actualBytes) ||
      args.actualBytes <= 0 ||
      args.actualBytes > MAX_PREVIEW_ASSET_BYTES
    ) {
      return { settled: false as const, reason: "missing-or-expired" as const }
    }
    const budget = await ctx.db.get(reservation.budgetId)
    const now = Date.now()
    if (
      !budget ||
      budget.projectId !== args.projectId ||
      budget.userId !== args.actingUserId ||
      reservation.expiresAt <= now ||
      now < budget.windowStartedAt ||
      now - budget.windowStartedAt >= PREVIEW_ASSET_WINDOW_MS ||
      budget.consumedBytes + args.actualBytes > MAX_PREVIEW_ASSET_WINDOW_BYTES
    ) {
      if (budget?.projectId === args.projectId && budget.userId === args.actingUserId) {
        await ctx.db.delete(reservation._id)
      }
      return { settled: false as const, reason: "missing-or-expired" as const }
    }

    await ctx.db.patch(budget._id, { consumedBytes: budget.consumedBytes + args.actualBytes, updatedAt: now })
    await ctx.db.delete(reservation._id)
    return { settled: true as const }
  },
})

export const abort = mutation({
  args: {
    projectId: v.id("projects"),
    actingUserId: v.string(),
    reservationId: v.id("previewAssetReservations"),
    serverQueryToken: v.string(),
  },
  returns: abortResult,
  handler: async (ctx, args) => {
    await requireServerProof(args.serverQueryToken)
    const reservation = await ctx.db.get(args.reservationId)
    if (!reservation || reservation.projectId !== args.projectId || reservation.userId !== args.actingUserId) {
      return { aborted: false }
    }
    await ctx.db.delete(reservation._id)
    return { aborted: true }
  },
})
