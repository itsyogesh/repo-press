"use client"

import { useQuery } from "convex/react"
import * as React from "react"
import { api } from "@/convex/_generated/api"
import type { Id } from "@/convex/_generated/dataModel"
import { countPendingOps, type ExplorerOp, overlayOpsOnTree } from "@/lib/explorer-tree-overlay"
import type { FieldVariantMap } from "@/lib/framework-adapters"
import { getFrameworkConfig } from "@/lib/framework-adapters"
import type { FileTreeNode } from "@/lib/github"
import {
  CONTENT_PATH_REPRESENTATION,
  resolveStoredContentPath,
  type StoredPathRepresentation,
  toRepoPath,
} from "@/lib/preview/path-policy"
import { treePathToContentPath } from "@/lib/studio/path-adapters"
import { useStudio } from "../studio-context"

type TitleSyncSnapshot = "idle" | "loading" | "done" | "error"

type TitleSyncEntry = {
  status: TitleSyncSnapshot
  listeners: Set<() => void>
  promise: Promise<void> | null
}

const EMPTY_TITLE_SYNC: TitleSyncSnapshot = "idle"
const titleSyncStore = new Map<string, TitleSyncEntry>()

function getTitleSyncEntry(key: string) {
  let entry = titleSyncStore.get(key)
  if (!entry) {
    entry = {
      status: "idle",
      listeners: new Set(),
      promise: null,
    }
    titleSyncStore.set(key, entry)
  }
  return entry
}

function emitTitleSync(entry: TitleSyncEntry) {
  for (const listener of entry.listeners) {
    listener()
  }
}

function collectTreeFiles(tree: FileTreeNode[]) {
  const files: { path: string; sha: string }[] = []

  function visit(nodes: FileTreeNode[]) {
    for (const node of nodes) {
      if (node.type === "file") {
        files.push({ path: node.path, sha: node.sha })
      } else if (node.children) {
        visit(node.children)
      }
    }
  }

  visit(tree)
  return files
}

async function syncTitlesForTree(
  key: string,
  payload: {
    projectId: string
    owner: string
    repo: string
    branch: string
    files: { path: string; sha: string }[]
  },
) {
  const entry = getTitleSyncEntry(key)
  if (entry.promise || entry.status === "done") return

  entry.status = "loading"
  emitTitleSync(entry)

  entry.promise = fetch("/api/github/sync-titles", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  })
    .then(() => {
      entry.status = "done"
    })
    .catch((error) => {
      entry.status = "error"
      console.error("Failed to sync tree titles:", error)
    })
    .finally(() => {
      entry.promise = null
      emitTitleSync(entry)
    })
}

function subscribeTitleSync(
  key: string | null,
  payload: {
    projectId: string
    owner: string
    repo: string
    branch: string
    files: { path: string; sha: string }[]
  } | null,
  listener: () => void,
) {
  if (!key || !payload || payload.files.length === 0) return () => {}

  const entry = getTitleSyncEntry(key)
  entry.listeners.add(listener)
  void syncTitlesForTree(key, payload)

  return () => {
    entry.listeners.delete(listener)
  }
}

function getTitleSyncSnapshot(key: string | null): TitleSyncSnapshot {
  if (!key) return EMPTY_TITLE_SYNC
  const entry = getTitleSyncEntry(key)
  return entry.status
}

export function useStudioQueries(
  selectedFilePath?: string,
  overrides?: {
    projectId?: string
    tree?: FileTreeNode[]
    contentRoot?: string
    owner?: string
    repo?: string
    branch?: string
    projectAccessToken?: string
  },
) {
  const context = useStudio()
  const projectId = overrides?.projectId ?? context.projectId
  const tree = overrides?.tree ?? context.tree
  const contentRoot = overrides?.contentRoot ?? context.contentRoot
  const owner = overrides?.owner ?? context.owner
  const repo = overrides?.repo ?? context.repo
  const branch = overrides?.branch ?? context.branch
  const projectAccessToken = overrides?.projectAccessToken ?? context.projectAccessToken

  const user = useQuery(api.auth.getCurrentUser)
  const authUserId = user?._id as string | undefined

  // P2 fix: Use the authenticated user's ID, not the project owner's.
  // For collaborators, authUserId differs from project.userId.
  const userId = authUserId ?? undefined

  // Auth args for query-level access checks
  const queryAuth = React.useMemo(
    () => ({
      userId: userId || undefined,
      projectAccessToken: projectAccessToken || undefined,
    }),
    [userId, projectAccessToken],
  )

  const project = useQuery(api.projects.get, projectId ? { id: projectId as Id<"projects">, ...queryAuth } : "skip")

  const selectedContentPath = React.useMemo(
    () => (selectedFilePath ? treePathToContentPath(contentRoot, selectedFilePath) : undefined),
    [contentRoot, selectedFilePath],
  )
  const shouldLookupLegacyDocument = Boolean(projectId && selectedFilePath)

  const canonicalDocument = useQuery(
    api.documents.getByFilePath,
    projectId && selectedContentPath
      ? {
          projectId: projectId as Id<"projects">,
          filePath: selectedContentPath,
          pathRepresentation: CONTENT_PATH_REPRESENTATION,
          ...queryAuth,
        }
      : "skip",
  )

  const legacyDocument = useQuery(
    api.documents.getByFilePath,
    shouldLookupLegacyDocument && projectId && selectedFilePath
      ? {
          projectId: projectId as Id<"projects">,
          filePath: selectedFilePath,
          pathRepresentation: "legacy_repo_v0",
          ...queryAuth,
        }
      : "skip",
  )

  const titleEntries = useQuery(
    api.documents.listTitlesForProject,
    projectId ? { projectId: projectId as Id<"projects">, ...queryAuth } : "skip",
  )

  const storedPendingOps = useQuery(
    api.explorerOps.listPending,
    projectId ? { projectId: projectId as Id<"projects">, ...queryAuth } : "skip",
  )

  const pendingMediaOps = useQuery(
    api.mediaOps.listPending,
    projectId ? { projectId: projectId as Id<"projects">, ...queryAuth } : "skip",
  )

  const currentPublishLane = useQuery(
    api.publishBranches.getCurrentForProject,
    projectId ? { projectId: projectId as Id<"projects">, ...queryAuth } : "skip",
  )

  const openPublishLanes = useQuery(
    api.publishBranches.listOpenForProject,
    projectId ? { projectId: projectId as Id<"projects">, ...queryAuth } : "skip",
  )

  const storedDirtyDocs = useQuery(
    api.documents.listDirtyForProject,
    projectId ? { projectId: projectId as Id<"projects">, ...queryAuth } : "skip",
  )

  const document = React.useMemo(() => {
    if (canonicalDocument === undefined) return undefined
    if (!canonicalDocument && shouldLookupLegacyDocument && legacyDocument === undefined) return undefined
    const storedDocument = canonicalDocument ?? legacyDocument
    if (!storedDocument) return storedDocument
    return {
      ...storedDocument,
      filePath: resolveStoredContentPath(
        contentRoot,
        storedDocument.filePath,
        storedDocument.pathRepresentation as StoredPathRepresentation | undefined,
      ),
      pathRepresentation: CONTENT_PATH_REPRESENTATION,
    }
  }, [canonicalDocument, contentRoot, legacyDocument, shouldLookupLegacyDocument])

  const pendingOps = React.useMemo(
    () =>
      storedPendingOps?.map((op) => ({
        ...op,
        filePath: resolveStoredContentPath(
          contentRoot,
          op.filePath,
          op.pathRepresentation as StoredPathRepresentation | undefined,
        ),
        pathRepresentation: CONTENT_PATH_REPRESENTATION,
      })),
    [contentRoot, storedPendingOps],
  )

  const dirtyDocs = React.useMemo(
    () =>
      storedDirtyDocs?.map((doc) => ({
        ...doc,
        filePath: resolveStoredContentPath(
          contentRoot,
          doc.filePath,
          doc.pathRepresentation as StoredPathRepresentation | undefined,
        ),
        pathRepresentation: CONTENT_PATH_REPRESENTATION,
      })),
    [contentRoot, storedDirtyDocs],
  )

  const treeFiles = React.useMemo(() => collectTreeFiles(tree), [tree])
  const titleSyncKey = React.useMemo(() => {
    if (!projectId || treeFiles.length === 0) return null
    return JSON.stringify({
      projectId,
      owner,
      repo,
      branch,
      files: treeFiles,
    })
  }, [projectId, owner, repo, branch, treeFiles])

  React.useSyncExternalStore(
    (listener) =>
      subscribeTitleSync(
        titleSyncKey,
        projectId
          ? {
              projectId,
              owner,
              repo,
              branch,
              files: treeFiles,
            }
          : null,
        listener,
      ),
    () => getTitleSyncSnapshot(titleSyncKey),
    () => EMPTY_TITLE_SYNC,
  )

  const titleMap = React.useMemo(() => {
    if (!titleEntries) return {}
    const map: Record<string, string> = {}
    for (const entry of titleEntries) {
      const contentPath = resolveStoredContentPath(
        contentRoot,
        entry.filePath,
        entry.pathRepresentation as StoredPathRepresentation | undefined,
      )
      map[toRepoPath(contentRoot, contentPath)] = entry.title
    }
    return map
  }, [contentRoot, titleEntries])

  const overlayTree = React.useMemo(() => {
    if (!pendingOps || pendingOps.length === 0) return tree
    const ops: ExplorerOp[] = pendingOps.map((op) => ({
      opType: op.opType as any,
      filePath: op.filePath,
      status: op.status as any,
      pathRepresentation: CONTENT_PATH_REPRESENTATION,
    }))
    return overlayOpsOnTree(tree, ops, contentRoot)
  }, [tree, pendingOps, contentRoot])

  const opCounts = React.useMemo(() => {
    if (!pendingOps) return { creates: 0, deletes: 0 }
    const ops: ExplorerOp[] = pendingOps.map((op) => ({
      opType: op.opType as any,
      filePath: op.filePath,
      status: op.status as any,
      pathRepresentation: CONTENT_PATH_REPRESENTATION,
    }))
    return countPendingOps(ops)
  }, [pendingOps])

  const editCount = dirtyDocs?.length ?? 0

  const frontmatterSchema = project?.frontmatterSchema as any[] | undefined

  const fieldVariants: FieldVariantMap = React.useMemo(() => {
    if (!project?.detectedFramework) return {}
    const config = getFrameworkConfig(project.detectedFramework as string)
    return config.fieldVariants
  }, [project?.detectedFramework])

  return {
    user,
    userId,
    project,
    document,
    titleMap,
    pendingOps,
    pendingMediaOps,
    overlayTree,
    opCounts,
    currentPublishLane,
    openPublishLanes,
    activeBranch: currentPublishLane,
    dirtyDocs,
    editCount,
    frontmatterSchema,
    fieldVariants,
    previewEntry: project?.previewEntry,
    enabledPlugins: project?.enabledPlugins,
    pluginRegistry: project?.pluginRegistry as Record<string, string> | undefined,
    components: project?.components as Record<string, any> | undefined,
  }
}
