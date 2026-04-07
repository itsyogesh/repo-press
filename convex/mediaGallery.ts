import { v } from "convex/values"
import { api } from "./_generated/api"
import { action, mutation, query } from "./_generated/server"
import { resolveProjectAccess, resolveProjectReader } from "./lib/access"

const IMAGE_EXTENSIONS = new Set([".jpg", ".jpeg", ".png", ".gif", ".webp", ".svg", ".avif"])
const BATCH_SIZE = 5

function isImagePath(path: string): boolean {
  const lower = path.toLowerCase()
  const dot = lower.lastIndexOf(".")
  if (dot === -1) return false
  return IMAGE_EXTENSIONS.has(lower.slice(dot))
}

/** Check read access for the project. Used by the scanImagesFromGitHub action. */
export const checkAccessQuery = query({
  args: {
    projectId: v.id("projects"),
    userId: v.optional(v.string()),
    projectAccessToken: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const access = await resolveProjectReader(ctx, args)
    return access !== null
  },
})

/**
 * Upsert a GitHub-scanned image into mediaAssets.
 * Returns { wasInserted: true } for new records, { wasInserted: false } for updates.
 */
export const upsertScannedImage = mutation({
  args: {
    projectId: v.id("projects"),
    userId: v.optional(v.string()),
    projectAccessToken: v.optional(v.string()),
    fileName: v.string(),
    filePath: v.string(),
    githubSha: v.optional(v.string()),
    sizeBytes: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    await resolveProjectAccess(ctx, args, "editor")

    const now = Date.now()
    const existing = await ctx.db
      .query("mediaAssets")
      .withIndex("by_projectId_filePath", (q) => q.eq("projectId", args.projectId).eq("filePath", args.filePath))
      .first()

    if (existing) {
      await ctx.db.patch(existing._id, {
        fileName: args.fileName,
        githubSha: args.githubSha,
        sizeBytes: args.sizeBytes,
        updatedAt: now,
      })
      return { wasInserted: false }
    }

    await ctx.db.insert("mediaAssets", {
      projectId: args.projectId,
      fileName: args.fileName,
      filePath: args.filePath,
      githubSha: args.githubSha,
      sizeBytes: args.sizeBytes,
      createdAt: now,
      updatedAt: now,
    })
    return { wasInserted: true }
  },
})

/**
 * Scans the GitHub repo's full Git tree for image files and upserts them into
 * mediaAssets. Safe to call repeatedly — existing entries are updated, not duplicated.
 * Returns counts of images found, inserted, and updated.
 */
export const scanImagesFromGitHub = action({
  args: {
    projectId: v.id("projects"),
    owner: v.string(),
    repo: v.string(),
    branch: v.string(),
    githubToken: v.string(),
    userId: v.optional(v.string()),
    projectAccessToken: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const hasAccess = await ctx.runQuery(api.mediaGallery.checkAccessQuery, {
      projectId: args.projectId,
      userId: args.userId,
      projectAccessToken: args.projectAccessToken,
    })
    if (!hasAccess) throw new Error("Unauthorized")

    const treeUrl = `https://api.github.com/repos/${args.owner}/${args.repo}/git/trees/${encodeURIComponent(args.branch)}?recursive=1`
    const treeRes = await fetch(treeUrl, {
      headers: {
        Authorization: `token ${args.githubToken}`,
        Accept: "application/vnd.github.v3+json",
      },
    })

    if (!treeRes.ok) {
      const msg = await treeRes.text().catch(() => treeRes.statusText)
      throw new Error(`GitHub tree fetch failed (${treeRes.status}): ${msg}`)
    }

    const treeData = (await treeRes.json()) as {
      tree: Array<{ path: string; sha: string; type: string; size?: number }>
      truncated?: boolean
    }

    const imageFiles = treeData.tree.filter((item) => item.type === "blob" && isImagePath(item.path))

    let inserted = 0
    let updated = 0

    for (let i = 0; i < imageFiles.length; i += BATCH_SIZE) {
      const batch = imageFiles.slice(i, i + BATCH_SIZE)
      await Promise.all(
        batch.map(async (file) => {
          const fileName = file.path.split("/").pop() ?? file.path
          const result = await ctx.runMutation(api.mediaGallery.upsertScannedImage, {
            projectId: args.projectId,
            userId: args.userId,
            projectAccessToken: args.projectAccessToken,
            fileName,
            filePath: file.path,
            githubSha: file.sha,
            sizeBytes: file.size,
          })

          if (result.wasInserted) {
            inserted++
          } else {
            updated++
          }
        }),
      )
    }

    return {
      found: imageFiles.length,
      inserted,
      updated,
      truncated: treeData.truncated ?? false,
    }
  },
})
