import * as React from "react"
import { useQuery } from "convex/react"
import { api } from "@/convex/_generated/api"
import type { Id } from "@/convex/_generated/dataModel"
import { overlayOpsOnTree, countPendingOps, type ExplorerOp } from "@/lib/explorer-tree-overlay"
import { getFrameworkConfig } from "@/lib/framework-adapters"
import type { FieldVariantMap } from "@/lib/framework-adapters"
import { useStudio } from "../studio-context"
import type { FileTreeNode } from "@/lib/github"

export function useStudioQueries(selectedFilePath?: string) {
    const { projectId, tree, contentRoot, owner, repo, branch } = useStudio()

    const user = useQuery(api.auth.getCurrentUser)
    const userId = user?._id as string | undefined

    const project = useQuery(api.projects.get, projectId ? { id: projectId as Id<"projects"> } : "skip")

    const document = useQuery(
        api.documents.getByFilePath,
        projectId && selectedFilePath
            ? { projectId: projectId as Id<"projects">, filePath: selectedFilePath }
            : "skip",
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

    const titleMap = React.useMemo(() => {
        if (!titleEntries) return {}
        const map: Record<string, string> = {}
        for (const entry of titleEntries) {
            map[entry.filePath] = entry.title
        }
        return map
    }, [titleEntries])

    // Trigger background sync of file tree titles via server-side API
    const hasSynced = React.useRef(false)
    React.useEffect(() => {
        if (hasSynced.current || !projectId || tree.length === 0) return
        hasSynced.current = true

        const files: { path: string; sha: string }[] = []
        function collectFiles(nodes: FileTreeNode[]) {
            for (const node of nodes) {
                if (node.type === "file") {
                    files.push({ path: node.path, sha: node.sha })
                } else if (node.children) {
                    collectFiles(node.children)
                }
            }
        }
        collectFiles(tree)

        if (files.length > 0) {
            fetch("/api/github/sync-titles", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ projectId, owner, repo, branch, files }),
            }).catch((err) => {
                console.error("Failed to sync tree titles:", err)
            })
        }
    }, [projectId, tree, owner, repo, branch])

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
    }
}
