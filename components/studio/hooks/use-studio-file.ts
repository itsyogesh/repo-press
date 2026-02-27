import * as React from "react"
import matter from "gray-matter"
import { normalizeFrontmatterDates } from "@/lib/framework-adapters"
import type { FileTreeNode } from "@/lib/github"
import { useStudio } from "../studio-context"

interface InitialFile {
  path: string
  content: string
  sha: string
}

interface CachedFileSnapshot {
  content: string
  frontmatter: Record<string, unknown>
  sha: string | null
}

interface PrimeSnapshotInput {
  content: string
  frontmatter?: Record<string, unknown>
  sha?: string | null
}

interface GitHubFileResponse {
  path: string
  name: string
  sha: string
  content: string
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

function parseFileSnapshot(rawContent: string, sha: string | null): CachedFileSnapshot {
  try {
    const { data, content } = matter(rawContent)
    return {
      content,
      frontmatter: normalizeFrontmatterDates(data) as Record<string, unknown>,
      sha,
    }
  } catch {
    return {
      content: rawContent,
      frontmatter: {},
      sha,
    }
  }
}

export function useStudioFile(initialFile: InitialFile | null | undefined, currentPath: string) {
  const { owner, repo, branch, projectId, tree } = useStudio()
  const openFilesStorageKey = React.useMemo(
    () => `studio:openFiles:${owner}:${repo}:${branch}:${projectId || "none"}`,
    [owner, repo, branch, projectId],
  )
  const selectedFileStorageKey = React.useMemo(
    () => `studio:selectedFile:${owner}:${repo}:${branch}:${projectId || "none"}`,
    [owner, repo, branch, projectId],
  )
  const recentFilesStorageKey = React.useMemo(
    () => `studio:recentFiles:${owner}:${repo}:${branch}:${projectId || "none"}`,
    [owner, repo, branch, projectId],
  )

  const [selectedFile, setSelectedFile] = React.useState<FileTreeNode | null>(null)
  const [openFiles, setOpenFiles] = React.useState<string[]>([])
  const [openFilesHydrated, setOpenFilesHydrated] = React.useState(false)
  const [recentFiles, setRecentFiles] = React.useState<string[]>([])
  const [recentFilesHydrated, setRecentFilesHydrated] = React.useState(false)
  const [content, setContent] = React.useState("")
  const [frontmatter, setFrontmatter] = React.useState<Record<string, unknown>>({})
  const [sha, setSha] = React.useState<string | null>(null)
  const [isDirty, setIsDirty] = React.useState(false)
  const [isFileLoading, setIsFileLoading] = React.useState(false)

  const fileCacheRef = React.useRef<Map<string, CachedFileSnapshot>>(new Map())
  const requestVersionRef = React.useRef(0)

  const buildStudioUrl = React.useCallback(
    (filePath?: string) => {
      const studioBase = `/dashboard/${owner}/${repo}/studio`
      const params = new URLSearchParams()
      params.set("branch", branch)
      if (projectId) params.set("projectId", projectId)
      if (filePath) params.set("file", filePath)
      return `${studioBase}?${params.toString()}`
    },
    [owner, repo, branch, projectId],
  )

  const syncBrowserUrl = React.useCallback(
    (filePath: string | undefined, mode: "push" | "replace" | "none") => {
      if (mode === "none" || typeof window === "undefined") return
      const nextUrl = buildStudioUrl(filePath)
      if (mode === "replace") {
        window.history.replaceState({}, "", nextUrl)
      } else {
        window.history.pushState({}, "", nextUrl)
      }
    },
    [buildStudioUrl],
  )

  const resolveFileNode = React.useCallback(
    (filePath: string, fileSha?: string | null): FileTreeNode => {
      const existingNode = findNode(tree, filePath)
      if (existingNode) return existingNode
      return {
        name: filePath.split("/").pop() || filePath,
        path: filePath,
        sha: fileSha || "",
        type: "file",
      }
    },
    [tree],
  )

  const applySnapshot = React.useCallback(
    (filePath: string, snapshot: CachedFileSnapshot) => {
      setSelectedFile(resolveFileNode(filePath, snapshot.sha))
      setContent(snapshot.content)
      setFrontmatter(snapshot.frontmatter)
      setSha(snapshot.sha)
      setIsDirty(false)
    },
    [resolveFileNode],
  )

  const clearSelection = React.useCallback(
    (mode: "push" | "replace" | "none" = "push") => {
      setSelectedFile(null)
      setContent("")
      setFrontmatter({})
      setSha(null)
      setIsDirty(false)
      setIsFileLoading(false)
      try {
        localStorage.removeItem(selectedFileStorageKey)
      } catch {
        // no-op
      }
      syncBrowserUrl(undefined, mode)
    },
    [selectedFileStorageKey, syncBrowserUrl],
  )

  const trackRecentFile = React.useCallback((filePath: string) => {
    setRecentFiles((prev) => [filePath, ...prev.filter((item) => item !== filePath)].slice(0, 24))
  }, [])

  const primeFileSnapshot = React.useCallback((filePath: string, snapshot: PrimeSnapshotInput) => {
    const normalizedSnapshot: CachedFileSnapshot = {
      content: snapshot.content,
      frontmatter: snapshot.frontmatter
        ? (normalizeFrontmatterDates(snapshot.frontmatter) as Record<string, unknown>)
        : {},
      sha: snapshot.sha ?? null,
    }

    fileCacheRef.current.set(filePath, normalizedSnapshot)
    setOpenFiles((prev) => (prev.includes(filePath) ? prev : [...prev, filePath]))
  }, [])

  const openFile = React.useCallback(
    async (filePath: string, mode: "push" | "replace" | "none" = "push") => {
      setOpenFiles((prev) => (prev.includes(filePath) ? prev : [...prev, filePath]))
      trackRecentFile(filePath)
      syncBrowserUrl(filePath, mode)

      const resolvedNode = resolveFileNode(filePath)
      const cached = fileCacheRef.current.get(filePath)
      const hasRemoteSha = Boolean(resolvedNode.sha)
      const cacheMatchesRemoteSha = Boolean(cached && hasRemoteSha && cached.sha === resolvedNode.sha)
      const cacheIsLocalDraft = Boolean(cached && !hasRemoteSha)
      const shouldTryRemoteForLocalCache = Boolean(cached && cached.sha === null)

      if (cached && !shouldTryRemoteForLocalCache && (cacheMatchesRemoteSha || cacheIsLocalDraft)) {
        setIsFileLoading(false)
        applySnapshot(filePath, cached)
        return
      }

      if (cached && hasRemoteSha && cached.sha !== resolvedNode.sha) {
        fileCacheRef.current.delete(filePath)
      }

      const emptySnapshot: CachedFileSnapshot = {
        content: "",
        frontmatter: {},
        sha: null,
      }

      // Prevent stale editor data from the previous file while a new file is loading.
      setSelectedFile(resolvedNode)
      setContent("")
      setFrontmatter({})
      setSha(null)
      setIsDirty(false)
      setIsFileLoading(true)
      const requestVersion = ++requestVersionRef.current

      if (!resolvedNode.sha && !shouldTryRemoteForLocalCache) {
        fileCacheRef.current.set(filePath, emptySnapshot)
        applySnapshot(filePath, emptySnapshot)
        setIsFileLoading(false)
        return
      }

      try {
        const params = new URLSearchParams({
          owner,
          repo,
          path: filePath,
          branch,
        })

        const response = await fetch(`/api/github/file?${params.toString()}`, {
          method: "GET",
          cache: "no-store",
        })

        if (!response.ok) {
          throw new Error(`Failed to fetch file (${response.status})`)
        }

        const file = (await response.json()) as GitHubFileResponse
        if (requestVersionRef.current !== requestVersion) return

        const snapshot = parseFileSnapshot(file.content, file.sha)
        fileCacheRef.current.set(filePath, snapshot)
        applySnapshot(filePath, snapshot)
      } catch (error) {
        if (requestVersionRef.current === requestVersion) {
          console.error("Failed to open file", error)
          if (cached && shouldTryRemoteForLocalCache) {
            applySnapshot(filePath, cached)
          } else {
            applySnapshot(filePath, emptySnapshot)
          }
          setIsFileLoading(false)
        }
      } finally {
        if (requestVersionRef.current === requestVersion) {
          setIsFileLoading(false)
        }
      }
    },
    [owner, repo, branch, syncBrowserUrl, applySnapshot, resolveFileNode, trackRecentFile],
  )

  const readPathFromUrl = React.useCallback(() => {
    if (typeof window === "undefined") return ""

    const url = new URL(window.location.href)
    const queryPath = url.searchParams.get("file")
    if (queryPath) return queryPath

    const prefix = `/dashboard/${owner}/${repo}/studio/`
    if (url.pathname.startsWith(prefix)) {
      const rawPath = url.pathname.slice(prefix.length)
      if (rawPath) return decodeURIComponent(rawPath)
    }

    return ""
  }, [owner, repo])

  React.useEffect(() => {
    try {
      const raw = localStorage.getItem(openFilesStorageKey)
      if (!raw) return
      const parsed = JSON.parse(raw)
      if (Array.isArray(parsed)) {
        setOpenFiles(parsed.filter((item): item is string => typeof item === "string"))
      }
    } catch {
      // no-op
    } finally {
      setOpenFilesHydrated(true)
    }
  }, [openFilesStorageKey])

  React.useEffect(() => {
    if (!openFilesHydrated) return
    try {
      localStorage.setItem(openFilesStorageKey, JSON.stringify(openFiles))
    } catch {
      // no-op
    }
  }, [openFiles, openFilesStorageKey, openFilesHydrated])

  React.useEffect(() => {
    try {
      const raw = localStorage.getItem(recentFilesStorageKey)
      if (!raw) return
      const parsed = JSON.parse(raw)
      if (Array.isArray(parsed)) {
        setRecentFiles((prev) => {
          const merged = [...prev]
          for (const item of parsed) {
            if (typeof item !== "string") continue
            if (!merged.includes(item)) {
              merged.push(item)
            }
          }
          return merged.slice(0, 24)
        })
      }
    } catch {
      // no-op
    } finally {
      setRecentFilesHydrated(true)
    }
  }, [recentFilesStorageKey])

  React.useEffect(() => {
    if (!recentFilesHydrated) return
    try {
      localStorage.setItem(recentFilesStorageKey, JSON.stringify(recentFiles))
    } catch {
      // no-op
    }
  }, [recentFiles, recentFilesStorageKey, recentFilesHydrated])

  React.useEffect(() => {
    if (!selectedFile?.path) return
    try {
      localStorage.setItem(selectedFileStorageKey, selectedFile.path)
    } catch {
      // no-op
    }
  }, [selectedFile?.path, selectedFileStorageKey])

  React.useEffect(() => {
    if (initialFile) {
      const snapshot = parseFileSnapshot(initialFile.content, initialFile.sha)
      fileCacheRef.current.set(initialFile.path, snapshot)
      applySnapshot(initialFile.path, snapshot)
      syncBrowserUrl(initialFile.path, "replace")
      return
    }

    if (currentPath) {
      const cached = fileCacheRef.current.get(currentPath)
      if (cached) {
        applySnapshot(currentPath, cached)
      } else {
        void openFile(currentPath, "replace")
      }
      return
    }

    if (!openFilesHydrated) return

    const validOpenFiles = openFiles.filter((path) => findNode(tree, path)?.type === "file")
    if (validOpenFiles.length !== openFiles.length) {
      setOpenFiles(validOpenFiles)
    }

    const storedSelectedPath =
      typeof window !== "undefined" ? (localStorage.getItem(selectedFileStorageKey) ?? "") : ""
    const fallbackPath = validOpenFiles[validOpenFiles.length - 1]
    const restorePath =
      storedSelectedPath && validOpenFiles.includes(storedSelectedPath) ? storedSelectedPath : fallbackPath

    if (restorePath) {
      const cached = fileCacheRef.current.get(restorePath)
      if (cached) {
        applySnapshot(restorePath, cached)
      } else {
        void openFile(restorePath, "replace")
      }
      return
    }

    clearSelection("replace")
  }, [
    initialFile,
    currentPath,
    openFilesHydrated,
    openFiles,
    tree,
    selectedFileStorageKey,
    applySnapshot,
    clearSelection,
    openFile,
  ])

  React.useEffect(() => {
    const path = selectedFile?.path
    if (!path) return
    const snapshot = fileCacheRef.current.get(path)
    if (!snapshot) return
    setSelectedFile(resolveFileNode(path, snapshot.sha))
  }, [tree, selectedFile?.path, resolveFileNode])

  React.useEffect(() => {
    if (typeof window === "undefined") return

    const handlePopState = () => {
      const path = readPathFromUrl()
      if (!path) {
        clearSelection("none")
        return
      }
      void openFile(path, "none")
    }

    window.addEventListener("popstate", handlePopState)
    return () => window.removeEventListener("popstate", handlePopState)
  }, [readPathFromUrl, clearSelection, openFile])

  React.useEffect(() => {
    if (!selectedFile?.path || selectedFile.type !== "file") return
    setOpenFiles((prev) => (prev.includes(selectedFile.path) ? prev : [...prev, selectedFile.path]))
  }, [selectedFile?.path, selectedFile?.type])

  const closeFile = React.useCallback(
    (path: string) => {
      setOpenFiles((prev) => prev.filter((item) => item !== path))

      if (selectedFile?.path !== path) return

      const remaining = openFiles.filter((item) => item !== path)
      if (remaining.length === 0) {
        clearSelection("push")
        return
      }

      const currentIndex = openFiles.indexOf(path)
      const fallbackIndex = currentIndex > 0 ? currentIndex - 1 : 0
      const fallbackPath = remaining[Math.min(fallbackIndex, remaining.length - 1)]
      void openFile(fallbackPath, "push")
    },
    [selectedFile?.path, openFiles, clearSelection, openFile],
  )

  const discardFileFromClientState = React.useCallback(
    (path: string) => {
      fileCacheRef.current.delete(path)
      setRecentFiles((prev) => prev.filter((item) => item !== path))
      closeFile(path)
    },
    [closeFile],
  )

  const hydrateFromDocument = React.useCallback(
    (doc: { body?: unknown; frontmatter?: unknown }) => {
      try {
        const activePath = selectedFile?.path
        if (!activePath) return

        let nextContent = content
        let nextFrontmatter = frontmatter

        if (typeof doc.body === "string") {
          nextContent = doc.body
          setContent(doc.body)
        }
        if (doc.frontmatter && typeof doc.frontmatter === "object") {
          nextFrontmatter = normalizeFrontmatterDates(doc.frontmatter as Record<string, unknown>) as Record<
            string,
            unknown
          >
          setFrontmatter(nextFrontmatter)
        }

        fileCacheRef.current.set(activePath, {
          content: nextContent,
          frontmatter: nextFrontmatter,
          sha,
        })

        setIsDirty(false)
      } catch (error) {
        console.error("Error hydrating from Convex document draft:", error)
      }
    },
    [selectedFile?.path, content, frontmatter, sha],
  )

  const handleContentChange = React.useCallback(
    (newContent: string) => {
      setContent(newContent)
      setIsDirty(true)
      if (selectedFile?.path) {
        fileCacheRef.current.set(selectedFile.path, {
          content: newContent,
          frontmatter,
          sha,
        })
      }
    },
    [selectedFile?.path, frontmatter, sha],
  )

  const handleFrontmatterChangeKey = React.useCallback(
    (key: string, value: unknown) => {
      setFrontmatter((prev) => {
        const next = { ...prev, [key]: value }
        if (selectedFile?.path) {
          fileCacheRef.current.set(selectedFile.path, {
            content,
            frontmatter: next,
            sha,
          })
        }
        return next
      })
      setIsDirty(true)
    },
    [selectedFile?.path, content, sha],
  )

  const handleFrontmatterChangeAll = React.useCallback(
    (nextFrontmatter: Record<string, unknown>) => {
      setFrontmatter(nextFrontmatter)
      setIsDirty(true)
      if (selectedFile?.path) {
        fileCacheRef.current.set(selectedFile.path, {
          content,
          frontmatter: nextFrontmatter,
          sha,
        })
      }
    },
    [selectedFile?.path, content, sha],
  )

  const navigateToFile = React.useCallback(
    (nodeOrPath: FileTreeNode | string) => {
      const filePath = typeof nodeOrPath === "string" ? nodeOrPath : nodeOrPath.path
      void openFile(filePath, "push")
    },
    [openFile],
  )

  return {
    selectedFile,
    openFiles,
    recentFiles,
    content,
    frontmatter,
    sha,
    isDirty,
    isFileLoading,
    navigateToFile,
    clearSelection,
    closeFile,
    discardFileFromClientState,
    primeFileSnapshot,
    setContent: handleContentChange,
    setFrontmatterKey: handleFrontmatterChangeKey,
    setFrontmatter: handleFrontmatterChangeAll,
    hydrateFromDocument,
  }
}
