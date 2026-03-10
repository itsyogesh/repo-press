"use client"

import { useQuery } from "convex/react"
import * as React from "react"
import { api } from "@/convex/_generated/api"
import type { Id } from "@/convex/_generated/dataModel"
import { countPendingOps, type ExplorerOp, overlayOpsOnTree } from "@/lib/explorer-tree-overlay"
import type { FieldVariantMap } from "@/lib/framework-adapters"
import { getFrameworkConfig } from "@/lib/framework-adapters"
import type { FileTreeNode } from "@/lib/github"
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

export function useStudioQueries(selectedFilePath?: string) {
  const { projectId, tree, contentRoot, owner, repo, branch } = useStudio()

  const user = useQuery(api.auth.getCurrentUser)
  const authUserId = user?._id as string | undefined

  const project = useQuery(api.projects.get, projectId ? { id: projectId as Id<"projects"> } : "skip")
  const userId = authUserId ?? (project?.userId as string | undefined) ?? undefined

  const document = useQuery(
    api.documents.getByFilePath,
    projectId && selectedFilePath ? { projectId: projectId as Id<"projects">, filePath: selectedFilePath } : "skip",
  )

  const titleEntries = useQuery(
    api.documents.listTitlesForProject,
    projectId ? { projectId: projectId as Id<"projects"> } : "skip",
  )

  const pendingOps = useQuery(
    api.explorerOps.listPending,
    projectId ? { projectId: projectId as Id<"projects"> } : "skip",
  )

  const activeBranch = useQuery(
    api.publishBranches.getActiveForProject,
    projectId ? { projectId: projectId as Id<"projects"> } : "skip",
  )

  const dirtyDocs = useQuery(
    api.documents.listDirtyForProject,
    projectId ? { projectId: projectId as Id<"projects"> } : "skip",
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
      map[entry.filePath] = entry.title
    }
    return map
  }, [titleEntries])

  const overlayTree = React.useMemo(() => {
    if (!pendingOps || pendingOps.length === 0) return tree
    const ops: ExplorerOp[] = pendingOps.map((op) => ({
      opType: op.opType as any,
      filePath: op.filePath,
      status: op.status as any,
    }))
    return overlayOpsOnTree(tree, ops, contentRoot)
  }, [tree, pendingOps, contentRoot])

  const opCounts = React.useMemo(() => {
    if (!pendingOps) return { creates: 0, deletes: 0 }
    const ops: ExplorerOp[] = pendingOps.map((op) => ({
      opType: op.opType as any,
      filePath: op.filePath,
      status: op.status as any,
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
    overlayTree,
    opCounts,
    activeBranch,
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
