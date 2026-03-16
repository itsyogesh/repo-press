import { ConvexHttpClient } from "convex/browser"
import matter from "gray-matter"
import { NextResponse } from "next/server"
import { api } from "@/convex/_generated/api"
import type { Id } from "@/convex/_generated/dataModel"
import { fetchAuthQuery, getGitHubToken, getPatAuthUserId } from "@/lib/auth-server"
import { prefixContentRoot } from "@/lib/explorer-tree-overlay"
import type { BatchOperation } from "@/lib/github"
import { batchCommit, createBranch, createGitHubClient, createPullRequest, getFile } from "@/lib/github"
import { mintProjectAccessToken } from "@/lib/project-access-token"

const convex = new ConvexHttpClient(process.env.NEXT_PUBLIC_CONVEX_URL!)

export async function POST(request: Request) {
  const token = await getGitHubToken()
  if (!token) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  try {
    const body = await request.json()
    const { projectId, title, description } = body as {
      projectId: string
      title?: string
      description?: string
    }

    if (!projectId) {
      return NextResponse.json({ error: "Missing projectId" }, { status: 400 })
    }

    const project = await convex.query(api.projects.get, {
      id: projectId as Id<"projects">,
    })
    if (!project) {
      return NextResponse.json({ error: "Project not found" }, { status: 404 })
    }

    const oauthUserId = await resolveActingUserId()
    const patUserId = !oauthUserId ? await getPatAuthUserId(token) : null
    const actingUserId = oauthUserId ?? patUserId
    const hasAccess = await verifyProjectAccess(project, actingUserId)
    if (!hasAccess) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 403 })
    }
    const projectAccessToken = actingUserId
      ? await mintProjectAccessToken({
          projectId: project._id,
          userId: actingUserId,
          repoOwner: project.repoOwner,
          repoName: project.repoName,
          branch: project.branch,
        })
      : undefined

    const { repoOwner: owner, repoName: repo, branch: baseBranch, contentRoot } = project

    const [pendingOps, dirtyDocs, pendingMediaOps] = await Promise.all([
      convex.query(api.explorerOps.listPending, {
        projectId: project._id,
        userId: actingUserId ?? undefined,
        projectAccessToken,
      }),
      convex.query(api.documents.listDirtyForProject, {
        projectId: project._id,
        userId: actingUserId ?? undefined,
        projectAccessToken,
      }),
      convex.query(api.mediaOps.listPending, {
        projectId: project._id,
        userId: actingUserId ?? undefined,
        projectAccessToken,
      }),
    ])

    if (pendingOps.length === 0 && dirtyDocs.length === 0 && pendingMediaOps.length === 0) {
      return NextResponse.json({ error: "No pending changes to publish" }, { status: 400 })
    }

    const createOpPaths = new Set(pendingOps.filter((op) => op.opType === "create").map((op) => op.filePath))
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
      if (!doc.githubSha) continue
      const fullPath = prefixContentRoot(doc.filePath, contentRoot)
      pathsToFetch.push({ key: `doc:${doc.filePath}`, fullPath })
    }

    for (const mediaOp of pendingMediaOps) {
      const normalizedPath = normalizeMediaPath(mediaOp.repoPath)
      pathsToFetch.push({
        key: `media:${normalizedPath}`,
        fullPath: normalizedPath,
      })
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
          contentEncoding: "utf-8",
          action: "create",
        })
        continue
      }

      if (op.opType === "delete") {
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
        contentEncoding: "utf-8",
        action: "update",
      })
    }

    const contentCreateCount = operations.filter((o) => o.action === "create").length
    const contentUpdateCount = operations.filter((o) => o.action === "update").length
    const contentDeleteCount = operations.filter((o) => o.action === "delete").length

    const mediaBatchOps = await buildMediaBatchOperations({
      token,
      owner,
      repo,
      baseBranch,
      pendingMediaOps,
      prefetchResults,
      conflicts,
    })
    operations.push(...mediaBatchOps)

    if (conflicts.length > 0) {
      return NextResponse.json({ ok: false, conflicts }, { status: 409 })
    }

    if (operations.length === 0) {
      return NextResponse.json({ error: "No valid operations to publish" }, { status: 400 })
    }

    let publishBranch = await convex.query(api.publishBranches.getActiveForProject, {
      projectId: project._id,
    })

    const branchName = publishBranch?.branchName || `repopress/${baseBranch}/${Date.now()}`

    if (!publishBranch) {
      await createBranch(token, owner, repo, baseBranch, branchName)
      await convex.mutation(api.publishBranches.create, {
        projectId: project._id,
        userId: project.userId,
        projectAccessToken,
        branchName,
        baseBranch,
      })
      publishBranch = await convex.query(api.publishBranches.getActiveForProject, {
        projectId: project._id,
      })
      if (!publishBranch) {
        return NextResponse.json({ error: "Failed to create publish branch record" }, { status: 500 })
      }
    }

    const mediaCreateCount = mediaBatchOps.filter((o) => o.action === "create").length
    const mediaUpdateCount = mediaBatchOps.filter((o) => o.action === "update").length

    const parts: string[] = []
    if (contentCreateCount > 0) parts.push(`${contentCreateCount} created`)
    if (contentUpdateCount > 0) parts.push(`${contentUpdateCount} updated`)
    if (contentDeleteCount > 0) parts.push(`${contentDeleteCount} deleted`)
    if (mediaCreateCount > 0) parts.push(`${mediaCreateCount} media created`)
    if (mediaUpdateCount > 0) parts.push(`${mediaUpdateCount} media updated`)

    const commitMessage = `chore(content): ${parts.join(", ")} via RepoPress`
    const { commitSha } = await batchCommit(token, owner, repo, branchName, operations, commitMessage)

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

    await convex.mutation(api.publishBranches.updateAfterCommit, {
      id: publishBranch._id,
      userId: project.userId,
      projectAccessToken,
      prNumber,
      prUrl,
      lastCommitSha: commitSha,
      newFilePaths: operations.map((op) => op.path),
    })

    if (pendingOps.length > 0) {
      await convex.mutation(api.explorerOps.markCommitted, {
        ids: pendingOps.map((op) => op._id),
        commitSha,
        userId: project.userId,
        projectAccessToken,
      })
    }

    if (pendingMediaOps.length > 0) {
      await convex.mutation(api.mediaOps.markCommitted, {
        ids: pendingMediaOps.map((op) => op._id),
        commitSha,
        userId: project.userId,
        projectAccessToken,
      })
    }

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
          projectAccessToken,
          githubSha: blobSha,
        })
      } catch {
        // Non-critical: conflict detection may be stale for this file on next publish.
      }
    }

    return NextResponse.json({
      ok: true,
      prUrl,
      prNumber,
      commitSha,
      summary: parts.join(", "),
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

async function resolveActingUserId(): Promise<string | null> {
  if (fetchAuthQuery) {
    try {
      const authUser = await fetchAuthQuery(api.auth.getCurrentUser)
      if (authUser?._id) {
        return authUser._id as string
      }
    } catch {
      // Not an OAuth session
    }
  }
  return null
}

async function verifyProjectAccess(
  project: { userId: string; repoOwner: string; repoName: string },
  actingUserId: string | null,
): Promise<boolean> {
  return !!actingUserId && project.userId === actingUserId
}

function normalizeMediaPath(repoPath: string) {
  return repoPath.replace(/^\/+/, "")
}

async function buildMediaBatchOperations({
  token,
  owner,
  repo,
  baseBranch,
  pendingMediaOps,
  prefetchResults,
  conflicts,
}: {
  token: string
  owner: string
  repo: string
  baseBranch: string
  pendingMediaOps: Array<any>
  prefetchResults: Map<string, Awaited<ReturnType<typeof getFile>>>
  conflicts: Array<{ path: string; reason: string }>
}): Promise<BatchOperation[]> {
  const operations: BatchOperation[] = []

  for (const mediaOp of pendingMediaOps) {
    const normalizedPath = normalizeMediaPath(mediaOp.repoPath)
    const baseVersion = prefetchResults.get(`media:${normalizedPath}`)
    const expectedBaseSha = mediaOp.githubSha ?? null

    if (expectedBaseSha) {
      if (!baseVersion || baseVersion.sha !== expectedBaseSha) {
        conflicts.push({
          path: mediaOp.repoPath,
          reason: `Media has changed on ${baseBranch} since staging (expected sha: ${expectedBaseSha}, current: ${baseVersion?.sha ?? "missing"})`,
        })
        continue
      }
    } else if (baseVersion) {
      conflicts.push({
        path: mediaOp.repoPath,
        reason: `Media already exists on ${baseBranch}; re-upload to stage an update instead of a create.`,
      })
      continue
    }

    const action: "create" | "update" = expectedBaseSha ? "update" : "create"

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
