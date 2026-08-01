import { ConvexHttpClient } from "convex/browser"
import { NextResponse } from "next/server"
import { api } from "@/convex/_generated/api"
import type { Id } from "@/convex/_generated/dataModel"
import { canonicalGitPathFromUrlPath } from "@/lib/git-path-policy"
import type { BatchOperation } from "@/lib/github"
import {
  BranchHeadMovedError,
  batchCommitPublishLaneAtExpectedHead,
  branchExists,
  createGitHubClient,
  createPublishBranchFromSha,
  createPullRequest,
  findOpenPublishLanePullRequest,
  GitHubReadError,
  getBranchHeadForPublish,
  getCommitDetailsForPublish,
  getFileForPublish,
  inspectPublishEffectsAtCommit,
  type PublishFileReadResult,
  updatePullRequest,
  verifyPublishAttemptCommitForPublish,
} from "@/lib/github"
import { resolveStoredRepoPath, type StoredPathRepresentation } from "@/lib/preview/path-policy"
import { mintServerQueryToken } from "@/lib/project-access-token"
import { buildPublishBranchName, derivePublishBranchScope } from "@/lib/publish-branch-name"
import { detectMetadataSource, serializePublishContent } from "@/lib/publish-content"
import {
  buildPublishOperationDescriptors,
  commitMessageCarriesAttempt,
  computePublishPlanDigest,
  formatPublishAttemptTrailer,
  type PublishOperationDescriptor,
  sha256Hex,
} from "@/lib/publish-plan"
import { RouteAuthError, resolveRouteAuth } from "@/lib/route-auth"
import { isStudioMediaResolveUrl } from "@/lib/studio/media-resolve"

const convex = new ConvexHttpClient(process.env.NEXT_PUBLIC_CONVEX_URL!)
const ACTIVE_PUBLISH_BRANCH_CONFLICT_MESSAGE = "Active publish branch already exists for project"

export async function POST(request: Request) {
  try {
    const body = await request.json()
    const { projectId, title, description, publishMode } = body as {
      projectId: string
      title?: string
      description?: string
      publishMode?: "reuse-current" | "create-new"
    }
    const publishModeUsed = publishMode === "create-new" ? "create-new" : "reuse-current"

    if (!projectId) {
      return NextResponse.json({ error: "Missing projectId" }, { status: 400 })
    }

    const serverQueryToken = await mintServerQueryToken()
    const project = await convex.query(api.projects.get, {
      id: projectId as Id<"projects">,
      serverQueryToken,
    })
    if (!project) {
      return NextResponse.json({ error: "Project not found" }, { status: 404 })
    }

    let auth: Awaited<ReturnType<typeof resolveRouteAuth>>
    try {
      auth = await resolveRouteAuth(project, "editor")
    } catch (e) {
      if (e instanceof RouteAuthError) {
        return NextResponse.json({ error: e.message }, { status: e.status })
      }
      throw e
    }
    const { actingUserId, projectAccessToken, githubToken: token } = auth

    const { repoOwner: owner, repoName: repo, branch: baseBranch, contentRoot } = project

    const queryAuth = { userId: actingUserId, projectAccessToken }
    const loadStagedState = () =>
      Promise.all([
        convex.query(api.explorerOps.listPending, {
          projectId: project._id,
          ...queryAuth,
        }),
        convex.query(api.documents.listDirtyForProject, {
          projectId: project._id,
          ...queryAuth,
        }),
        convex.query(api.mediaOps.listPending, {
          projectId: project._id,
          ...queryAuth,
        }),
      ])
    let [pendingOps, dirtyDocs, pendingMediaOps] = await loadStagedState()

    // ── Recover a publish attempt stranded at the commit boundary ──
    // Runs BEFORE the no-pending check (a crashed attempt that already
    // reconciled its ops leaves nothing pending, yet must still be closed
    // out) and BEFORE this request's publishMode is applied (recovery of the
    // previous attempt must not depend on the new request's intent).
    const activeAttempt = await convex.query(api.publishAttempts.getActiveForProject, {
      projectId: project._id,
      ...queryAuth,
    })
    if (activeAttempt) {
      const recovery = await recoverPublishAttempt({
        convex,
        attempt: activeAttempt,
        projectId: project._id,
        token,
        owner,
        repo,
        title,
        description,
        serverQueryToken,
        actingUserId,
        projectAccessToken,
      })
      if (recovery.handled) {
        return recovery.response
      }
      // The attempt was superseded - continue with a fresh publish against
      // the current head. When resolving it invalidated a closed lane, the
      // restored operations/documents must join THIS publish, so re-read
      // the staged state.
      if (recovery.stagedStateStale) {
        ;[pendingOps, dirtyDocs, pendingMediaOps] = await loadStagedState()
      }
    }

    if (pendingOps.length === 0 && dirtyDocs.length === 0 && pendingMediaOps.length === 0) {
      return NextResponse.json({ error: "No pending changes to publish" }, { status: 400 })
    }

    const resolvedPendingOps = pendingOps.map((source) => ({
      source,
      repoPath: resolveStoredRepoPath(
        contentRoot,
        source.filePath,
        source.pathRepresentation as StoredPathRepresentation | undefined,
      ),
    }))
    const resolvedDirtyDocs = dirtyDocs.map((source) => ({
      source,
      repoPath: resolveStoredRepoPath(
        contentRoot,
        source.filePath,
        source.pathRepresentation as StoredPathRepresentation | undefined,
      ),
    }))
    const identityConflicts = findContentIdentityConflicts(resolvedPendingOps, resolvedDirtyDocs)
    if (identityConflicts.length > 0) {
      return NextResponse.json({ ok: false, conflicts: identityConflicts }, { status: 409 })
    }

    const contentOpPaths = new Set(resolvedPendingOps.map(({ repoPath }) => repoPath))
    const dirtyDocByRepoPath = new Map(resolvedDirtyDocs.map((resolved) => [resolved.repoPath, resolved.source]))
    const deleteAssociations = resolvedPendingOps.flatMap(({ source, repoPath }) => {
      if (source.opType !== "delete") return []
      const document = dirtyDocByRepoPath.get(repoPath)
      return document ? [{ opId: source._id, documentId: document._id, expectedUpdatedAt: document.updatedAt }] : []
    })
    const pathsToFetch = new Map<string, string>()

    for (const { source: op, repoPath } of resolvedPendingOps) {
      if (op.opType === "create") {
        pathsToFetch.set(`content:${repoPath}`, repoPath)
      } else if (op.opType === "delete" && op.previousSha) {
        pathsToFetch.set(`content:${repoPath}`, repoPath)
      }
    }

    for (const { repoPath } of resolvedDirtyDocs) {
      if (contentOpPaths.has(repoPath)) continue
      // Prefetch regardless of githubSha: even when a dirty doc lost its sha,
      // the file may still exist on GitHub, and its current content is the
      // metadata-format authority (frontmatter vs export const metadata).
      // A genuinely-new file reads as "absent", which yields source "none".
      pathsToFetch.set(`content:${repoPath}`, repoPath)
    }

    for (const mediaOp of pendingMediaOps) {
      const normalizedPath = canonicalGitPathFromUrlPath(mediaOp.repoPath)
      pathsToFetch.set(`media:${normalizedPath}`, normalizedPath)
    }

    // ── Lane decision (before any reads, so one Git authority can be pinned) ──
    // By default, reuse the current active lane. Callers can opt into a fresh lane/PR.
    let publishBranch = await convex.query(api.publishBranches.getCurrentForProject, {
      projectId: project._id,
      ...queryAuth,
    })
    const currentPublishBranchId = publishBranch?._id

    if (publishModeUsed === "create-new") {
      const openPublishBranches = await convex.query(api.publishBranches.listOpenForProject, {
        projectId: project._id,
        ...queryAuth,
      })
      const stagedRepoPaths = new Set<string>([
        ...resolvedPendingOps.map(({ repoPath }) => repoPath),
        ...resolvedDirtyDocs.map(({ repoPath }) => repoPath),
        ...pendingMediaOps.map((mediaOp) => canonicalGitPathFromUrlPath(mediaOp.repoPath)),
      ])
      const overlaps = openPublishBranches.flatMap((branch) =>
        branch._id === currentPublishBranchId
          ? []
          : (branch.committedFilePaths ?? [])
              .filter((path) => stagedRepoPaths.has(path))
              .map((path) => ({
                path,
                publishBranchId: branch._id,
                branchName: branch.branchName,
                prNumber: branch.prNumber,
                prUrl: branch.prUrl,
              })),
      )

      if (overlaps.length > 0) {
        return NextResponse.json({ ok: false, overlaps }, { status: 409 })
      }

      publishBranch = null
    }

    // ── Pin the single Git authority for this publish ──
    // Existing lanes read and commit against their pinned lane head; new
    // lanes read against the pinned base head and are created from that
    // exact SHA. Every preflight read and the CAS commit use this one SHA.
    const authorityBranch = publishBranch ? publishBranch.branchName : baseBranch
    let authoritySha: string
    try {
      const head = await getBranchHeadForPublish(token, owner, repo, authorityBranch)
      if (head.status === "absent") {
        if (publishBranch) {
          return NextResponse.json(
            {
              ok: false,
              error: `Publish lane branch ${authorityBranch} no longer exists on GitHub. Create a new lane (publishMode "create-new") to continue.`,
            },
            { status: 409 },
          )
        }
        return NextResponse.json(
          { ok: false, error: `Base branch ${baseBranch} does not exist on GitHub` },
          { status: 502 },
        )
      }
      authoritySha = head.sha
    } catch (error) {
      if (error instanceof GitHubReadError) {
        console.error("Publish authority resolution failed:", error)
        return NextResponse.json(
          { ok: false, error: `Publish aborted before any commit: ${error.message}. Retry once GitHub reads succeed.` },
          { status: 502 },
        )
      }
      throw error
    }

    // Typed preflight reads pinned to the publish authority SHA: only a 404
    // counts as "absent". Any other read failure aborts the publish before a
    // commit exists - proceeding on an ambiguous read disables sha-conflict
    // detection and produces unflagged overwrites on the publish branch.
    const prefetchResults = new Map<string, PublishFileReadResult>()
    let fetchResults: Array<{ key: string; result: PublishFileReadResult }>
    try {
      fetchResults = await Promise.all(
        Array.from(pathsToFetch, async ([key, fullPath]) => {
          const result = await getFileForPublish(token, owner, repo, fullPath, authoritySha)
          return { key, result }
        }),
      )
    } catch (error) {
      if (error instanceof GitHubReadError) {
        console.error("Publish preflight read failed:", error)
        return NextResponse.json(
          {
            ok: false,
            error: `Publish aborted before any commit: ${error.message}. Retry once GitHub reads succeed.`,
          },
          { status: 502 },
        )
      }
      throw error
    }
    for (const { key, result } of fetchResults) {
      prefetchResults.set(key, result)
    }

    const operations: BatchOperation[] = []
    const conflicts: { path: string; reason: string }[] = []
    // Exact serialized bytes planned per content path - the source of each
    // document association's content-specific revision digest.
    const serializedContentByRepoPath = new Map<string, string>()
    // Dirty documents whose serialized content is already byte-identical on
    // the publish authority. They need no commit, but they DO need their
    // provenance reconciled - otherwise workflow-only changes (or a revert
    // back to published content) dead-end as permanently dirty.
    const redundantSynchronizations: Array<{
      documentId: Id<"documents">
      githubSha: string
      contentRevision: string
      contentVersion: number
      expectedUpdatedAt: number
    }> = []

    for (const { source: op, repoPath } of resolvedPendingOps) {
      if (op.opType === "create") {
        const existing = prefetchResults.get(`content:${repoPath}`)
        if (existing?.status === "found") {
          conflicts.push({
            path: repoPath,
            reason: `File already exists on ${authorityBranch} (sha: ${existing.file.sha})`,
          })
          continue
        }

        const doc = dirtyDocByRepoPath.get(repoPath)
        const rawFrontmatter = doc ? doc.frontmatter || {} : op.initialFrontmatter || {}
        const rawBody = doc ? doc.body || "" : op.initialBody || ""
        const serialized = serializePublishContent({
          filePath: repoPath,
          body: rawBody,
          frontmatter: rewriteProxyUrls(rawFrontmatter),
          metadataSource: "none",
        })
        if (!serialized.ok) {
          conflicts.push({ path: repoPath, reason: serialized.reason })
          continue
        }
        serializedContentByRepoPath.set(repoPath, serialized.content)

        operations.push({
          path: repoPath,
          content: serialized.content,
          contentEncoding: "utf-8",
          action: "create",
        })
        continue
      }

      if (op.opType === "delete") {
        if (op.previousSha) {
          const existing = prefetchResults.get(`content:${repoPath}`)
          if (existing?.status === "found" && existing.file.sha !== op.previousSha) {
            conflicts.push({
              path: repoPath,
              reason: `File has been modified since staging deletion (expected sha: ${op.previousSha}, current: ${existing.file.sha})`,
            })
            continue
          }
        }

        operations.push({ path: repoPath, action: "delete" })
      }
    }

    for (const { source: doc, repoPath } of resolvedDirtyDocs) {
      if (contentOpPaths.has(repoPath)) continue
      const existing = prefetchResults.get(`content:${repoPath}`)
      const gitBaselineState = doc.gitBaselineState ?? (doc.githubSha ? "blob" : undefined)
      if (gitBaselineState === "unknown") {
        conflicts.push({
          path: repoPath,
          reason: "Git baseline is unknown after lane recovery; refresh this document from GitHub before publishing.",
        })
        continue
      }
      if (gitBaselineState === "absent" && existing?.status === "found") {
        conflicts.push({
          path: repoPath,
          reason: `File was expected to remain absent on GitHub but now exists (current sha: ${existing.file.sha})`,
        })
        continue
      }
      if (gitBaselineState === "blob" && existing?.status === "absent") {
        conflicts.push({
          path: repoPath,
          reason: `File was deleted on GitHub since last sync (expected sha: ${doc.githubSha ?? "unknown"})`,
        })
        continue
      }
      if (gitBaselineState === "blob" && existing?.status === "found" && existing.file.sha !== doc.githubSha) {
        conflicts.push({
          path: repoPath,
          reason: `File has been modified on GitHub since last sync (expected sha: ${doc.githubSha}, current: ${existing.file.sha})`,
        })
        continue
      }

      // Preserve the repository's metadata format: the existing file is the
      // provenance authority; an absent file yields "none" (YAML only when
      // frontmatter fields actually exist).
      const metadataSource =
        existing?.status === "found" ? detectMetadataSource(existing.file.content, repoPath) : "none"
      const serialized = serializePublishContent({
        filePath: repoPath,
        body: doc.body || "",
        frontmatter: rewriteProxyUrls(doc.frontmatter || {}),
        metadataSource,
        existingContent: existing?.status === "found" ? existing.file.content : undefined,
      })
      if (!serialized.ok) {
        conflicts.push({ path: repoPath, reason: serialized.reason })
        continue
      }
      serializedContentByRepoPath.set(repoPath, serialized.content)
      // Redundancy guard: when the serialized content is byte-identical to
      // the file at the publish authority, there is nothing to commit for
      // this document - skipping it prevents empty "update" commits on
      // every publish after a create/update landed.
      if (existing?.status === "found" && existing.file.content === serialized.content) {
        redundantSynchronizations.push({
          documentId: doc._id,
          githubSha: existing.file.sha,
          contentRevision: sha256Hex(serialized.content),
          contentVersion: doc.contentVersion ?? 0,
          expectedUpdatedAt: doc.updatedAt,
        })
        continue
      }
      operations.push({
        path: repoPath,
        content: serialized.content,
        contentEncoding: "utf-8",
        action: "update",
      })
    }

    const contentCreateCount = operations.filter((o) => o.action === "create").length
    const contentUpdateCount = operations.filter((o) => o.action === "update").length
    const contentDeleteCount = operations.filter((o) => o.action === "delete").length

    const mediaBatchOps = await buildMediaBatchOperations({
      convex,
      projectId: project._id,
      queryAuth,
      token,
      owner,
      repo,
      authorityBranch,
      pendingMediaOps,
      prefetchResults,
      conflicts,
    })
    operations.push(...mediaBatchOps)

    if (conflicts.length > 0) {
      return NextResponse.json({ ok: false, conflicts }, { status: 409 })
    }

    if (operations.length === 0) {
      // Everything staged serializes to bytes already on the selected Git
      // authority (the active lane, or base when no lane is selected).
      // Reconcile the documents clean WITHOUT a commit: their provenance
      // records that authority head as the holding commit. Idempotent and
      // replay-safe like any snapshot stamp, so no attempt row is needed -
      // a partial failure simply leaves the rest dirty for a retry.
      if (redundantSynchronizations.length > 0) {
        // The equality reads above were pinned to authoritySha. Re-read the
        // mutable ref immediately before stamping provenance so a branch
        // move can never make an old byte comparison look current.
        let finalAuthorityHead: Awaited<ReturnType<typeof getBranchHeadForPublish>>
        try {
          finalAuthorityHead = await getBranchHeadForPublish(token, owner, repo, authorityBranch)
        } catch (error) {
          if (error instanceof GitHubReadError) {
            console.error("Zero-commit authority recheck failed:", error)
            return NextResponse.json(
              {
                ok: false,
                error: `Publish synchronization aborted: ${error.message}. Retry once GitHub reads succeed.`,
              },
              { status: 502 },
            )
          }
          throw error
        }
        if (finalAuthorityHead.status === "absent" || finalAuthorityHead.sha !== authoritySha) {
          return NextResponse.json(
            { ok: false, error: `Publish authority ${authorityBranch} changed during synchronization. Retry.` },
            { status: 409 },
          )
        }

        const provenanceServerQueryToken = await mintServerQueryToken()
        let failedCount = 0
        for (const redundant of redundantSynchronizations) {
          try {
            const result = await convex.mutation(api.documents.markPublishedSnapshot, {
              id: redundant.documentId,
              githubSha: redundant.githubSha,
              authorityKind: publishBranch ? "lane" : "base",
              authorityBranch,
              ...(publishBranch ? { publishBranchId: publishBranch._id } : {}),
              commitSha: authoritySha,
              contentRevision: redundant.contentRevision,
              publishedContentVersion: redundant.contentVersion,
              expectedUpdatedAt: redundant.expectedUpdatedAt,
              serverQueryToken: provenanceServerQueryToken,
              userId: actingUserId,
              projectAccessToken,
            })
            if (result?.synchronized === false) failedCount += 1
          } catch (error) {
            failedCount += 1
            console.error("Redundant-content reconciliation failed:", { documentId: redundant.documentId, error })
          }
        }
        return NextResponse.json({
          ok: true,
          publishModeUsed,
          synchronizedOnly: true,
          prUrl: publishBranch?.prUrl,
          prNumber: publishBranch?.prNumber,
          summary: `${redundantSynchronizations.length - failedCount} document(s) reconciled without a commit (content already on ${authorityBranch})`,
          warning:
            failedCount > 0
              ? `${failedCount} document(s) could not record their reconciliation; publish again to retry.`
              : undefined,
        })
      }
      return NextResponse.json({ error: "No valid operations to publish" }, { status: 400 })
    }

    let branchName = publishBranch?.branchName

    if (!publishBranch) {
      const existingBranchNames = await convex.query(api.publishBranches.listBranchNamesForProject, {
        projectId: project._id,
        ...queryAuth,
      })
      const scope = derivePublishBranchScope(
        operations.map((operation) => operation.path),
        contentRoot,
      )
      branchName = await createAvailablePublishBranch({
        token,
        owner,
        repo,
        baseSha: authoritySha,
        scope,
        existingBranchNames,
      })
      try {
        await convex.mutation(api.publishBranches.create, {
          projectId: project._id,
          userId: actingUserId,
          projectAccessToken,
          branchName,
          baseBranch,
          deactivateBranchId: publishModeUsed === "create-new" ? (currentPublishBranchId ?? undefined) : undefined,
        })
      } catch (error) {
        if (isActivePublishBranchConflict(error)) {
          await cleanupOrphanedPublishBranch({
            token,
            owner,
            repo,
            branchName,
          })
          return NextResponse.json(
            {
              ok: false,
              error: "Another active publish lane already exists for this project. Reuse the current lane or retry.",
            },
            { status: 409 },
          )
        }
        throw error
      }
      publishBranch = await convex.query(api.publishBranches.getCurrentForProject, {
        projectId: project._id,
        ...queryAuth,
      })
      if (!publishBranch) {
        return NextResponse.json({ error: "Failed to create publish branch record" }, { status: 500 })
      }
    }

    if (!branchName) {
      return NextResponse.json({ error: "Failed to resolve publish branch" }, { status: 500 })
    }

    const mediaCreateCount = mediaBatchOps.filter((o) => o.action === "create").length
    const mediaUpdateCount = mediaBatchOps.filter((o) => o.action === "update").length

    const parts: string[] = []
    if (contentCreateCount > 0) parts.push(`${contentCreateCount} created`)
    if (contentUpdateCount > 0) parts.push(`${contentUpdateCount} updated`)
    if (contentDeleteCount > 0) parts.push(`${contentDeleteCount} deleted`)
    if (mediaCreateCount > 0) parts.push(`${mediaCreateCount} media created`)
    if (mediaUpdateCount > 0) parts.push(`${mediaUpdateCount} media updated`)

    // ── Durable attempt + expected-head CAS commit ──
    // The attempt row (with the plan digest, also embedded in the commit
    // message trailer) is written BEFORE the commit, so a crash anywhere
    // after this point is recoverable on retry without committing again.
    const operationDescriptors = buildPublishOperationDescriptors(operations)
    const planDigest = computePublishPlanDigest({
      branchName,
      expectedHeadSha: authoritySha,
      operationDescriptors,
      opIds: pendingOps.map((op) => String(op._id)),
      mediaOpIds: pendingMediaOps.map((op) => String(op._id)),
      deleteAssociations: deleteAssociations.map((association) => ({
        opId: String(association.opId),
        documentId: String(association.documentId),
        expectedUpdatedAt: association.expectedUpdatedAt,
      })),
    })
    // Documents whose SHAs must be refreshed at the landed commit: every
    // dirty document EXCEPT those tied to a staged delete (their content is
    // cleared via deleteAssociations instead). Create-op documents are
    // included - without a refreshed githubSha their next publish would
    // re-commit unchanged content.
    const deleteOpPaths = new Set(
      resolvedPendingOps.filter(({ source }) => source.opType === "delete").map(({ repoPath }) => repoPath),
    )
    const plannedOperationPaths = new Set(operationDescriptors.map((descriptor) => descriptor.path))
    const documentAssociations = resolvedDirtyDocs
      .filter(({ repoPath }) => !deleteOpPaths.has(repoPath) && plannedOperationPaths.has(repoPath))
      .map(({ source, repoPath }) => ({
        documentId: source._id,
        repoPath,
        expectedUpdatedAt: source.updatedAt,
        // Content-specific revision of the exact serialized bytes this
        // publish plans for the document (set for every non-delete path on
        // the success path; conflicts abort before associations are built).
        contentRevision: sha256Hex(serializedContentByRepoPath.get(repoPath) ?? ""),
        // The document's content version at planning time - reconciliation
        // stamps it into provenance, where cleanliness compares content
        // versions (immune to workflow-only updatedAt bumps).
        contentVersion: source.contentVersion ?? 0,
      }))
    let attemptId: Id<"publishAttempts">
    try {
      attemptId = await convex.mutation(api.publishAttempts.begin, {
        projectId: project._id,
        publishBranchId: publishBranch._id,
        branchName,
        expectedHeadSha: authoritySha,
        planDigest,
        operationDescriptors,
        opIds: pendingOps.map((op) => op._id),
        mediaAssociations: pendingMediaOps.map((op) => ({
          mediaOpId: op._id,
          repoPath: canonicalGitPathFromUrlPath(op.repoPath),
          expectedUpdatedAt: op.updatedAt,
        })),
        documentAssociations,
        deleteAssociations,
        userId: actingUserId,
        projectAccessToken,
      })
    } catch (error) {
      // begin validates the planned snapshot transactionally; any failure
      // means staged state changed between planning and the commit boundary
      // (or another attempt won the race). Nothing was committed.
      const message = error instanceof Error ? error.message : "publish attempt validation failed"
      console.error("Publish attempt begin rejected:", error)
      return NextResponse.json(
        {
          ok: false,
          error: `Publish aborted before any commit: ${message}. Retry to publish the current staged state.`,
        },
        { status: 409 },
      )
    }

    const commitMessage = `chore(content): ${parts.join(", ")} via RepoPress\n\n${formatPublishAttemptTrailer(planDigest)}`
    let commitSha: string
    try {
      ;({ commitSha } = await batchCommitPublishLaneAtExpectedHead(
        token,
        owner,
        repo,
        { branch: branchName, protectedBaseBranch: baseBranch, expectedHeadSha: authoritySha },
        operations,
        commitMessage,
      ))
    } catch (error) {
      if (error instanceof BranchHeadMovedError) {
        await convex.mutation(api.publishAttempts.supersede, {
          id: attemptId,
          serverQueryToken,
          userId: actingUserId,
          projectAccessToken,
        })
        return NextResponse.json(
          {
            ok: false,
            error: `The publish branch advanced while publishing. No commit was created by this request; retry to publish against the new head.`,
          },
          { status: 409 },
        )
      }
      throw error
    }
    await convex.mutation(api.publishAttempts.recordCommit, {
      id: attemptId,
      commitSha,
      serverQueryToken,
      userId: actingUserId,
      projectAccessToken,
    })

    // PR creation: Only create a new PR if one doesn't exist for this branch.
    // When the PR already exists (prNumber is set), we skip PR creation and just push commits.
    // This is intentional - additional publishes will update the same PR with new commits.
    let prUrl = publishBranch.prUrl
    let prNumber = publishBranch.prNumber
    let warning: string | undefined

    if (!prNumber) {
      const prTitle = title || `Content update via RepoPress (${parts.join(", ")}) (PR from RepoPress)`
      const prBody =
        description || `Automated content update from RepoPress.\n\n${parts.map((p) => `- ${p}`).join("\n")}`
      const ensured = await ensureLanePullRequest({
        token,
        owner,
        repo,
        branchName,
        baseBranch,
        prTitle,
        prBody,
      })
      prNumber = ensured.prNumber
      prUrl = ensured.prUrl
      if (ensured.warning) {
        warning = warning ? `${warning} ${ensured.warning}` : ensured.warning
      }
    } else if (title || description) {
      try {
        await updatePullRequest(token, owner, repo, prNumber, {
          title: title || undefined,
          body: description || undefined,
        })
      } catch (error) {
        warning = "Commit pushed, but updating the existing PR title/description failed."
        console.error("Failed to update existing PR metadata:", error)
      }
    }

    await convex.mutation(api.publishBranches.updateAfterCommit, {
      id: publishBranch._id,
      userId: actingUserId,
      projectAccessToken,
      prNumber,
      prUrl,
      lastCommitSha: commitSha,
      newFilePaths: operations.map((op) => op.path),
    })

    let opMarkResult: { skippedDeleteAssociations?: unknown[]; unreconciledOpIds?: unknown[] } | undefined
    if (pendingOps.length > 0) {
      opMarkResult = await convex.mutation(api.explorerOps.markCommitted, {
        ids: pendingOps.map((op) => op._id),
        deleteAssociations,
        commitSha,
        publishBranchId: publishBranch._id,
        publishAttemptId: attemptId,
        userId: actingUserId,
        projectAccessToken,
      })
    }

    let mediaMarkResult: { unreconciledMediaOpIds?: unknown[] } | undefined
    if (pendingMediaOps.length > 0) {
      mediaMarkResult = await convex.mutation(api.mediaOps.markCommitted, {
        ids: pendingMediaOps.map((op) => op._id),
        commitSha,
        publishBranchId: publishBranch._id,
        publishAttemptId: attemptId,
        userId: actingUserId,
        projectAccessToken,
      })
    }
    const reconciliationWarning = describeReconciliationWarnings(commitSha, opMarkResult, mediaMarkResult)
    if (reconciliationWarning) {
      warning = warning ? `${warning} ${reconciliationWarning}` : reconciliationWarning
    }

    const refresh = await refreshDocumentShasAtCommit({
      convex,
      token,
      owner,
      repo,
      authorityBranch: publishBranch.branchName,
      publishBranchId: publishBranch._id,
      publishAttemptId: attemptId,
      commitSha,
      documentAssociations,
      actingUserId,
      projectAccessToken,
    })

    let reconciliationIncomplete = false
    if (refresh.failedCount > 0) {
      // Retryable: the attempt stays "committed" so the next publish request
      // re-enters recovery, finishes the SHA refresh, and reconciles - it
      // never commits again. Marking reconciled here would convert this
      // transient failure into a future false conflict.
      reconciliationIncomplete = true
      const refreshWarning = `${refresh.failedCount} document(s) could not sync their GitHub state after commit ${commitSha}; publish again to finish reconciliation (no new commit will be created).`
      warning = warning ? `${warning} ${refreshWarning}` : refreshWarning
    } else {
      await convex.mutation(api.publishAttempts.markReconciled, {
        id: attemptId,
        serverQueryToken,
        userId: actingUserId,
        projectAccessToken,
      })
    }

    return NextResponse.json({
      ok: true,
      prUrl,
      prNumber,
      publishModeUsed,
      commitSha,
      summary: parts.join(", "),
      warning,
      reconciliationIncomplete: reconciliationIncomplete || undefined,
      media: {
        created: mediaCreateCount,
        updated: mediaUpdateCount,
      },
    })
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Failed to publish"
    console.error("Error in publish-ops:", error)
    return NextResponse.json({ error: message }, { status: 500 })
  }
}

function findContentIdentityConflicts<
  Pending extends { repoPath: string; source: { opType: string; createdAt?: number } },
  Document extends { repoPath: string; source: { updatedAt?: number } },
>(pendingOps: Pending[], dirtyDocs: Document[]): { path: string; reason: string }[] {
  const identities = new Map<string, { pendingOps: Pending[]; dirtyDocs: Document[] }>()

  for (const pendingOp of pendingOps) {
    const identity = identities.get(pendingOp.repoPath) ?? { pendingOps: [], dirtyDocs: [] }
    identity.pendingOps.push(pendingOp)
    identities.set(pendingOp.repoPath, identity)
  }
  for (const dirtyDoc of dirtyDocs) {
    const identity = identities.get(dirtyDoc.repoPath) ?? { pendingOps: [], dirtyDocs: [] }
    identity.dirtyDocs.push(dirtyDoc)
    identities.set(dirtyDoc.repoPath, identity)
  }

  const conflicts: { path: string; reason: string }[] = []
  for (const [path, identity] of identities) {
    const singlePendingOp = identity.pendingOps.length === 1 ? identity.pendingOps[0].source : undefined
    const singleDirtyDoc = identity.dirtyDocs.length === 1 ? identity.dirtyDocs[0].source : undefined
    const documentChangedAfterDelete =
      singlePendingOp?.opType === "delete" &&
      typeof singlePendingOp.createdAt === "number" &&
      typeof singleDirtyDoc?.updatedAt === "number" &&
      singleDirtyDoc.updatedAt > singlePendingOp.createdAt
    const isSingleOperationWithDocument = Boolean(singlePendingOp && singleDirtyDoc && !documentChangedAfterDelete)
    const hasDuplicatePendingOps = identity.pendingOps.length > 1
    const hasDuplicateDirtyDocs = identity.dirtyDocs.length > 1
    const hasMixedSourceCollision =
      identity.pendingOps.length > 0 && identity.dirtyDocs.length > 0 && !isSingleOperationWithDocument

    if (hasDuplicatePendingOps || hasDuplicateDirtyDocs || hasMixedSourceCollision) {
      conflicts.push({
        path,
        reason: documentChangedAfterDelete
          ? "Document changed after delete was staged"
          : "Resolved content path collision between pending changes",
      })
    }
  }
  return conflicts
}

function isActivePublishBranchConflict(error: unknown) {
  return error instanceof Error && error.message.includes(ACTIVE_PUBLISH_BRANCH_CONFLICT_MESSAGE)
}

function describeReconciliationWarnings(
  commitSha: string,
  opMarkResult: { skippedDeleteAssociations?: unknown[]; unreconciledOpIds?: unknown[] } | null | undefined,
  mediaMarkResult?: { unreconciledMediaOpIds?: unknown[] } | null,
): string | undefined {
  const details: string[] = []
  const skipped = opMarkResult?.skippedDeleteAssociations ?? []
  if (skipped.length > 0) {
    details.push(
      `${skipped.length} deleted document(s) kept their draft content in RepoPress because they changed during publishing; review those drafts before the next publish.`,
    )
  }
  const unreconciled = opMarkResult?.unreconciledOpIds ?? []
  if (unreconciled.length > 0) {
    details.push(
      `${unreconciled.length} staged operation(s) were undone while publishing even though the commit contains their changes; review the repository and re-stage or revert as needed.`,
    )
  }
  const unreconciledMedia = mediaMarkResult?.unreconciledMediaOpIds ?? []
  if (unreconciledMedia.length > 0) {
    details.push(
      `${unreconciledMedia.length} staged media upload(s) were undone while publishing even though the commit contains them; review the repository media and re-stage or revert as needed.`,
    )
  }
  if (details.length === 0) return undefined
  return `Commit ${commitSha} succeeded, but ${details.join(" Also: ")}`
}

/**
 * Idempotent PR ensure for a publish lane: try to create, and after ANY
 * uncertain creation outcome look up the open PR that actually exists for
 * this head/base pair and adopt it. Only when neither works does the caller
 * get a warning instead of a PR number.
 */
async function ensureLanePullRequest({
  token,
  owner,
  repo,
  branchName,
  baseBranch,
  prTitle,
  prBody,
}: {
  token: string
  owner: string
  repo: string
  branchName: string
  baseBranch: string
  prTitle: string
  prBody: string
}): Promise<{ prNumber?: number; prUrl?: string; warning?: string }> {
  try {
    const pr = await createPullRequest(token, owner, repo, branchName, baseBranch, prTitle, prBody)
    return { prNumber: pr.number, prUrl: pr.htmlUrl }
  } catch (creationError) {
    console.error("PR creation uncertain; looking up existing lane PR:", creationError)
    try {
      const existing = await findOpenPublishLanePullRequest(token, owner, repo, branchName, baseBranch)
      if (existing) {
        return { prNumber: existing.number, prUrl: existing.htmlUrl }
      }
    } catch (lookupError) {
      console.error("Lane PR lookup failed after uncertain creation:", lookupError)
    }
    return {
      warning: `The commit succeeded, but opening the pull request for ${branchName} failed; open it manually from the publish lane.`,
    }
  }
}

const MAX_RECOVERY_ANCESTRY_DEPTH = 20

/**
 * Reconcile each associated document against the exact landed commit using
 * TYPED reads: a GitHub failure throws (counted), and an absent associated
 * file is ALSO counted as a failure - every association was planned to
 * exist at the landed commit, so absence is an anomaly, not success.
 * Callers must keep the attempt un-reconciled when failedCount > 0 so a
 * retry can finish the sync without committing again. On success the
 * document records lane-synchronization provenance (markPublishedSnapshot)
 * and becomes clean unless it was edited during the publish.
 */
async function refreshDocumentShasAtCommit({
  convex,
  token,
  owner,
  repo,
  authorityBranch,
  publishBranchId,
  publishAttemptId,
  commitSha,
  documentAssociations,
  actingUserId,
  projectAccessToken,
}: {
  convex: ConvexHttpClient
  token: string
  owner: string
  repo: string
  authorityBranch: string
  publishBranchId: Id<"publishBranches">
  publishAttemptId: Id<"publishAttempts">
  commitSha: string
  documentAssociations: Array<{
    documentId: Id<"documents">
    repoPath: string
    expectedUpdatedAt: number
    contentRevision?: string
    contentVersion?: number
  }>
  actingUserId?: string
  projectAccessToken?: string
}): Promise<{ failedCount: number }> {
  let failedCount = 0
  for (const { documentId, repoPath, expectedUpdatedAt, contentRevision, contentVersion } of documentAssociations) {
    try {
      const fileAtCommit = await getFileForPublish(token, owner, repo, repoPath, commitSha)
      if (fileAtCommit.status === "absent") {
        failedCount += 1
        console.error("Document SHA refresh found no file at the landed commit:", { documentId, repoPath, commitSha })
        continue
      }
      await convex.mutation(api.documents.markPublishedSnapshot, {
        id: documentId,
        githubSha: fileAtCommit.file.sha,
        authorityKind: "lane",
        authorityBranch,
        publishBranchId,
        publishAttemptId,
        commitSha,
        repoPath,
        contentRevision,
        publishedContentVersion: contentVersion,
        expectedUpdatedAt,
        userId: actingUserId,
        projectAccessToken,
      })
    } catch (error) {
      failedCount += 1
      console.error("Document SHA refresh failed:", { documentId, repoPath, error })
    }
  }
  return { failedCount }
}

type RecoverablePublishAttempt = {
  _id: Id<"publishAttempts">
  projectId: Id<"projects">
  publishBranchId: Id<"publishBranches">
  branchName: string
  expectedHeadSha: string
  planDigest: string
  operationDescriptors?: PublishOperationDescriptor[]
  operationPaths: string[]
  opIds: Id<"explorerOps">[]
  mediaAssociations: Array<{ mediaOpId: Id<"mediaOps">; repoPath: string; expectedUpdatedAt: number }>
  documentAssociations: Array<{
    documentId: Id<"documents">
    repoPath: string
    expectedUpdatedAt: number
    contentRevision?: string
    contentVersion?: number
  }>
  deleteAssociations: Array<{ opId: Id<"explorerOps">; documentId: Id<"documents">; expectedUpdatedAt: number }>
  // getActiveForProject also keeps durable cleanup active until its bounded
  // continuation reaches a terminal state.
  status: "committing" | "committed" | "reconciled" | "cleanup_pending" | "cleaned" | "superseded"
  commitSha?: string
}

/**
 * Recover a publish attempt stranded at the commit boundary.
 *
 * The attempt's OWN lane (by publishBranchId) is the recovery target - never
 * the request's current lane. Proof of landing walks the lane's linear
 * first-parent ancestry from the head back toward the attempt's expected
 * head, looking for the plan-digest trailer; superseding happens ONLY when
 * non-landing is proven (the walk reaches the expected head through
 * single-parent commits without finding the trailer). Merge commits, a
 * deleted branch, or an exhausted depth bound make landing unprovable and
 * fail CLOSED - no supersede, no new commit.
 */
export async function recoverPublishAttempt({
  convex,
  attempt,
  projectId,
  token,
  owner,
  repo,
  title,
  description,
  serverQueryToken,
  actingUserId,
  projectAccessToken,
}: {
  convex: ConvexHttpClient
  attempt: RecoverablePublishAttempt
  projectId: Id<"projects">
  token: string
  owner: string
  repo: string
  title?: string
  description?: string
  serverQueryToken: string
  actingUserId?: string
  projectAccessToken?: string
}): Promise<{ handled: true; response: NextResponse } | { handled: false; stagedStateStale?: boolean }> {
  const auth = { userId: actingUserId, projectAccessToken }

  if (attempt.status === "cleaned" || attempt.status === "superseded") return { handled: false }

  if (attempt.status === "cleanup_pending") {
    await convex.mutation(api.publishAttempts.resumeCleanup, {
      id: attempt._id,
      serverQueryToken,
      ...auth,
    })
    return {
      handled: true,
      response: NextResponse.json(
        { ok: false, error: "A previous publish is still finishing durable cleanup. Retry shortly." },
        { status: 409 },
      ),
    }
  }

  // Validate the attempt's lane reference before trusting anything else.
  const lane = await convex.query(api.publishBranches.getById, { id: attempt.publishBranchId, ...auth })
  if (
    attempt.projectId !== projectId ||
    !lane ||
    lane.projectId !== projectId ||
    lane.branchName !== attempt.branchName
  ) {
    console.error("Publish attempt state is inconsistent", {
      attemptId: attempt._id,
      attemptProjectId: attempt.projectId,
      laneFound: Boolean(lane),
    })
    return {
      handled: true,
      response: NextResponse.json(
        {
          ok: false,
          error:
            "A previous publish attempt references a lane that no longer matches this project. Manual review is required before publishing again.",
        },
        { status: 500 },
      ),
    }
  }

  // A merged PR's immutable final commit tree is the sole authority. This
  // works for merge, squash, and rebase without enumerating a capped PR
  // commit list, and it never fabricates an original attempt commit SHA.
  if (lane.status === "merged") {
    const mergeCommitSha = lane.mergeCommitSha
    if (!mergeCommitSha || !/^[0-9a-f]{40}$/.test(mergeCommitSha) || lane.mergeVerificationState !== "pending") {
      return {
        handled: true,
        response: NextResponse.json(
          {
            ok: false,
            error: `Publish lane ${attempt.branchName} is merged but has no pending immutable merge authority. Backfill or repair the lane authority before publishing again.`,
          },
          { status: 409 },
        ),
      }
    }
    if (!attempt.operationDescriptors?.length) {
      return {
        handled: true,
        response: NextResponse.json(
          {
            ok: false,
            error: "This merged publish attempt predates exact Git descriptors and requires manual review.",
          },
          { status: 409 },
        ),
      }
    }
    try {
      const inspectedOutcomes = await inspectPublishEffectsAtCommit(
        token,
        owner,
        repo,
        mergeCommitSha,
        attempt.operationDescriptors,
      )
      // A restored path's blob is not evidence for this attempt, but it is
      // the verified final-tree baseline for the next publish. Preserve it
      // so cleanup can reset the document's optimistic-lock SHA.
      const pathOutcomes = inspectedOutcomes
      await convex.mutation(api.publishAttempts.resolveAndEnqueueCleanup, {
        id: attempt._id,
        authoritySha: mergeCommitSha,
        pathOutcomes,
        serverQueryToken,
        ...auth,
      })
      return {
        handled: true,
        response: NextResponse.json({
          ok: true,
          recovered: true,
          cleanupPending: true,
          mergeCommitSha,
          summary: "verified merged publish against immutable Git tree",
          warning: "Merge verification succeeded; bounded attempt cleanup is finishing in the background.",
        }),
      }
    } catch (error) {
      if (error instanceof GitHubReadError) {
        console.error("Merged-lane recovery read failed:", error)
        return {
          handled: true,
          response: NextResponse.json(
            { ok: false, error: `Publish recovery aborted: ${error.message}. Retry once GitHub reads succeed.` },
            { status: 502 },
          ),
        }
      }
      throw error
    }
  }

  if (lane.status === "closed") {
    if (attempt.status === "committing") {
      await convex.mutation(api.publishAttempts.supersedeClosedPending, {
        id: attempt._id,
        serverQueryToken,
        ...auth,
      })
      return { handled: false, stagedStateStale: true }
    }
    if (!attempt.operationDescriptors?.length) {
      return {
        handled: true,
        response: NextResponse.json(
          {
            ok: false,
            error: "This closed publish attempt predates exact Git descriptors and requires manual review.",
          },
          { status: 409 },
        ),
      }
    }
    try {
      const baseHead = await getBranchHeadForPublish(token, owner, repo, lane.baseBranch)
      if (baseHead.status === "absent") {
        return {
          handled: true,
          response: NextResponse.json(
            { ok: false, error: `Closed-lane recovery cannot find base branch ${lane.baseBranch}.` },
            { status: 502 },
          ),
        }
      }
      const baseOutcomes = await inspectPublishEffectsAtCommit(
        token,
        owner,
        repo,
        baseHead.sha,
        attempt.operationDescriptors,
      )
      await convex.mutation(api.publishAttempts.resolveAndEnqueueCleanup, {
        id: attempt._id,
        authoritySha: baseHead.sha,
        pathOutcomes: baseOutcomes.map((outcome) => ({
          path: outcome.path,
          disposition: "restore" as const,
          ...(outcome.finalBlobSha ? { finalBlobSha: outcome.finalBlobSha } : {}),
        })),
        serverQueryToken,
        ...auth,
      })
    } catch (error) {
      if (error instanceof GitHubReadError) {
        return {
          handled: true,
          response: NextResponse.json(
            { ok: false, error: `Closed-lane recovery aborted: ${error.message}` },
            { status: 502 },
          ),
        }
      }
      throw error
    }
    return {
      handled: true,
      response: NextResponse.json({
        ok: true,
        recovered: true,
        cleanupPending: true,
        summary: "restoring a publish excluded by a closed pull request",
        warning: "The pull request closed without merging; bounded attempt cleanup is restoring its staged work.",
      }),
    }
  }

  let commitSha = attempt.status === "committed" ? (attempt.commitSha ?? null) : null

  try {
    if (!commitSha) {
      const head = await getBranchHeadForPublish(token, owner, repo, attempt.branchName)
      if (head.status === "absent") {
        // The lane branch is gone. The attempt's commit may have landed and
        // the branch been merged/deleted afterwards - non-landing is NOT
        // proven, so fail closed instead of superseding.
        return {
          handled: true,
          response: NextResponse.json(
            {
              ok: false,
              error: `Publish lane branch ${attempt.branchName} no longer exists while a publish attempt is unresolved. Cannot prove whether its commit landed; resolve the lane manually before publishing again.`,
            },
            { status: 409 },
          ),
        }
      }

      // Walk linear first-parent ancestry looking for the attempt trailer.
      let cursor: string = head.sha
      let provenNotLanded = false
      let unprovableReason: string | null = null
      for (let depth = 0; depth <= MAX_RECOVERY_ANCESTRY_DEPTH; depth += 1) {
        if (cursor === attempt.expectedHeadSha) {
          // Reached the expected head through single-parent commits without
          // finding the trailer: the commit provably never landed.
          provenNotLanded = true
          break
        }
        if (depth === MAX_RECOVERY_ANCESTRY_DEPTH) {
          unprovableReason = "ancestry depth bound reached"
          break
        }
        const details = await getCommitDetailsForPublish(token, owner, repo, cursor)
        if (commitMessageCarriesAttempt(details.message, attempt.planDigest)) {
          // A candidate is accepted ONLY as the single-parent direct child of
          // the attempt's expected head. A trailer anywhere else means
          // someone reused the digest on a commit our CAS could not have
          // produced - unprovable, never adopted.
          if (details.parents.length === 1 && details.parents[0] === attempt.expectedHeadSha) {
            if (!attempt.operationDescriptors?.length) {
              unprovableReason = "attempt predates durable Git operation descriptors"
            } else {
              const treeMatches = await verifyPublishAttemptCommitForPublish(
                token,
                owner,
                repo,
                attempt.expectedHeadSha,
                cursor,
                attempt.operationDescriptors,
              )
              if (treeMatches) commitSha = cursor
              else unprovableReason = "attempt trailer matched but its Git tree did not"
            }
          } else {
            unprovableReason = "attempt trailer found on a commit that is not the direct child of the expected head"
          }
          break
        }
        if (details.parents.length !== 1) {
          // A merge (or root) commit breaks the linear proof; the attempt's
          // commit could hide on another parent path.
          unprovableReason = "non-linear history between the lane head and the attempt's expected head"
          break
        }
        cursor = details.parents[0]
      }

      if (!commitSha && !provenNotLanded) {
        return {
          handled: true,
          response: NextResponse.json(
            {
              ok: false,
              error: `Cannot prove whether the interrupted publish on ${attempt.branchName} landed (${unprovableReason ?? "unknown"}). Resolve the lane manually before publishing again.`,
            },
            { status: 409 },
          ),
        }
      }

      if (provenNotLanded || !commitSha) {
        // provenNotLanded is the only way to reach here without a commitSha
        // (the unprovable case returned above); the extra check narrows the
        // type and guards the invariant.
        await convex.mutation(api.publishAttempts.supersede, {
          id: attempt._id,
          serverQueryToken,
          ...auth,
        })
        return { handled: false }
      }

      await convex.mutation(api.publishAttempts.recordCommit, {
        id: attempt._id,
        commitSha,
        serverQueryToken,
        ...auth,
      })
    }
  } catch (error) {
    if (error instanceof GitHubReadError) {
      console.error("Publish recovery read failed:", error)
      return {
        handled: true,
        response: NextResponse.json(
          { ok: false, error: `Publish recovery aborted: ${error.message}. Retry once GitHub reads succeed.` },
          { status: 502 },
        ),
      }
    }
    throw error
  }

  if (!commitSha) {
    // Unreachable: every branch above either set commitSha or returned.
    throw new Error("Publish recovery reached reconciliation without a commit SHA")
  }

  // The commit is real - reconcile Convex state on the ATTEMPT's lane
  // without committing again.
  let warning: string | undefined
  let prNumber = lane.prNumber
  let prUrl = lane.prUrl

  // Never try to open a pull request for a finished lane - its PR life is
  // over and the branch may already be deleted.
  if (!prNumber) {
    const ensured = await ensureLanePullRequest({
      token,
      owner,
      repo,
      branchName: attempt.branchName,
      // The lane's stored base is authoritative - the project's current
      // branch setting may have changed since the lane was created.
      baseBranch: lane.baseBranch,
      prTitle: title || "Content update via RepoPress (recovered publish)",
      prBody: description || "Automated content update from RepoPress (recovered after an interrupted publish).",
    })
    prNumber = ensured.prNumber
    prUrl = ensured.prUrl
    if (ensured.warning) {
      warning = ensured.warning
    }
  }

  await convex.mutation(api.publishBranches.updateAfterCommit, {
    id: attempt.publishBranchId,
    userId: actingUserId,
    projectAccessToken,
    prNumber,
    prUrl,
    lastCommitSha: commitSha,
    newFilePaths: attempt.operationPaths,
  })

  let opMarkResult: { skippedDeleteAssociations?: unknown[]; unreconciledOpIds?: unknown[] } | undefined
  if (attempt.opIds.length > 0) {
    opMarkResult = await convex.mutation(api.explorerOps.markCommitted, {
      ids: attempt.opIds,
      deleteAssociations: attempt.deleteAssociations,
      commitSha,
      publishBranchId: attempt.publishBranchId,
      publishAttemptId: attempt._id,
      userId: actingUserId,
      projectAccessToken,
    })
  }

  let mediaMarkResult: { unreconciledMediaOpIds?: unknown[] } | undefined
  if (attempt.mediaAssociations.length > 0) {
    mediaMarkResult = await convex.mutation(api.mediaOps.markCommitted, {
      ids: attempt.mediaAssociations.map((association) => association.mediaOpId),
      commitSha,
      publishBranchId: attempt.publishBranchId,
      publishAttemptId: attempt._id,
      userId: actingUserId,
      projectAccessToken,
    })
  }
  const reconciliationWarning = describeReconciliationWarnings(commitSha, opMarkResult, mediaMarkResult)
  if (reconciliationWarning) {
    warning = warning ? `${warning} ${reconciliationWarning}` : reconciliationWarning
  }

  // Refresh document SHAs at the exact landed commit from the durable
  // associations - same behavior as normal completion, and equally
  // retryable: failures keep the attempt "committed" so the next request
  // re-enters recovery (never committing again).
  const refresh = await refreshDocumentShasAtCommit({
    convex,
    token,
    owner,
    repo,
    authorityBranch: attempt.branchName,
    publishBranchId: attempt.publishBranchId,
    publishAttemptId: attempt._id,
    commitSha,
    documentAssociations: attempt.documentAssociations,
    actingUserId,
    projectAccessToken,
  })

  let reconciliationIncomplete = false
  if (refresh.failedCount > 0) {
    reconciliationIncomplete = true
    const refreshWarning = `${refresh.failedCount} document(s) could not sync their GitHub state after commit ${commitSha}; publish again to finish reconciliation (no new commit will be created).`
    warning = warning ? `${warning} ${refreshWarning}` : refreshWarning
  } else {
    await convex.mutation(api.publishAttempts.markReconciled, {
      id: attempt._id,
      serverQueryToken,
      ...auth,
    })
  }

  const note =
    "Recovered a previous publish attempt without committing again. Review remaining staged changes and publish again if needed."
  return {
    handled: true,
    response: NextResponse.json({
      ok: true,
      recovered: true,
      reconciliationIncomplete: reconciliationIncomplete || undefined,
      commitSha,
      prUrl,
      prNumber,
      summary: "recovered previous publish",
      warning: warning ? `${warning} ${note}` : note,
    }),
  }
}

async function createAvailablePublishBranch({
  token,
  owner,
  repo,
  baseSha,
  scope,
  existingBranchNames,
}: {
  token: string
  owner: string
  repo: string
  baseSha: string
  scope: string
  existingBranchNames: string[]
}) {
  const takenBranchNames = new Set(existingBranchNames)

  // Try pretty ordinal names first (repopress/scope, repopress/scope-2, ...)
  for (let ordinal = 1; ordinal <= 50; ordinal += 1) {
    const candidate = buildPublishBranchName(scope, ordinal)
    if (takenBranchNames.has(candidate)) continue

    const alreadyExists = await branchExists(token, owner, repo, candidate)
    if (alreadyExists) {
      takenBranchNames.add(candidate)
      continue
    }

    try {
      await createPublishBranchFromSha(token, owner, repo, candidate, baseSha)
      return candidate
    } catch (error) {
      if (isGitHubBranchExistsError(error)) {
        takenBranchNames.add(candidate)
        continue
      }
      throw error
    }
  }

  // Fallback: use a timestamp suffix to guarantee a unique name
  const timestamp = Date.now()
  const fallback = `repopress/${scope}-t${timestamp}`
  try {
    await createPublishBranchFromSha(token, owner, repo, fallback, baseSha)
    return fallback
  } catch (error) {
    if (isGitHubBranchExistsError(error)) {
      throw new Error(`Failed to allocate a publish branch name for scope "${scope}" (timestamp collision)`)
    }
    throw error
  }
}

function isGitHubBranchExistsError(error: unknown) {
  if (error instanceof Error && /already exists/i.test(error.message)) return true
  return typeof error === "object" && error !== null && "status" in error && error.status === 422
}

async function cleanupOrphanedPublishBranch({
  token,
  owner,
  repo,
  branchName,
}: {
  token: string
  owner: string
  repo: string
  branchName: string
}) {
  try {
    const octokit = createGitHubClient(token)
    await octokit.git.deleteRef({
      owner,
      repo,
      ref: `heads/${branchName}`,
    })
  } catch (cleanupError) {
    console.error("Failed to clean up orphaned publish branch after conflict:", cleanupError)
  }
}

async function buildMediaBatchOperations({
  convex,
  projectId,
  queryAuth,
  token,
  owner,
  repo,
  authorityBranch,
  pendingMediaOps,
  prefetchResults,
  conflicts,
}: {
  convex: ConvexHttpClient
  projectId: Id<"projects">
  queryAuth: { userId?: string; projectAccessToken?: string }
  token: string
  owner: string
  repo: string
  authorityBranch: string
  pendingMediaOps: Array<any>
  prefetchResults: Map<string, PublishFileReadResult>
  conflicts: Array<{ path: string; reason: string }>
}): Promise<BatchOperation[]> {
  const operations: BatchOperation[] = []

  for (const mediaOp of pendingMediaOps) {
    const normalizedPath = canonicalGitPathFromUrlPath(mediaOp.repoPath)
    const baseVersion = prefetchResults.get(`media:${normalizedPath}`)
    const baseVersionSha = baseVersion?.status === "found" ? baseVersion.file.sha : null
    const expectedBaseSha = mediaOp.githubSha ?? null

    if (expectedBaseSha) {
      if (!baseVersionSha || baseVersionSha !== expectedBaseSha) {
        conflicts.push({
          path: mediaOp.repoPath,
          reason: `Media has changed on ${authorityBranch} since staging (expected sha: ${expectedBaseSha}, current: ${baseVersionSha ?? "missing"})`,
        })
        continue
      }
    } else if (baseVersionSha) {
      conflicts.push({
        path: mediaOp.repoPath,
        reason: `Media already exists on ${authorityBranch}; re-upload to stage an update instead of a create.`,
      })
      continue
    }

    const action: "create" | "update" = expectedBaseSha ? "update" : "create"

    if (mediaOp.sourceType === "convex") {
      if (!mediaOp.convexStorageId) {
        conflicts.push({
          path: mediaOp.repoPath,
          reason: "Missing Convex storage ID for media operation.",
        })
        continue
      }

      const bytes = await fetchConvexStorageBytes({
        convex,
        projectId,
        repoPath: mediaOp.repoPath,
        queryAuth,
      })
      operations.push({
        path: normalizedPath,
        action,
        contentEncoding: "base64",
        content: bytes.toString("base64"),
      })
      continue
    }

    if (mediaOp.sourceType === "blob") {
      if (!mediaOp.blobUrl) {
        conflicts.push({
          path: mediaOp.repoPath,
          reason: "Missing staged Blob URL for media operation.",
        })
        continue
      }

      const bytes = await fetchBlobBytes(mediaOp.blobUrl)
      operations.push({
        path: normalizedPath,
        action,
        contentEncoding: "base64",
        content: bytes.toString("base64"),
      })
      continue
    }

    if (mediaOp.sourceType === "githubBranch") {
      if (!mediaOp.githubPath || !mediaOp.githubBranch) {
        conflicts.push({
          path: mediaOp.repoPath,
          reason: "Missing staged GitHub branch metadata for media operation.",
        })
        continue
      }

      const bytes = await fetchGitHubBytes({
        token,
        owner,
        repo,
        path: mediaOp.githubPath,
        branch: mediaOp.githubBranch,
      })

      operations.push({
        path: normalizedPath,
        action,
        contentEncoding: "base64",
        content: bytes.toString("base64"),
      })
    }
  }

  return operations
}

async function fetchBlobBytes(blobUrl: string): Promise<Buffer> {
  const headers: Record<string, string> = {}
  const blobToken = process.env.BLOB_READ_WRITE_TOKEN || process.env.VERCEL_BLOB_API_TOKEN
  if (blobToken) {
    headers.Authorization = `Bearer ${blobToken}`
  }

  const response = await fetch(blobUrl, {
    headers,
    cache: "no-store",
  })

  if (!response.ok) {
    throw new Error(`Failed to fetch staged Blob media (${response.status})`)
  }

  return Buffer.from(await response.arrayBuffer())
}

async function fetchGitHubBytes({
  token,
  owner,
  repo,
  path,
  branch,
}: {
  token: string
  owner: string
  repo: string
  path: string
  branch: string
}) {
  const octokit = createGitHubClient(token)
  const { data } = await octokit.repos.getContent({
    owner,
    repo,
    path,
    ref: branch,
  })

  if (Array.isArray(data)) {
    throw new Error(`Expected file for media path ${path}, received directory.`)
  }

  let base64 = "content" in data && typeof data.content === "string" ? data.content : ""
  if (!base64 && data.sha) {
    const blob = await octokit.git.getBlob({
      owner,
      repo,
      file_sha: data.sha,
    })
    base64 = blob.data.content || ""
  }

  if (!base64) {
    throw new Error(`No content returned for staged media path ${path}.`)
  }

  return Buffer.from(base64, "base64")
}

async function fetchConvexStorageBytes({
  convex,
  projectId,
  repoPath,
  queryAuth,
}: {
  convex: ConvexHttpClient
  projectId: Id<"projects">
  repoPath: string
  queryAuth: { userId?: string; projectAccessToken?: string }
}): Promise<Buffer> {
  const storageUrl = await convex.query(api.mediaOps.getConvexStorageUrl, {
    projectId,
    repoPath,
    ...queryAuth,
  })
  if (!storageUrl) {
    throw new Error(`No Convex storage URL returned for media path ${repoPath}`)
  }

  const response = await fetch(storageUrl, { cache: "no-store" })
  if (!response.ok) {
    throw new Error(`Failed to fetch Convex storage file (${response.status}): ${repoPath}`)
  }

  return Buffer.from(await response.arrayBuffer())
}

/**
 * Rewrite any /api/media/resolve proxy URLs in frontmatter values to root-relative paths.
 * Extracts the `path` query param and strips the `/public` prefix (since frameworks serve `public/` at root).
 * Only string values matching isStudioMediaResolveUrl() are modified - all other values pass through unchanged.
 */
function rewriteProxyUrls(frontmatter: Record<string, unknown>): Record<string, unknown> {
  const rewritten: Record<string, unknown> = {}

  for (const [key, value] of Object.entries(frontmatter)) {
    if (typeof value === "string" && isStudioMediaResolveUrl(value)) {
      rewritten[key] = proxyUrlToRootRelative(value)
    } else if (Array.isArray(value)) {
      rewritten[key] = value.map((item) =>
        typeof item === "string" && isStudioMediaResolveUrl(item) ? proxyUrlToRootRelative(item) : item,
      )
    } else if (value !== null && typeof value === "object") {
      rewritten[key] = rewriteProxyUrls(value as Record<string, unknown>)
    } else {
      rewritten[key] = value
    }
  }

  return rewritten
}

function proxyUrlToRootRelative(proxyUrl: string): string {
  try {
    // Parse the proxy URL - it may be relative so we use a dummy base.
    const parsed = new URL(proxyUrl, "http://localhost")
    const rawPath = parsed.searchParams.get("path")
    if (!rawPath) return proxyUrl

    // Strip the leading /public prefix so the path becomes root-relative for frameworks.
    // e.g. /public/images/blog/cover.jpg → /images/blog/cover.jpg
    const withoutPublic = rawPath.replace(/^\/public\//, "/")
    return withoutPublic
  } catch {
    return proxyUrl
  }
}
