import { getFileContent, getRepoContents } from "@/lib/github"
import { allAdapters } from "./adapters"
import type { DetectionContext, FrameworkAdapter, FrameworkConfig } from "./types"

// Mutable adapter registry — starts with built-in adapters
const registry: FrameworkAdapter[] = [...allAdapters]

export function registerAdapter(adapter: FrameworkAdapter) {
  const idx = registry.findIndex((a) => a.id === adapter.id)
  if (idx >= 0) {
    registry[idx] = adapter
  } else {
    registry.push(adapter)
  }
}

export function unregisterAdapter(id: string) {
  const idx = registry.findIndex((a) => a.id === id)
  if (idx >= 0) registry.splice(idx, 1)
}

export function getRegisteredAdapters(): readonly FrameworkAdapter[] {
  return registry
}

/**
 * Build a DetectionContext by fetching package.json, root file listing,
 * and optionally contentRoot file listing.
 * The readFile function is lazily cached per path.
 */
export async function buildDetectionContext(
  token: string,
  owner: string,
  repo: string,
  branch?: string,
  contentRoot?: string,
): Promise<DetectionContext> {
  let packageJson: Record<string, unknown> | null = null
  let rootFileNames: string[] = []
  let contentRootFileNames: string[] = []

  try {
    const content = await getFileContent(token, owner, repo, "package.json", branch)
    if (content) {
      packageJson = JSON.parse(content)
    }
  } catch {
    // No package.json — could be Hugo, Jekyll, or non-JS framework
  }

  try {
    const rootFiles = await getRepoContents(token, owner, repo, "", branch)
    rootFileNames = rootFiles.map((f) => f.name)
  } catch {
    // Can't read root
  }

  // Fetch contentRoot file listing if specified and different from root
  if (contentRoot) {
    try {
      const contentRootFiles = await getRepoContents(token, owner, repo, contentRoot, branch)
      contentRootFileNames = contentRootFiles.map((f) => f.name)
    } catch {
      // Can't read contentRoot
    }
  }

  const deps: Record<string, string> = {
    ...((packageJson?.dependencies as Record<string, string>) || {}),
    ...((packageJson?.devDependencies as Record<string, string>) || {}),
  }

  // Lazy, cached readFile
  const fileCache = new Map<string, string | null>()
  const readFile = async (path: string): Promise<string | null> => {
    if (fileCache.has(path)) return fileCache.get(path)!
    try {
      const result = await getFileContent(token, owner, repo, path, branch)
      fileCache.set(path, result)
      return result
    } catch {
      fileCache.set(path, null)
      return null
    }
  }

  return {
    deps,
    packageJson,
    rootFileNames,
    readFile,
    contentRoot: contentRoot || "",
    contentRootFileNames,
  }
}

function adapterToConfig(
  adapter: FrameworkAdapter,
  result: { contentType: string; suggestedContentRoots?: string[] },
): FrameworkConfig {
  return {
    framework: adapter.id,
    displayName: adapter.displayName,
    contentType: result.contentType as FrameworkConfig["contentType"],
    suggestedContentRoots: result.suggestedContentRoots || adapter.defaultContentRoots,
    frontmatterFields: adapter.fields,
    fieldVariants: adapter.fieldVariants,
    metaFilePattern: adapter.metaFilePattern,
    contentArchitecture: adapter.contentArchitecture,
    previewEntry: adapter.previewEntry ?? null,
  }
}

/**
 * Run all adapter detect() + detectInFolder() functions concurrently.
 * The highest combined score wins. Falls back to the custom adapter if nothing matches.
 */
export async function detectFramework(
  token: string,
  owner: string,
  repo: string,
  branch?: string,
  contentRoot?: string,
): Promise<FrameworkConfig> {
  const ctx = await buildDetectionContext(token, owner, repo, branch, contentRoot)

  const results = await Promise.allSettled(
    registry.map(async (adapter) => {
      const repoResult = await adapter.detect(ctx)
      let folderScore = 0
      let folderContentType = repoResult.contentType

      // Run folder-level detection if adapter supports it and contentRoot is set
      if (adapter.detectInFolder && ctx.contentRoot) {
        try {
          const folderResult = await adapter.detectInFolder(ctx)
          folderScore = folderResult.score
          if (folderResult.contentType) folderContentType = folderResult.contentType
        } catch {
          // Folder detection failed — continue with repo-level score only
        }
      }

      return {
        adapter,
        result: {
          score: repoResult.score + folderScore,
          contentType: folderContentType,
          suggestedContentRoots: repoResult.suggestedContentRoots,
        },
      }
    }),
  )

  let bestAdapter: FrameworkAdapter | null = null
  let bestResult: {
    score: number
    contentType: string
    suggestedContentRoots?: string[]
  } | null = null

  for (const entry of results) {
    if (entry.status !== "fulfilled") continue
    const { adapter, result } = entry.value
    if (result.score > 0 && (!bestResult || result.score > bestResult.score)) {
      bestAdapter = adapter
      bestResult = result
    }
  }

  if (!bestAdapter || !bestResult) {
    // Fallback to custom
    const custom = registry.find((a) => a.id === "custom")!
    return adapterToConfig(custom, { contentType: "custom" })
  }

  return adapterToConfig(bestAdapter, bestResult)
}

/**
 * Get the config for a known adapter ID without running detection.
 * Used when loading stored projects.
 */
export function getFrameworkConfig(frameworkId: string): FrameworkConfig {
  const adapter = registry.find((a) => a.id === frameworkId)
  if (!adapter) {
    const custom = registry.find((a) => a.id === "custom")!
    return adapterToConfig(custom, { contentType: "custom" })
  }
  return adapterToConfig(adapter, {
    contentType: adapter.fields.length > 3 ? "blog" : "custom",
    suggestedContentRoots: adapter.defaultContentRoots,
  })
}
