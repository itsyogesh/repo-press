import * as React from "react"
import { useRouter } from "next/navigation"
import matter from "gray-matter"
import { normalizeFrontmatterDates } from "@/lib/framework-adapters"
import type { FileTreeNode } from "@/lib/github"
import { useStudio } from "../studio-context"

interface InitialFile {
    path: string
    content: string
    sha: string
}

function findNode(nodes: FileTreeNode[], path: string): FileTreeNode | null {
    for (const node of nodes) {
        if (node.path === path) return node
        if (node.children) {
            const found = findNode(node.children, path)
            if (found) return found
        }
    }
    return null
}

export function useStudioFile(initialFile: InitialFile | null | undefined, currentPath: string) {
    const router = useRouter()
    const { owner, repo, branch, projectId, tree } = useStudio()

    const [selectedFile, setSelectedFile] = React.useState<FileTreeNode | null>(null)
    const [content, setContent] = React.useState("")
    const [frontmatter, setFrontmatter] = React.useState<Record<string, any>>({})
    const [sha, setSha] = React.useState<string | null>(null)
    const [isDirty, setIsDirty] = React.useState(false)

    const navigateToFile = React.useCallback(
        (nodeOrPath: FileTreeNode | string) => {
            const filePath = typeof nodeOrPath === "string" ? nodeOrPath : nodeOrPath.path
            const studioBase = `/dashboard/${owner}/${repo}/studio`
            const params = new URLSearchParams()
            params.set("branch", branch)
            if (projectId) params.set("projectId", projectId)
            router.push(`${studioBase}/${filePath}?${params.toString()}`)
        },
        [owner, repo, branch, projectId, router],
    )

    // Handle new files that exist in Convex but not yet on GitHub
    React.useEffect(() => {
        if (!initialFile && currentPath) {
            const name = currentPath.split("/").pop() || currentPath
            setSelectedFile({
                name,
                path: currentPath,
                sha: "",
                type: "file",
            })
        }
    }, [initialFile, currentPath])

    React.useEffect(() => {
        if (initialFile) {
            try {
                const { data, content: fileContent } = matter(initialFile.content)
                setFrontmatter(normalizeFrontmatterDates(data))
                setContent(fileContent)
                setSha(initialFile.sha)

                const treeNode = findNode(tree, initialFile.path) || {
                    name: initialFile.path.split("/").pop() || "",
                    path: initialFile.path,
                    sha: initialFile.sha,
                    type: "file" as const,
                }
                setSelectedFile(treeNode)
                setIsDirty(false)
            } catch (e) {
                console.error("Error parsing frontmatter:", e)
                setContent(initialFile.content)
                setFrontmatter({})
                setIsDirty(false)
            }
        }
    }, [initialFile, tree])

    const hydrateFromDocument = React.useCallback((doc: any) => {
        try {
            if (typeof doc.body === "string" && doc.body.length > 0) {
                setContent(doc.body)
            }
            if (doc.frontmatter && typeof doc.frontmatter === "object") {
                setFrontmatter(normalizeFrontmatterDates(doc.frontmatter))
            }
            setIsDirty(false)
        } catch (e) {
            console.error("Error hydrating from Convex document draft:", e)
        }
    }, [])

    const handleContentChange = React.useCallback((newContent: string) => {
        setContent(newContent)
        setIsDirty(true)
    }, [])

    const handleFrontmatterChangeKey = React.useCallback((key: string, value: any) => {
        setFrontmatter((prev) => ({ ...prev, [key]: value }))
        setIsDirty(true)
    }, [])

    const handleFrontmatterChangeAll = React.useCallback((fm: Record<string, any>) => {
        setFrontmatter(fm)
        setIsDirty(true)
    }, [])

    return {
        selectedFile,
        content,
        frontmatter,
        sha,
        isDirty,
        navigateToFile,
        setContent: handleContentChange,
        setFrontmatterKey: handleFrontmatterChangeKey,
        setFrontmatter: handleFrontmatterChangeAll,
        hydrateFromDocument,
    }
}
