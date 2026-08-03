import { v } from "convex/values"
import { assertContentPath } from "../lib/preview/path-policy"
import { internal } from "./_generated/api"
import { action, internalMutation } from "./_generated/server"
import {
  assertGitHubCommitSha,
  authorizeGitHubProjectActor,
  verifyGitHubProjectReadAccess,
} from "./lib/githubActionAccess"

const IMAGE_EXTENSIONS = new Set([".jpg", ".jpeg", ".png", ".gif", ".webp", ".svg", ".avif"])
const MAX_TREE_ENTRIES = 20_000
const MAX_IMAGE_FILES = 1_000
const MAX_TREE_PATH_BYTES = 1_024
const MAX_TREE_TOTAL_PATH_BYTES = 2 * 1_024 * 1_024
const MAX_IMAGE_SIZE_BYTES = 2 * 1_024 * 1_024 * 1_024
const TREE_ENTRY_TYPES = new Set(["blob", "tree", "commit"])
const utf8Encoder = new TextEncoder()

type NormalizedGalleryImage = Readonly<{
  fileName: string
  filePath: string
  githubSha: string
  sizeBytes?: number
}>

function isImagePath(path: string): boolean {
  const lower = path.toLowerCase()
  const dot = lower.lastIndexOf(".")
  if (dot === -1) return false
  return IMAGE_EXTENSIONS.has(lower.slice(dot))
}

function readOwnDataProperty(record: object, property: string, required: boolean): unknown {
  const descriptor = Object.getOwnPropertyDescriptor(record, property)
  if (!descriptor) {
    if (required) throw new Error("Invalid GitHub tree entry")
    return undefined
  }
  if (!("value" in descriptor)) throw new Error("Invalid GitHub tree entry")
  return descriptor.value
}

function normalizeGalleryTree(tree: unknown): readonly NormalizedGalleryImage[] {
  if (!Array.isArray(tree) || tree.length > MAX_TREE_ENTRIES) {
    throw new Error(`GitHub tree exceeds ${MAX_TREE_ENTRIES} entries`)
  }

  const seenPaths = new Set<string>()
  const images: NormalizedGalleryImage[] = []
  let totalPathBytes = 0

  for (let index = 0; index < tree.length; index++) {
    const entry = readOwnDataProperty(tree, String(index), true)
    if (entry === null || typeof entry !== "object" || Array.isArray(entry))
      throw new Error("Invalid GitHub tree entry")
    const prototype = Object.getPrototypeOf(entry)
    if (prototype !== Object.prototype && prototype !== null) throw new Error("Invalid GitHub tree entry")

    const pathValue = readOwnDataProperty(entry, "path", true)
    const shaValue = readOwnDataProperty(entry, "sha", true)
    const typeValue = readOwnDataProperty(entry, "type", true)
    if (typeof pathValue !== "string" || typeof shaValue !== "string" || typeof typeValue !== "string") {
      throw new Error("Invalid GitHub tree entry")
    }

    if (pathValue.length > MAX_TREE_PATH_BYTES) {
      throw new Error(`GitHub tree path exceeds ${MAX_TREE_PATH_BYTES} bytes`)
    }
    const rawPathBytes = utf8Encoder.encode(pathValue).byteLength
    if (rawPathBytes > MAX_TREE_PATH_BYTES) throw new Error(`GitHub tree path exceeds ${MAX_TREE_PATH_BYTES} bytes`)
    const filePath = assertContentPath(pathValue)
    const pathBytes = utf8Encoder.encode(filePath).byteLength
    if (pathBytes > MAX_TREE_PATH_BYTES) throw new Error(`GitHub tree path exceeds ${MAX_TREE_PATH_BYTES} bytes`)
    totalPathBytes += pathBytes
    if (totalPathBytes > MAX_TREE_TOTAL_PATH_BYTES) {
      throw new Error(`GitHub tree paths exceed ${MAX_TREE_TOTAL_PATH_BYTES} total bytes`)
    }
    if (seenPaths.has(filePath)) throw new Error("Duplicate GitHub tree path")
    seenPaths.add(filePath)

    assertGitHubCommitSha(shaValue, "GitHub tree SHA")
    if (!TREE_ENTRY_TYPES.has(typeValue)) throw new Error("Invalid GitHub tree entry type")

    const sizeBytes = readOwnDataProperty(entry, "size", false)
    if (
      sizeBytes !== undefined &&
      (typeof sizeBytes !== "number" ||
        !Number.isSafeInteger(sizeBytes) ||
        sizeBytes < 0 ||
        sizeBytes > MAX_IMAGE_SIZE_BYTES)
    ) {
      throw new Error("Invalid GitHub tree entry size")
    }

    if (!isImagePath(filePath)) continue
    if (typeValue !== "blob") throw new Error("Gallery image must be a blob")
    if (images.length >= MAX_IMAGE_FILES) throw new Error(`Gallery image limit exceeds ${MAX_IMAGE_FILES}`)

    images.push(
      Object.freeze({
        fileName: filePath.split("/").pop() ?? filePath,
        filePath,
        githubSha: shaValue,
        ...(sizeBytes === undefined ? {} : { sizeBytes }),
      }),
    )
  }

  return Object.freeze(images)
}

/** Upsert a fully validated scan as one Convex transaction. */
export const upsertScannedImagesBatch = internalMutation({
  args: {
    projectId: v.id("projects"),
    images: v.array(
      v.object({
        fileName: v.string(),
        filePath: v.string(),
        githubSha: v.string(),
        sizeBytes: v.optional(v.number()),
      }),
    ),
  },
  handler: async (ctx, args): Promise<{ inserted: number; updated: number }> => {
    let inserted = 0
    let updated = 0
    for (const image of args.images) {
      const now = Date.now()
      const existing = await ctx.db
        .query("mediaAssets")
        .withIndex("by_projectId_filePath", (q) => q.eq("projectId", args.projectId).eq("filePath", image.filePath))
        .first()

      if (existing) {
        await ctx.db.patch(existing._id, {
          fileName: image.fileName,
          githubSha: image.githubSha,
          sizeBytes: image.sizeBytes,
          updatedAt: now,
        })
        updated += 1
        continue
      }

      await ctx.db.insert("mediaAssets", {
        projectId: args.projectId,
        ...image,
        createdAt: now,
        updatedAt: now,
      })
      inserted += 1
    }
    return { inserted, updated }
  },
})

/**
 * Scans the GitHub repo's full Git tree for image files and upserts them into
 * mediaAssets. Safe to call repeatedly - existing entries are updated, not duplicated.
 * Returns counts of images found, inserted, and updated.
 */
export const scanImagesFromGitHub = action({
  args: {
    projectId: v.id("projects"),
    readRef: v.string(),
    githubToken: v.string(),
  },
  handler: async (ctx, args): Promise<{ found: number; inserted: number; updated: number; truncated: false }> => {
    const { actorUserId, project } = await authorizeGitHubProjectActor(ctx, args)

    await ctx.runMutation(internal.projects.consumeGitHubActionRateLimit, {
      projectId: args.projectId,
      userId: actorUserId,
      action: "gallery_scan",
    })
    await verifyGitHubProjectReadAccess(project, args.githubToken, args.readRef)

    const treeUrl = `https://api.github.com/repos/${project.repoOwner}/${project.repoName}/git/trees/${encodeURIComponent(args.readRef)}?recursive=1`
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

    const treeData = (await treeRes.json()) as unknown
    if (treeData === null || typeof treeData !== "object" || Array.isArray(treeData)) {
      throw new Error("Invalid GitHub tree")
    }
    const treePrototype = Object.getPrototypeOf(treeData)
    if (treePrototype !== Object.prototype && treePrototype !== null) throw new Error("Invalid GitHub tree")
    const tree = readOwnDataProperty(treeData, "tree", true)
    const truncated = readOwnDataProperty(treeData, "truncated", false)
    if (truncated !== undefined && typeof truncated !== "boolean") throw new Error("Invalid GitHub tree")
    if (truncated === true) throw new Error("GitHub tree is truncated")

    const imageFiles = normalizeGalleryTree(tree)
    if (imageFiles.length === 0) return { found: 0, inserted: 0, updated: 0, truncated: false }
    const result: { inserted: number; updated: number } = await ctx.runMutation(
      internal.mediaGallery.upsertScannedImagesBatch,
      {
        projectId: args.projectId,
        images: imageFiles as NormalizedGalleryImage[],
      },
    )

    return {
      found: imageFiles.length,
      inserted: result.inserted,
      updated: result.updated,
      truncated: false,
    }
  },
})
