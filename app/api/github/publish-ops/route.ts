import { ConvexHttpClient } from "convex/browser"
import matter from "gray-matter"
import { NextResponse } from "next/server"
import { api } from "@/convex/_generated/api"
import type { Id } from "@/convex/_generated/dataModel"
import { getGitHubToken } from "@/lib/auth-server"
import { prefixContentRoot } from "@/lib/explorer-tree-overlay"
import type { BatchOperation } from "@/lib/github"
import { batchCommit, createBranch, createPullRequest, getFile } from "@/lib/github"

const convex = new ConvexHttpClient(process.env.NEXT_PUBLIC_CONVEX_URL!)

export async function POST(request: Request) {
  const token = await getGitHubToken()
  if (!token) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  try {
    const body = await request.json()
    const { projectId, userId, title, description } = body as {
      projectId: string
      userId?: string
      title?: string
      description?: string
    }

    if (!projectId) {
      return NextResponse.json({ error: "Missing projectId" }, { status: 400 })
    }

    // ── Fetch project details ──────────────────────────────────────────
    const project = await convex.query(api.projects.get, {
      id: projectId as Id<"projects">,
    })
    if (!project) {
      return NextResponse.json({ error: "Project not found" }, { status: 404 })
    }

    // ── Verify ownership ───────────────────────────────────────────────
    if (!userId || project.userId !== userId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 403 })
    }

    const { repoOwner: owner, repoName: repo, branch: baseBranch, contentRoot } = project

    // ── Gather pending explorer ops + dirty documents ──────────────────
    const [pendingOps, dirtyDocs] = await Promise.all([
      convex.query(api.explorerOps.listPending, {
        projectId: projectId as Id<"projects">,
      }),
      convex.query(api.documents.listDirtyForProject, {
        projectId: projectId as Id<"projects">,
      }),
    ])

    if (pendingOps.length === 0 && dirtyDocs.length === 0) {
      return NextResponse.json({ error: "No pending changes to publish" }, { status: 400 })
    }

    // ── Pre-fetch all files needed for conflict detection in parallel ──
    const createOpPaths = new Set(pendingOps.filter((op) => op.opType === "create").map((op) => op.filePath))

    // Collect all paths that need a getFile check
    const pathsToFetch: { key: string; fullPath: string }[] = []

    for (const op of pendingOps) {
      const fullPath = prefixContentRoot(op.filePath, contentRoot)
      if (op.opType === "create") {
        pathsToFetch.push({ key: `op:${op.filePath}`, fullPath })
      } else if (op.opType === "delete" && op.previousSha) {
        pathsToFetch.push({ key: `op:${op.filePath}`, fullPath })
      }
    }

    for (const doc of dirtyDocs) {
      if (createOpPaths.has(doc.filePath)) continue
      if (doc.githubSha) {
        const fullPath = prefixContentRoot(doc.filePath, contentRoot)
        pathsToFetch.push({ key: `doc:${doc.filePath}`, fullPath })
      }
    }

    const prefetchResults = new Map<string, Awaited<ReturnType<typeof getFile>>>()
    const fetchResults = await Promise.all(
      pathsToFetch.map(async ({ key, fullPath }) => {
        const result = await getFile(token, owner, repo, fullPath, baseBranch)
        return { key, result }
      }),
    )
    for (const { key, result } of fetchResults) {
      prefetchResults.set(key, result)
    }

    // ── Build batch operations with conflict detection ─────────────────
    const operations: BatchOperation[] = []
    const conflicts: { path: string; reason: string }[] = []

    for (const op of pendingOps) {
      const fullPath = prefixContentRoot(op.filePath, contentRoot)

      if (op.opType === "create") {
        const existing = prefetchResults.get(`op:${op.filePath}`)
        if (existing) {
          conflicts.push({
            path: op.filePath,
            reason: `File already exists on ${baseBranch} (sha: ${existing.sha})`,
          })
          continue
        }

        const doc = dirtyDocs.find((d) => d.filePath === op.filePath)
        const fileContent = doc
          ? matter.stringify(doc.body || "", doc.frontmatter || {})
          : matter.stringify(op.initialBody || "", op.initialFrontmatter || {})

        operations.push({
          path: fullPath,
          content: fileContent,
          action: "create",
        })
      } else if (op.opType === "delete") {
        if (op.previousSha) {
          const existing = prefetchResults.get(`op:${op.filePath}`)
          if (existing && existing.sha !== op.previousSha) {
            conflicts.push({
              path: op.filePath,
              reason: `File has been modified since staging deletion (expected sha: ${op.previousSha}, current: ${existing.sha})`,
            })
            continue
          }
        }
        operations.push({ path: fullPath, action: "delete" })
      }
    }

    for (const doc of dirtyDocs) {
      if (createOpPaths.has(doc.filePath)) continue

      const fullPath = prefixContentRoot(doc.filePath, contentRoot)

      if (doc.githubSha) {
        const existing = prefetchResults.get(`doc:${doc.filePath}`)
        if (existing && existing.sha !== doc.githubSha) {
          conflicts.push({
            path: doc.filePath,
            reason: `File has been modified on GitHub since last sync (expected sha: ${doc.githubSha}, current: ${existing.sha})`,
          })
          continue
        }
      }

      const fileContent = matter.stringify(doc.body || "", doc.frontmatter || {})
      operations.push({
        path: fullPath,
        content: fileContent,
        action: "update",
      })
    }

    // ── Abort if any conflicts were detected ───────────────────────────
    if (conflicts.length > 0) {
      return NextResponse.json({ ok: false, conflicts }, { status: 409 })
    }

    if (operations.length === 0) {
      return NextResponse.json({ error: "No valid operations to publish" }, { status: 400 })
    }

    // ── Get or create the PR branch ────────────────────────────────────
    let publishBranch = await convex.query(api.publishBranches.getActiveForProject, {
      projectId: projectId as Id<"projects">,
    })

    const branchName = publishBranch?.branchName || `repopress/${baseBranch}/${Date.now()}`

    if (!publishBranch) {
      // Create branch on GitHub first, then record in Convex
      await createBranch(token, owner, repo, baseBranch, branchName)

      await convex.mutation(api.publishBranches.create, {
        projectId: projectId as Id<"projects">,
        branchName,
        baseBranch,
      })

      publishBranch = await convex.query(api.publishBranches.getActiveForProject, {
        projectId: projectId as Id<"projects">,
      })
      if (!publishBranch) {
        return NextResponse.json({ error: "Failed to create publish branch record" }, { status: 500 })
      }
    }

    // ── Build a descriptive commit message ─────────────────────────────
    const createCount = operations.filter((o) => o.action === "create").length
    const updateCount = operations.filter((o) => o.action === "update").length
    const deleteCount = operations.filter((o) => o.action === "delete").length
    const parts: string[] = []
    if (createCount > 0) parts.push(`${createCount} created`)
    if (updateCount > 0) parts.push(`${updateCount} updated`)
    if (deleteCount > 0) parts.push(`${deleteCount} deleted`)
    const commitMessage = `chore(content): ${parts.join(", ")} via RepoPress`

    // ── Push batch commit to PR branch ─────────────────────────────────
    const { commitSha } = await batchCommit(token, owner, repo, branchName, operations, commitMessage)

    // ── Create PR if this is the first push ────────────────────────────
    let prUrl = publishBranch.prUrl
    let prNumber = publishBranch.prNumber

    if (!prNumber) {
      const prTitle = title || `Content update via RepoPress (${parts.join(", ")})`
      const prBody =
        description || `Automated content update from RepoPress.\n\n${parts.map((p) => `- ${p}`).join("\n")}`

      const pr = await createPullRequest(token, owner, repo, branchName, baseBranch, prTitle, prBody)
      prNumber = pr.number
      prUrl = pr.htmlUrl
    }

    // ── Update Convex records ──────────────────────────────────────────
    const committedFilePaths = operations.map((op) => op.path)
    await convex.mutation(api.publishBranches.updateAfterCommit, {
      id: publishBranch._id,
      prNumber,
      prUrl,
      lastCommitSha: commitSha,
      newFilePaths: committedFilePaths,
    })

    if (pendingOps.length > 0) {
      await convex.mutation(api.explorerOps.markCommitted, {
        ids: pendingOps.map((op) => op._id),
        commitSha,
      })
    }

    // Update githubSha with actual blob SHAs from the PR branch (not the commit SHA).
    // Blob SHAs are content-addressed and match across branches, so conflict detection
    // against the base branch will still work correctly after the PR is merged.
    const docsToUpdateSha = dirtyDocs.filter((d) => !createOpPaths.has(d.filePath))
    const shaFetches = await Promise.all(
      docsToUpdateSha.map(async (doc) => {
        const fullPath = prefixContentRoot(doc.filePath, contentRoot)
        try {
          const fileOnBranch = await getFile(token, owner, repo, fullPath, branchName)
          return { doc, sha: fileOnBranch?.sha ?? null }
        } catch {
          return { doc, sha: null }
        }
      }),
    )

    for (const { doc, sha: blobSha } of shaFetches) {
      if (!blobSha) continue
      try {
        await convex.mutation(api.documents.update, {
          id: doc._id,
          userId: project.userId,
          githubSha: blobSha,
        })
      } catch {
        // Non-critical: conflict detection may be stale for this file on next publish
      }
    }

    return NextResponse.json({
      ok: true,
      prUrl,
      prNumber,
      commitSha,
      summary: parts.join(", "),
    })
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Failed to publish"
    console.error("Error in publish-ops:", error)
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
