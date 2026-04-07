import { ConvexHttpClient } from "convex/browser"
import matter from "gray-matter"
import { NextResponse } from "next/server"
import { api } from "@/convex/_generated/api"
import type { Id } from "@/convex/_generated/dataModel"
import { prefixContentRoot } from "@/lib/explorer-tree-overlay"
import type { BatchOperation } from "@/lib/github"
import { batchCommit, createBranch, createGitHubClient, createPullRequest, getFile } from "@/lib/github"
import { mintServerQueryToken } from "@/lib/project-access-token"
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
    const [pendingOps, dirtyDocs, pendingMediaOps] = await Promise.all([
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
        const rawFrontmatter = doc ? doc.frontmatter || {} : op.initialFrontmatter || {}
        const rawBody = doc ? doc.body || "" : op.initialBody || ""
        const fileContent = matter.stringify(rawBody, rewriteProxyUrls(rawFrontmatter))

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

      const fileContent = matter.stringify(doc.body || "", rewriteProxyUrls(doc.frontmatter || {}))
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
      convex,
      projectId: project._id,
      queryAuth,
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
      const operationPaths = new Set(operations.map((op) => op.path))
      const overlaps = openPublishBranches.flatMap((branch) =>
        branch._id === publishBranch?._id || branch.status === "inactive"
          ? []
          : (branch.committedFilePaths ?? [])
              .filter((path) => operationPaths.has(path))
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

    // If no active branch exists, create a new publish branch with timestamp-based name.
    // Branch naming: repopress/${baseBranch}/${timestamp} e.g., repopress/main/1710681600000
    const branchName = publishBranch?.branchName || `repopress/${baseBranch}/${Date.now()}`

    if (!publishBranch) {
      await createBranch(token, owner, repo, baseBranch, branchName)
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

    // PR creation: Only create a new PR if one doesn't exist for this branch.
    // When the PR already exists (prNumber is set), we skip PR creation and just push commits.
    // This is intentional - additional publishes will update the same PR with new commits.
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
      userId: actingUserId,
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
        publishBranchId: publishBranch._id,
        userId: actingUserId,
        projectAccessToken,
      })
    }

    if (pendingMediaOps.length > 0) {
      await convex.mutation(api.mediaOps.markCommitted, {
        ids: pendingMediaOps.map((op) => op._id),
        commitSha,
        publishBranchId: publishBranch._id,
        userId: actingUserId,
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
          userId: actingUserId,
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
      publishModeUsed,
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

function isActivePublishBranchConflict(error: unknown) {
  return error instanceof Error && error.message.includes(ACTIVE_PUBLISH_BRANCH_CONFLICT_MESSAGE)
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

function normalizeMediaPath(repoPath: string) {
  return repoPath.replace(/^\/+/, "")
}

async function buildMediaBatchOperations({
  convex,
  projectId,
  queryAuth,
  token,
  owner,
  repo,
  baseBranch,
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
 * Only string values matching isStudioMediaResolveUrl() are modified — all other values pass through unchanged.
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
    // Parse the proxy URL — it may be relative so we use a dummy base.
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
