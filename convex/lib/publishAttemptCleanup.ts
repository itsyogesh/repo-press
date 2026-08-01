import { canonicalGitPathFromUrlPath } from "../../lib/git-path-policy"
import { resolveStoredRepoPath, type StoredPathRepresentation } from "../../lib/preview/path-policy"
import { internal } from "../_generated/api"
import type { Doc, Id } from "../_generated/dataModel"
import type { MutationCtx } from "../_generated/server"
import { assertPublishAttemptOutcomeClosure } from "./publishAttemptClosure"

export const CLEANUP_BATCH_SIZE = 25

type CleanupCtx = Pick<MutationCtx, "db" | "scheduler" | "storage">
type PathOutcome = Doc<"publishAttemptCleanups">["pathOutcomes"][number]

function committedRowBelongsToAttempt(
  row: {
    status: string
    publishAttemptId?: Id<"publishAttempts">
    publishBranchId?: Id<"publishBranches">
    commitSha?: string
  },
  attempt: Doc<"publishAttempts">,
): boolean {
  if (
    row.status !== "committed" ||
    row.publishBranchId !== attempt.publishBranchId ||
    row.commitSha !== attempt.commitSha
  ) {
    return false
  }
  if (row.publishAttemptId !== undefined) return row.publishAttemptId === attempt._id
  // Explicit compatibility path for rows committed before attempt ownership
  // was stamped. Lane + commit remain mandatory, so a reused lane cannot
  // capture a legacy row from another publish.
  return true
}

function provenanceBelongsToAttempt(
  provenance: Doc<"documents">["publishedProvenance"],
  attempt: Doc<"publishAttempts">,
  association: Doc<"publishAttempts">["documentAssociations"][number],
): boolean {
  if (
    !provenance ||
    provenance.publishBranchId !== attempt.publishBranchId ||
    provenance.commitSha !== attempt.commitSha ||
    provenance.publishedUpdatedAt !== association.expectedUpdatedAt ||
    (association.contentRevision !== undefined && provenance.contentRevision !== association.contentRevision) ||
    (association.contentVersion !== undefined && provenance.publishedContentVersion !== association.contentVersion)
  ) {
    return false
  }
  if (provenance.publishAttemptId !== undefined) return provenance.publishAttemptId === attempt._id
  // Explicit compatibility path for provenance written before attempt IDs.
  // The immutable lane, commit, and planned snapshot still have to match.
  return true
}

function nextPhase(phase: Doc<"publishAttemptCleanups">["phase"]) {
  if (phase === "explorer") return "media" as const
  if (phase === "media") return "documents" as const
  if (phase === "documents") return "complete" as const
  return "complete" as const
}

async function scheduleNext(ctx: CleanupCtx, cleanupId: Id<"publishAttemptCleanups">) {
  await ctx.scheduler.runAfter(0, (internal as any).publishAttemptCleanups.continueCleanup, { cleanupId })
}

async function moveToNextPhase(
  ctx: CleanupCtx,
  cleanup: Doc<"publishAttemptCleanups">,
  attempt: Doc<"publishAttempts">,
) {
  const phase = nextPhase(cleanup.phase)
  const now = Date.now()
  if (phase === "complete") {
    await ctx.db.patch(cleanup._id, { phase, cursor: 0, status: "complete", updatedAt: now })
    if (attempt.status === "cleanup_pending") {
      await ctx.db.patch(attempt._id, { status: "cleaned", updatedAt: now })
    }
    return { done: true, processed: 0 }
  }
  await ctx.db.patch(cleanup._id, { phase, cursor: 0, updatedAt: now })
  await scheduleNext(ctx, cleanup._id)
  return { done: false, processed: 0 }
}

async function hasNewerPendingExplorerIntent(
  ctx: CleanupCtx,
  row: Doc<"explorerOps">,
  repoPath: string,
): Promise<boolean> {
  const newer = await ctx.db
    .query("explorerOps")
    .withIndex("by_projectId_repoPath_status", (q) =>
      q.eq("projectId", row.projectId).eq("repoPath", repoPath).eq("status", "pending"),
    )
    .first()
  return Boolean(newer && newer._id !== row._id)
}

async function processExplorer(
  ctx: CleanupCtx,
  attempt: Doc<"publishAttempts">,
  associations: Array<{ opId: Id<"explorerOps">; repoPath?: string; expectedUpdatedAt?: number }>,
  outcomeByPath: Map<string, PathOutcome>,
) {
  const project = await ctx.db.get(attempt.projectId)
  let processed = 0
  for (const association of associations) {
    const row = await ctx.db.get(association.opId)
    if (!row || row.projectId !== attempt.projectId || !committedRowBelongsToAttempt(row, attempt)) continue
    const rowRepoPath =
      row.repoPath ??
      resolveStoredRepoPath(
        project?.contentRoot ?? "",
        row.filePath,
        row.pathRepresentation as StoredPathRepresentation | undefined,
      )
    if (association.repoPath !== undefined && rowRepoPath !== association.repoPath) {
      throw new Error("Publish cleanup explorer row path does not match its persisted association")
    }
    const repoPath = association.repoPath ?? rowRepoPath
    const outcome = outcomeByPath.get(repoPath)
    if (!outcome) throw new Error("Publish cleanup explorer association has no persisted outcome")
    if (outcome.disposition === "finalize" || (await hasNewerPendingExplorerIntent(ctx, row, repoPath))) {
      await ctx.db.delete(row._id)
    } else {
      await ctx.db.patch(row._id, {
        status: "pending",
        commitSha: undefined,
        publishBranchId: undefined,
        publishAttemptId: undefined,
        repoPath,
        updatedAt: Date.now(),
      })
    }
    processed += 1
  }
  return processed
}

async function hasNewerPendingMediaIntent(ctx: CleanupCtx, row: Doc<"mediaOps">): Promise<boolean> {
  const pending = await ctx.db
    .query("mediaOps")
    .withIndex("by_projectId_repoPath", (q) => q.eq("projectId", row.projectId).eq("repoPath", row.repoPath))
    .filter((q) => q.eq(q.field("status"), "pending"))
    .first()
  return Boolean(pending && pending._id !== row._id)
}

async function deleteMediaOrKeepTombstone(ctx: CleanupCtx, row: Doc<"mediaOps">) {
  if (row.convexStorageId) {
    try {
      await ctx.storage.delete(row.convexStorageId)
    } catch {
      await ctx.db.patch(row._id, {
        status: "failed",
        commitSha: undefined,
        publishBranchId: undefined,
        publishAttemptId: undefined,
        updatedAt: Date.now(),
      })
      return
    }
  }
  await ctx.db.delete(row._id)
}

async function processMedia(
  ctx: CleanupCtx,
  attempt: Doc<"publishAttempts">,
  associations: Doc<"publishAttempts">["mediaAssociations"],
  outcomeByPath: Map<string, PathOutcome>,
) {
  let processed = 0
  for (const association of associations) {
    const row = await ctx.db.get(association.mediaOpId)
    if (!row || row.projectId !== attempt.projectId || !committedRowBelongsToAttempt(row, attempt)) continue
    if (canonicalGitPathFromUrlPath(row.repoPath) !== association.repoPath) {
      throw new Error("Publish cleanup media row path does not match its persisted association")
    }
    const outcome = outcomeByPath.get(association.repoPath)
    if (!outcome) throw new Error("Publish cleanup media association has no persisted outcome")
    if (outcome.disposition === "finalize" || (await hasNewerPendingMediaIntent(ctx, row))) {
      await deleteMediaOrKeepTombstone(ctx, row)
    } else {
      await ctx.db.patch(row._id, {
        status: "pending",
        commitSha: undefined,
        publishBranchId: undefined,
        publishAttemptId: undefined,
        updatedAt: Date.now(),
      })
    }
    processed += 1
  }
  return processed
}

async function processDocuments(
  ctx: CleanupCtx,
  attempt: Doc<"publishAttempts">,
  associations: Doc<"publishAttempts">["documentAssociations"],
  outcomeByPath: Map<string, PathOutcome>,
) {
  let processed = 0
  for (const association of associations) {
    const document = await ctx.db.get(association.documentId)
    if (
      !document ||
      document.projectId !== attempt.projectId ||
      !provenanceBelongsToAttempt(document.publishedProvenance, attempt, association)
    ) {
      continue
    }
    const outcome = outcomeByPath.get(association.repoPath)
    if (!outcome) throw new Error("Publish cleanup document association has no persisted outcome")
    if (outcome.disposition === "restore") {
      // A newer draft must survive, but provenance for a dead/excluded
      // attempt must always be cleared so the document remains dirty.
      await ctx.db.patch(document._id, { publishedProvenance: undefined })
      processed += 1
      continue
    }
    const unchanged =
      association.contentVersion !== undefined
        ? (document.contentVersion ?? 0) === association.contentVersion
        : document.updatedAt === association.expectedUpdatedAt
    if (!unchanged) continue
    const publishedProvenance = {
      ...document.publishedProvenance!,
      publishAttemptId: attempt._id,
    }
    await ctx.db.patch(document._id, {
      status: "published",
      ...(outcome.finalBlobSha ? { githubSha: outcome.finalBlobSha } : {}),
      publishedProvenance,
      lastSyncedAt: Date.now(),
      publishedAt: Date.now(),
      updatedAt: Date.now(),
    })
    processed += 1
  }
  return processed
}

/** Process one persisted cleanup phase without scanning or inferring lane state. */
export async function processPublishAttemptCleanupBatch(ctx: CleanupCtx, cleanupId: Id<"publishAttemptCleanups">) {
  const cleanup = await ctx.db.get(cleanupId)
  if (!cleanup || cleanup.status === "complete") return { done: true, processed: 0 }
  if (!Number.isInteger(cleanup.cursor) || cleanup.cursor < 0) {
    throw new Error("Publish cleanup cursor is invalid")
  }
  const attempt = await ctx.db.get(cleanup.attemptId)
  const lane = await ctx.db.get(cleanup.laneId)
  if (
    !attempt ||
    !lane ||
    attempt.projectId !== cleanup.projectId ||
    attempt.publishBranchId !== cleanup.laneId ||
    lane.projectId !== cleanup.projectId ||
    attempt.cleanupId !== cleanup._id ||
    attempt.status !== "cleanup_pending"
  ) {
    throw new Error("Publish cleanup references no longer match its attempt and lane")
  }

  const outcomeByPath = new Map(cleanup.pathOutcomes.map((outcome) => [outcome.path, outcome]))
  assertPublishAttemptOutcomeClosure(attempt, new Set(outcomeByPath.keys()))
  const explorerAssociations =
    attempt.explorerAssociations ??
    attempt.opIds.map((opId) => ({ opId, repoPath: undefined, expectedUpdatedAt: undefined }))
  const allAssociations =
    cleanup.phase === "explorer"
      ? explorerAssociations
      : cleanup.phase === "media"
        ? attempt.mediaAssociations
        : cleanup.phase === "documents"
          ? attempt.documentAssociations
          : []
  if (cleanup.phase === "complete" || cleanup.cursor >= allAssociations.length) {
    return await moveToNextPhase(ctx, cleanup, attempt)
  }

  const batch = allAssociations.slice(cleanup.cursor, cleanup.cursor + CLEANUP_BATCH_SIZE)
  const processed =
    cleanup.phase === "explorer"
      ? await processExplorer(ctx, attempt, batch as typeof explorerAssociations, outcomeByPath)
      : cleanup.phase === "media"
        ? await processMedia(ctx, attempt, batch as Doc<"publishAttempts">["mediaAssociations"], outcomeByPath)
        : await processDocuments(ctx, attempt, batch as Doc<"publishAttempts">["documentAssociations"], outcomeByPath)

  const cursor = cleanup.cursor + batch.length
  if (cursor < allAssociations.length) {
    await ctx.db.patch(cleanup._id, { cursor, updatedAt: Date.now() })
    await scheduleNext(ctx, cleanup._id)
    return { done: false, processed }
  }

  const phase = nextPhase(cleanup.phase)
  if (phase === "complete") {
    const now = Date.now()
    await ctx.db.patch(cleanup._id, { phase, cursor: 0, status: "complete", updatedAt: now })
    await ctx.db.patch(attempt._id, { status: "cleaned", updatedAt: now })
    return { done: true, processed }
  }
  await ctx.db.patch(cleanup._id, { phase, cursor: 0, updatedAt: Date.now() })
  await scheduleNext(ctx, cleanup._id)
  return { done: false, processed }
}
