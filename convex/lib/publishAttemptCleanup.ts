import { canonicalGitPathFromUrlPath } from "../../lib/git-path-policy"
import { resolveStoredRepoPath, type StoredPathRepresentation } from "../../lib/preview/path-policy"
import { internal } from "../_generated/api"
import type { Doc, Id } from "../_generated/dataModel"
import type { MutationCtx } from "../_generated/server"
import { deleteOwnedMediaStorageOrKeepTombstone } from "./mediaTombstone"
import { assertValidPublishCleanupPlan } from "./publishCleanupAuthority"

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

function pendingRowMatchesAttemptSnapshot(
  row: { status: string; updatedAt: number; publishAttemptId?: unknown; publishBranchId?: unknown; commitSha?: string },
  expectedUpdatedAt: number | undefined,
) {
  return (
    row.status === "pending" &&
    expectedUpdatedAt !== undefined &&
    row.updatedAt === expectedUpdatedAt &&
    row.publishAttemptId === undefined &&
    row.publishBranchId === undefined &&
    row.commitSha === undefined
  )
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

export async function completeMergeVerificationIfIdle(ctx: Pick<CleanupCtx, "db">, laneId: Id<"publishBranches">) {
  const lane = await ctx.db.get(laneId)
  if (
    !lane ||
    lane.status !== "merged" ||
    !lane.mergeCommitSha ||
    lane.mergeVerificationState !== "pending" ||
    lane.laneInvalidationPending ||
    lane.laneCleanupAction
  )
    return
  for (const status of ["cleanup_pending", "committing", "committed", "reconciled"] as const) {
    const unresolved = await ctx.db
      .query("publishAttempts")
      .withIndex("by_publishBranchId_status", (q) => q.eq("publishBranchId", lane._id).eq("status", status))
      .first()
    if (unresolved) return
  }
  const pendingCleanup = await ctx.db
    .query("publishAttemptCleanups")
    .withIndex("by_laneId_status", (q) => q.eq("laneId", lane._id).eq("status", "pending"))
    .first()
  if (pendingCleanup) return
  await ctx.db.patch(lane._id, { mergeVerificationState: "complete", updatedAt: Date.now() })
}

/** Complete a verified unmerged close only after every lane cleanup is terminal. */
export async function completeCloseVerificationIfIdle(ctx: Pick<CleanupCtx, "db">, laneId: Id<"publishBranches">) {
  const lane = await ctx.db.get(laneId)
  if (
    !lane ||
    lane.status !== "closed" ||
    lane.closeVerificationState !== "pending" ||
    lane.laneInvalidationPending ||
    lane.laneCleanupAction
  )
    return false
  for (const status of ["cleanup_pending", "committing", "committed", "reconciled"] as const) {
    const unresolved = await ctx.db
      .query("publishAttempts")
      .withIndex("by_publishBranchId_status", (q) => q.eq("publishBranchId", lane._id).eq("status", status))
      .first()
    if (unresolved) return false
  }
  const pendingCleanup = await ctx.db
    .query("publishAttemptCleanups")
    .withIndex("by_laneId_status", (q) => q.eq("laneId", lane._id).eq("status", "pending"))
    .first()
  if (pendingCleanup) return false
  await ctx.db.patch(lane._id, { closeVerificationState: "complete", updatedAt: Date.now() })
  return true
}

async function maybeCompleteLaneVerification(ctx: CleanupCtx, cleanup: Doc<"publishAttemptCleanups">) {
  const lane = await ctx.db.get(cleanup.laneId)
  if (!lane) return
  if (lane.laneCleanupAction) {
    await ctx.scheduler.runAfter(0, (internal as any).publishBranches.continueLaneCleanup, { id: lane._id })
    return
  }
  if (lane.status === "closed") {
    await completeCloseVerificationIfIdle(ctx, cleanup.laneId)
    return
  }
  if (!cleanup.authoritySha || lane.mergeCommitSha !== cleanup.authoritySha) return
  await completeMergeVerificationIfIdle(ctx, cleanup.laneId)
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
    await maybeCompleteLaneVerification(ctx, cleanup)
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

async function finalizeDeletedDocument(
  ctx: CleanupCtx,
  attempt: Doc<"publishAttempts">,
  row: Doc<"explorerOps">,
  repoPath: string,
  contentRoot: string,
) {
  if (row.opType !== "delete") return
  const association = attempt.deleteAssociations.find((candidate) => candidate.opId === row._id)
  if (!association) return
  const document = await ctx.db.get(association.documentId)
  if (
    !document ||
    document.projectId !== attempt.projectId ||
    document.updatedAt !== association.expectedUpdatedAt ||
    resolveStoredRepoPath(
      contentRoot,
      document.filePath,
      document.pathRepresentation as StoredPathRepresentation | undefined,
    ) !== repoPath
  ) {
    return
  }
  await ctx.db.patch(document._id, {
    body: undefined,
    frontmatter: undefined,
    contentVersion: (document.contentVersion ?? 0) + 1,
    updatedAt: Date.now(),
  })
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
    if (
      !row ||
      row.projectId !== attempt.projectId ||
      (!committedRowBelongsToAttempt(row, attempt) &&
        !pendingRowMatchesAttemptSnapshot(row, association.expectedUpdatedAt))
    )
      continue
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
    if (outcome.disposition === "finalize") {
      await finalizeDeletedDocument(ctx, attempt, row, repoPath, project?.contentRoot ?? "")
      await ctx.db.delete(row._id)
    } else if (outcome.disposition === "discard" || (await hasNewerPendingExplorerIntent(ctx, row, repoPath))) {
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
  await deleteOwnedMediaStorageOrKeepTombstone(ctx, row)
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
    if (
      !row ||
      row.projectId !== attempt.projectId ||
      (!committedRowBelongsToAttempt(row, attempt) &&
        !pendingRowMatchesAttemptSnapshot(row, association.expectedUpdatedAt))
    )
      continue
    if (canonicalGitPathFromUrlPath(row.repoPath) !== association.repoPath) {
      throw new Error("Publish cleanup media row path does not match its persisted association")
    }
    const outcome = outcomeByPath.get(association.repoPath)
    if (!outcome) throw new Error("Publish cleanup media association has no persisted outcome")
    if (
      outcome.disposition === "finalize" ||
      outcome.disposition === "discard" ||
      (await hasNewerPendingMediaIntent(ctx, row))
    ) {
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
  lane: Doc<"publishBranches">,
  cleanup: Doc<"publishAttemptCleanups">,
  associations: Doc<"publishAttempts">["documentAssociations"],
  outcomeByPath: Map<string, PathOutcome>,
) {
  let processed = 0
  for (const association of associations) {
    const document = await ctx.db.get(association.documentId)
    if (!document || document.projectId !== attempt.projectId) {
      continue
    }
    const outcome = outcomeByPath.get(association.repoPath)
    if (!outcome) throw new Error("Publish cleanup document association has no persisted outcome")
    const ownsRecordedProvenance = provenanceBelongsToAttempt(document.publishedProvenance, attempt, association)
    const ownsUnrecordedSnapshot =
      !document.publishedProvenance &&
      document.updatedAt === association.expectedUpdatedAt &&
      (association.contentVersion === undefined || (document.contentVersion ?? 0) === association.contentVersion)
    if (!ownsRecordedProvenance && !ownsUnrecordedSnapshot) continue
    if (outcome.disposition === "restore" || outcome.disposition === "discard") {
      // A newer draft must survive, but provenance for a dead/excluded
      // attempt must always be cleared so the document remains dirty. A
      // verified restore also resets the optimistic-lock baseline to the
      // immutable final/base tree (undefined means the path is absent).
      await ctx.db.patch(document._id, {
        githubSha: outcome.finalBlobSha,
        gitBaselineState: outcome.finalBlobSha ? ("blob" as const) : ("absent" as const),
        ...(ownsRecordedProvenance ? { publishedProvenance: undefined } : {}),
      })
      processed += 1
      continue
    }
    const unchanged =
      association.contentVersion !== undefined
        ? (document.contentVersion ?? 0) === association.contentVersion
        : document.updatedAt === association.expectedUpdatedAt
    if (!unchanged) continue
    if (!cleanup.authoritySha) throw new Error("Finalized publish document cleanup requires an authority SHA")
    if (
      lane.status !== "merged" ||
      !lane.baseBranch ||
      lane.mergeCommitSha !== cleanup.authoritySha ||
      lane._id !== attempt.publishBranchId
    ) {
      throw new Error("Finalized publish document cleanup requires the exact merged base authority")
    }
    // The immutable merge tree is the authority that proved publication.
    // Attempt/lane identifiers are lineage, not authority, and the ratified
    // base provenance shape deliberately carries neither.
    const publishedProvenance = {
      authorityKind: "base" as const,
      authorityBranch: lane.baseBranch,
      commitSha: cleanup.authoritySha,
      contentRevision: association.contentRevision,
      publishedContentVersion: association.contentVersion,
      publishedUpdatedAt: association.expectedUpdatedAt,
    }
    await ctx.db.patch(document._id, {
      status: "published",
      ...(outcome.finalBlobSha ? { githubSha: outcome.finalBlobSha } : {}),
      ...(outcome.finalBlobSha ? { gitBaselineState: "blob" as const } : {}),
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
  const project = await ctx.db.get(cleanup.projectId)
  assertValidPublishCleanupPlan({
    project,
    lane,
    attempt,
    plan: {
      projectId: cleanup.projectId,
      laneId: cleanup.laneId,
      attemptId: cleanup.attemptId,
      cleanupId: cleanup._id,
      authoritySha: cleanup.authoritySha,
      pathOutcomes: cleanup.pathOutcomes,
    },
    stage: "continuation",
  })
  // The full validator above establishes these live references.
  if (!attempt || !lane) throw new Error("Publish cleanup references disappeared during validation")

  const outcomeByPath = new Map(cleanup.pathOutcomes.map((outcome) => [outcome.path, outcome]))
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
        : await processDocuments(
            ctx,
            attempt,
            lane,
            cleanup,
            batch as Doc<"publishAttempts">["documentAssociations"],
            outcomeByPath,
          )

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
    await maybeCompleteLaneVerification(ctx, cleanup)
    return { done: true, processed }
  }
  await ctx.db.patch(cleanup._id, { phase, cursor: 0, updatedAt: Date.now() })
  await scheduleNext(ctx, cleanup._id)
  return { done: false, processed }
}
