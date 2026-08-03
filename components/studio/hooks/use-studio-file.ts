"use client"

import * as React from "react"
import { type ParsedContentFile, parseContentFile } from "@/lib/content-metadata"
import { normalizeFrontmatterDates } from "@/lib/framework-adapters"
import { type FileTreeNode, findTreeNode } from "@/lib/github"
import { toRepoPath } from "@/lib/preview/path-policy"
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
  isDirty: boolean
  sourceAuthority: SourceAuthority
  sourceDiagnostic?: ParsedContentFile["diagnostic"]
}

interface PrimeSnapshotInput {
  content: string
  frontmatter?: Record<string, unknown>
  sha?: string | null
  isDirty?: boolean
  isSourceEditable?: boolean
  sourceDiagnostic?: ParsedContentFile["diagnostic"]
}

interface GitHubFileResponse {
  path: string
  name: string
  sha: string
  content: string
}

interface PendingDocumentHydration {
  requestVersion: number
  body: string | null
  frontmatter: Record<string, unknown> | null
}

export type SourceAuthority = "unknown" | "editable" | "read-only"

function parseFileSnapshot(rawContent: string, sha: string | null, filePath: string): CachedFileSnapshot {
  const parsed = parseContentFile(rawContent, filePath)
  return {
    content: parsed.body,
    frontmatter: normalizeFrontmatterDates(parsed.metadata as Record<string, unknown>),
    sha,
    isDirty: false,
    sourceAuthority: parsed.editable ? "editable" : "read-only",
    sourceDiagnostic: parsed.diagnostic,
  }
}

export function useStudioFile(initialFile: InitialFile | null | undefined, currentPath: string) {
  const { owner, repo, branch, baseCommitSha, projectId, contentRoot, tree } = useStudio()
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
  const [sourceAuthority, setSourceAuthority] = React.useState<SourceAuthority>("unknown")
  const isSourceEditable = sourceAuthority === "editable"
  const [sourceDiagnostic, setSourceDiagnostic] = React.useState<ParsedContentFile["diagnostic"]>()

  const fileCacheRef = React.useRef<Map<string, CachedFileSnapshot>>(new Map())
  const fileCacheRevisionRef = React.useRef<Map<string, number>>(new Map())
  const requestVersionRef = React.useRef(0)
  const remoteReadVersionRef = React.useRef<Map<string, number>>(new Map())
  const pendingDocumentHydrationRef = React.useRef<Map<string, PendingDocumentHydration>>(new Map())
  const initialFileAppliedKeyRef = React.useRef<string | null>(null)

  const writeCachedSnapshot = React.useCallback((filePath: string, snapshot: CachedFileSnapshot) => {
    fileCacheRef.current.set(filePath, snapshot)
    fileCacheRevisionRef.current.set(filePath, (fileCacheRevisionRef.current.get(filePath) ?? 0) + 1)
  }, [])

  const deleteCachedSnapshot = React.useCallback((filePath: string) => {
    fileCacheRef.current.delete(filePath)
    fileCacheRevisionRef.current.set(filePath, (fileCacheRevisionRef.current.get(filePath) ?? 0) + 1)
  }, [])

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
      const existingNode = findTreeNode(tree, filePath)
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
      setIsDirty(snapshot.isDirty)
      setSourceAuthority(snapshot.sourceAuthority)
      setSourceDiagnostic(snapshot.sourceDiagnostic)
    },
    [resolveFileNode],
  )

  const clearSelection = React.useCallback(
    (mode: "push" | "replace" | "none" = "push") => {
      requestVersionRef.current += 1
      setSelectedFile(null)
      setContent("")
      setFrontmatter({})
      setSha(null)
      setIsDirty(false)
      setIsFileLoading(false)
      setSourceAuthority("unknown")
      setSourceDiagnostic(undefined)
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

  const primeFileSnapshot = React.useCallback(
    (filePath: string, snapshot: PrimeSnapshotInput) => {
      const normalizedSnapshot: CachedFileSnapshot = {
        content: snapshot.content,
        frontmatter: snapshot.frontmatter
          ? (normalizeFrontmatterDates(snapshot.frontmatter) as Record<string, unknown>)
          : {},
        sha: snapshot.sha ?? null,
        isDirty: snapshot.isDirty ?? false,
        sourceAuthority: snapshot.isSourceEditable === false ? "read-only" : "editable",
        sourceDiagnostic: snapshot.sourceDiagnostic,
      }

      writeCachedSnapshot(filePath, normalizedSnapshot)
      setOpenFiles((prev) => (prev.includes(filePath) ? prev : [...prev, filePath]))
    },
    [writeCachedSnapshot],
  )

  const openFile = React.useCallback(
    async (filePath: string, mode: "push" | "replace" | "none" = "push") => {
      setOpenFiles((prev) => (prev.includes(filePath) ? prev : [...prev, filePath]))
      trackRecentFile(filePath)
      syncBrowserUrl(filePath, mode)
      const requestVersion = ++requestVersionRef.current

      const resolvedNode = resolveFileNode(filePath)
      const cached = fileCacheRef.current.get(filePath)
      const hasRemoteSha = Boolean(resolvedNode.sha)
      const cacheMatchesRemoteSha = Boolean(cached && hasRemoteSha && cached.sha === resolvedNode.sha)
      const cacheIsLocalDraft = Boolean(cached && !hasRemoteSha)
      const shouldTryRemoteForLocalCache = Boolean(cached && cached.sha === null)

      if (cached && !shouldTryRemoteForLocalCache && (cacheMatchesRemoteSha || cacheIsLocalDraft)) {
        if (requestVersionRef.current === requestVersion) {
          setIsFileLoading(false)
          applySnapshot(filePath, cached)
        }
        return
      }

      if (cached && hasRemoteSha && cached.sha !== resolvedNode.sha) {
        deleteCachedSnapshot(filePath)
      }

      const requestStartCacheRevision = fileCacheRevisionRef.current.get(filePath) ?? 0
      const requestStartCached = fileCacheRef.current.get(filePath)
      const requestStartHasLocalSnapshot = requestStartCached?.sha === null

      const emptySnapshot: CachedFileSnapshot = {
        content: "",
        frontmatter: {},
        sha: null,
        isDirty: false,
        sourceAuthority: "editable",
      }

      // A cached snapshot has already established source authority, so keep
      // it visible and writable while validating the remote path. A cold
      // existing-file read stays non-writable until its bytes are parsed.
      if (requestStartCached) {
        applySnapshot(filePath, requestStartCached)
      } else {
        setSelectedFile(resolvedNode)
        setContent("")
        setFrontmatter({})
        setSha(null)
        setIsDirty(false)
        setSourceAuthority("unknown")
        setSourceDiagnostic(undefined)
      }
      setIsFileLoading(true)
      remoteReadVersionRef.current.set(filePath, requestVersion)

      const takePendingDocumentHydration = () => {
        const pending = pendingDocumentHydrationRef.current.get(filePath)
        if (pending?.requestVersion !== requestVersion) return null
        pendingDocumentHydrationRef.current.delete(filePath)
        return pending
      }

      const applyDocumentHydration = (snapshot: CachedFileSnapshot, pending: PendingDocumentHydration) => {
        const hydratedSnapshot: CachedFileSnapshot = {
          ...snapshot,
          content: pending.body ?? snapshot.content,
          frontmatter: pending.frontmatter ?? snapshot.frontmatter,
          sha: null,
        }
        writeCachedSnapshot(filePath, hydratedSnapshot)
        applySnapshot(filePath, hydratedSnapshot)
      }

      const applyNewerLocalSnapshot = () => {
        const latestRevision = fileCacheRevisionRef.current.get(filePath) ?? 0
        const latestSnapshot = fileCacheRef.current.get(filePath)
        if (latestRevision === requestStartCacheRevision || latestSnapshot?.sha !== null) return false
        applySnapshot(filePath, latestSnapshot)
        return true
      }

      let remotePathAbsent = false
      try {
        const params = new URLSearchParams({
          owner,
          repo,
          path: filePath,
          ref: baseCommitSha,
        })

        const response = await fetch(`/api/github/file?${params.toString()}`, {
          method: "GET",
          cache: "no-store",
        })

        if (!response.ok) {
          remotePathAbsent = response.status === 404
          throw new Error(`Failed to fetch file (${response.status})`)
        }

        const file = (await response.json()) as GitHubFileResponse
        if (requestVersionRef.current !== requestVersion) return

        const snapshot = parseFileSnapshot(file.content, file.sha, filePath)
        const pendingHydration = takePendingDocumentHydration()
        if (snapshot.sourceAuthority === "read-only") {
          writeCachedSnapshot(filePath, snapshot)
          applySnapshot(filePath, snapshot)
          return
        }
        if (applyNewerLocalSnapshot()) return
        if (pendingHydration) {
          applyDocumentHydration(snapshot, pendingHydration)
          return
        }
        if (requestStartCached?.sourceAuthority === "unknown" && requestStartCached.sha === null) {
          const resolvedDraft = {
            ...requestStartCached,
            sourceAuthority: "editable" as const,
            sourceDiagnostic: undefined,
          }
          writeCachedSnapshot(filePath, resolvedDraft)
          applySnapshot(filePath, resolvedDraft)
          return
        }
        writeCachedSnapshot(filePath, snapshot)
        applySnapshot(filePath, snapshot)
      } catch (error) {
        if (requestVersionRef.current === requestVersion) {
          console.error("Failed to open file", error)
          const pendingHydration = takePendingDocumentHydration()
          if (applyNewerLocalSnapshot()) {
            return
          }
          if (pendingHydration) {
            if (remotePathAbsent) {
              applyDocumentHydration(requestStartCached ?? emptySnapshot, pendingHydration)
            } else {
              applyDocumentHydration(
                requestStartCached ?? { ...emptySnapshot, sourceAuthority: "unknown" },
                pendingHydration,
              )
            }
            return
          }
          if (requestStartCached && requestStartHasLocalSnapshot) {
            if (remotePathAbsent && requestStartCached.sourceAuthority === "unknown") {
              const resolvedDraft = { ...requestStartCached, sourceAuthority: "editable" as const }
              writeCachedSnapshot(filePath, resolvedDraft)
              applySnapshot(filePath, resolvedDraft)
            } else {
              applySnapshot(filePath, requestStartCached)
            }
          } else if (remotePathAbsent) {
            applySnapshot(filePath, emptySnapshot)
          }
        }
      } finally {
        if (remoteReadVersionRef.current.get(filePath) === requestVersion) {
          remoteReadVersionRef.current.delete(filePath)
        }
        if (pendingDocumentHydrationRef.current.get(filePath)?.requestVersion === requestVersion) {
          pendingDocumentHydrationRef.current.delete(filePath)
        }
        if (requestVersionRef.current === requestVersion) {
          setIsFileLoading(false)
        }
      }
    },
    [
      owner,
      repo,
      baseCommitSha,
      syncBrowserUrl,
      applySnapshot,
      resolveFileNode,
      trackRecentFile,
      deleteCachedSnapshot,
      writeCachedSnapshot,
    ],
  )

  const readPathFromUrl = React.useCallback(() => {
    if (typeof window === "undefined") return ""

    const url = new URL(window.location.href)
    const queryPath = url.searchParams.get("file")
    if (queryPath) return queryPath

    const prefix = `/dashboard/${owner}/${repo}/studio/`
    if (url.pathname.startsWith(prefix)) {
      const rawPath = url.pathname.slice(prefix.length)
      if (rawPath) return toRepoPath(contentRoot, decodeURIComponent(rawPath))
    }

    return ""
  }, [owner, repo, contentRoot])

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
      const initialFileKey = `${initialFile.path}:${initialFile.sha}`
      if (initialFileAppliedKeyRef.current !== initialFileKey) {
        initialFileAppliedKeyRef.current = initialFileKey
        const snapshot = parseFileSnapshot(initialFile.content, initialFile.sha, initialFile.path)
        writeCachedSnapshot(initialFile.path, snapshot)
        applySnapshot(initialFile.path, snapshot)
        syncBrowserUrl(initialFile.path, "replace")
      }
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

    // Don't validate open files against an empty tree - the real tree is still loading client-side.
    // Filtering against [] would wipe all open tabs and overwrite localStorage before tree arrives.
    if (tree.length === 0) return

    // Use functional updater to avoid including openFiles in deps (prevents double-execution)
    let restoreTarget: string | undefined
    setOpenFiles((prev) => {
      const validOpenFiles = prev.filter((path) => findTreeNode(tree, path)?.type === "file")

      const storedSelectedPath =
        typeof window !== "undefined" ? (localStorage.getItem(selectedFileStorageKey) ?? "") : ""
      const fallbackPath = validOpenFiles[validOpenFiles.length - 1]
      restoreTarget =
        storedSelectedPath && validOpenFiles.includes(storedSelectedPath) ? storedSelectedPath : fallbackPath

      return validOpenFiles.length !== prev.length ? validOpenFiles : prev
    })

    if (restoreTarget) {
      const cached = fileCacheRef.current.get(restoreTarget)
      if (cached) {
        applySnapshot(restoreTarget, cached)
      } else {
        void openFile(restoreTarget, "replace")
      }
      return
    }

    clearSelection("replace")
  }, [
    initialFile,
    currentPath,
    openFilesHydrated,
    tree,
    selectedFileStorageKey,
    applySnapshot,
    clearSelection,
    openFile,
    syncBrowserUrl,
    writeCachedSnapshot,
  ])

  React.useEffect(() => {
    const path = selectedFile?.path
    if (!path) return
    const snapshot = fileCacheRef.current.get(path)
    if (!snapshot) return
    const resolved = resolveFileNode(path, snapshot.sha)
    // Only update if the resolved node actually differs to avoid re-render loops
    // when `tree` changes referentially but the node for this path is identical.
    setSelectedFile((prev) => {
      if (prev && prev.path === resolved.path && prev.sha === resolved.sha && prev.type === resolved.type) {
        return prev
      }
      return resolved
    })
  }, [selectedFile?.path, resolveFileNode])

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
      setOpenFiles((prev) => {
        const next = prev.filter((item) => item !== path)
        if (selectedFile?.path === path) {
          if (next.length === 0) {
            queueMicrotask(() => clearSelection("push"))
          } else {
            const currentIndex = prev.indexOf(path)
            const fallbackIndex = currentIndex > 0 ? currentIndex - 1 : 0
            const fallbackPath = next[Math.min(fallbackIndex, next.length - 1)]
            if (fallbackPath) queueMicrotask(() => openFile(fallbackPath, "push"))
          }
        }
        return next
      })
    },
    [selectedFile?.path, clearSelection, openFile],
  )

  const discardFileFromClientState = React.useCallback(
    (path: string) => {
      deleteCachedSnapshot(path)
      setRecentFiles((prev) => prev.filter((item) => item !== path))
      closeFile(path)
    },
    [closeFile, deleteCachedSnapshot],
  )

  const reloadFileFromRemote = React.useCallback(
    (path: string) => {
      deleteCachedSnapshot(path)
      if (selectedFile?.path === path) {
        void openFile(path, "replace")
      }
    },
    [selectedFile?.path, openFile, deleteCachedSnapshot],
  )

  const hydrateFromDocument = React.useCallback(
    (doc: { body?: unknown; frontmatter?: unknown }) => {
      try {
        const draftBody = typeof doc.body === "string" ? doc.body : null
        const draftFrontmatter = doc.frontmatter && typeof doc.frontmatter === "object" ? doc.frontmatter : null
        // Title synchronization creates index rows without draft content. Those
        // rows must not become empty local snapshots that outrank the Git read.
        if (draftBody === null && draftFrontmatter === null) return false

        const activePath = selectedFile?.path
        if (!activePath) return false

        const cached = fileCacheRef.current.get(activePath)
        if (cached?.sourceAuthority === "read-only") return false
        // The editor is interactive before the Convex query necessarily
        // settles. Never let a late saved draft overwrite newer local input.
        if (cached?.isDirty) return true

        let nextContent = cached?.content ?? ""
        let nextFrontmatter = cached?.frontmatter ?? {}
        const currentSha = cached?.sha ?? null

        if (draftBody !== null) {
          nextContent = draftBody
          setContent(draftBody)
        }
        if (draftFrontmatter !== null) {
          nextFrontmatter = normalizeFrontmatterDates(draftFrontmatter as Record<string, unknown>) as Record<
            string,
            unknown
          >
          setFrontmatter(nextFrontmatter)
        }

        const remoteReadVersion = remoteReadVersionRef.current.get(activePath)
        if (remoteReadVersion !== undefined) {
          pendingDocumentHydrationRef.current.set(activePath, {
            requestVersion: remoteReadVersion,
            body: draftBody,
            frontmatter: draftFrontmatter === null ? null : nextFrontmatter,
          })
          setIsDirty(false)
          return true
        }

        writeCachedSnapshot(activePath, {
          content: nextContent,
          frontmatter: nextFrontmatter,
          sha: currentSha,
          isDirty: false,
          sourceAuthority: cached?.sourceAuthority ?? sourceAuthority,
          sourceDiagnostic: cached?.sourceDiagnostic,
        })

        setIsDirty(false)
        return true
      } catch (error) {
        console.error("Error hydrating from Convex document draft:", error)
        return false
      }
    },
    [selectedFile?.path, sourceAuthority, writeCachedSnapshot],
  )

  const handleContentChange = React.useCallback(
    (newContent: string) => {
      if (!isSourceEditable) return
      setContent(newContent)
      setIsDirty(true)
      if (selectedFile?.path) {
        writeCachedSnapshot(selectedFile.path, {
          content: newContent,
          frontmatter,
          sha,
          isDirty: true,
          sourceAuthority,
          sourceDiagnostic,
        })
      }
    },
    [selectedFile?.path, frontmatter, sha, isSourceEditable, sourceAuthority, sourceDiagnostic, writeCachedSnapshot],
  )

  const handleFrontmatterChangeKey = React.useCallback(
    (key: string, value: unknown) => {
      if (!isSourceEditable) return
      setFrontmatter((prev) => {
        const next = { ...prev, [key]: value }
        if (selectedFile?.path) {
          writeCachedSnapshot(selectedFile.path, {
            content,
            frontmatter: next,
            sha,
            isDirty: true,
            sourceAuthority,
            sourceDiagnostic,
          })
        }
        return next
      })
      setIsDirty(true)
    },
    [selectedFile?.path, content, sha, isSourceEditable, sourceAuthority, sourceDiagnostic, writeCachedSnapshot],
  )

  const handleFrontmatterChangeAll = React.useCallback(
    (nextFrontmatter: Record<string, unknown>) => {
      if (!isSourceEditable) return
      setFrontmatter(nextFrontmatter)
      setIsDirty(true)
      if (selectedFile?.path) {
        writeCachedSnapshot(selectedFile.path, {
          content,
          frontmatter: nextFrontmatter,
          sha,
          isDirty: true,
          sourceAuthority,
          sourceDiagnostic,
        })
      }
    },
    [selectedFile?.path, content, sha, isSourceEditable, sourceAuthority, sourceDiagnostic, writeCachedSnapshot],
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
    sourceAuthority,
    isSourceEditable,
    sourceDiagnostic,
    navigateToFile,
    clearSelection,
    closeFile,
    discardFileFromClientState,
    reloadFileFromRemote,
    primeFileSnapshot,
    setContent: handleContentChange,
    setFrontmatterKey: handleFrontmatterChangeKey,
    setFrontmatter: handleFrontmatterChangeAll,
    hydrateFromDocument,
  }
}
