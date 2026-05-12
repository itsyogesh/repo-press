import path from "node:path"

export type RepoPressResolvedRuntime = {
  strategy: "native" | "override" | "generic-fallback"
  entryPath: string | null
  rootPath: string | null
  metadataDefault: "frontmatter" | "metadata-export"
  extensions: [".md", ".mdx", ".markdown"]
}

export type ResolveRuntimeOptions = {
  owner: string
  repo: string
  branch: string
  framework: string
  contentRoot: string
  overrideEntry?: string | null
  readFile: (path: string) => Promise<string | null>
}

const SUPPORTED_EXTENSIONS: [".md", ".mdx", ".markdown"] = [".md", ".mdx", ".markdown"]
const MARKDOWN_FIRST_FRAMEWORKS = new Set(["hugo", "jekyll"])
const RUNTIME_ENTRY_CANDIDATES = ["mdx-components.tsx", "mdx-components.ts", "mdx-components.jsx", "mdx-components.js"]

function toPosixPath(value: string) {
  return value.replace(/\\/g, "/").replace(/^\/+|\/+$/g, "")
}

function dirnameOrRoot(filePath: string) {
  const dir = path.posix.dirname(toPosixPath(filePath))
  return dir === "." ? "" : dir
}

function metadataDefaultForFramework(framework: string, contentRoot: string) {
  const normalizedRoot = toPosixPath(contentRoot)

  if (framework === "next-mdx" && (normalizedRoot === "app" || normalizedRoot.startsWith("app/"))) {
    return "metadata-export" as const
  }

  return "frontmatter" as const
}

function fallbackRuntime(framework: string, contentRoot: string): RepoPressResolvedRuntime {
  return {
    strategy: "generic-fallback",
    entryPath: null,
    rootPath: null,
    metadataDefault: metadataDefaultForFramework(framework, contentRoot),
    extensions: SUPPORTED_EXTENSIONS,
  }
}

async function findNearestRuntimeEntry(
  contentRoot: string,
  readFile: ResolveRuntimeOptions["readFile"],
): Promise<{ entryPath: string; rootPath: string } | null> {
  const normalizedRoot = toPosixPath(contentRoot)
  const segments = normalizedRoot ? normalizedRoot.split("/") : []

  for (let depth = segments.length; depth >= 0; depth -= 1) {
    const basePath = segments.slice(0, depth).join("/")
    for (const candidate of RUNTIME_ENTRY_CANDIDATES) {
      const candidatePath = basePath ? `${basePath}/${candidate}` : candidate
      const file = await readFile(candidatePath)
      if (file != null) {
        return {
          entryPath: candidatePath,
          rootPath: dirnameOrRoot(candidatePath),
        }
      }
    }
  }

  return null
}

export async function resolveResolvedRuntime(options: ResolveRuntimeOptions): Promise<RepoPressResolvedRuntime> {
  const normalizedFramework = options.framework.trim().toLowerCase()

  if (options.overrideEntry) {
    return {
      strategy: "override",
      entryPath: options.overrideEntry,
      rootPath: dirnameOrRoot(options.overrideEntry),
      metadataDefault: metadataDefaultForFramework(normalizedFramework, options.contentRoot),
      extensions: SUPPORTED_EXTENSIONS,
    }
  }

  if (MARKDOWN_FIRST_FRAMEWORKS.has(normalizedFramework)) {
    return fallbackRuntime(normalizedFramework, options.contentRoot)
  }

  const nativeRuntime = await findNearestRuntimeEntry(options.contentRoot, options.readFile)
  if (nativeRuntime) {
    return {
      strategy: "native",
      entryPath: nativeRuntime.entryPath,
      rootPath: nativeRuntime.rootPath,
      metadataDefault: metadataDefaultForFramework(normalizedFramework, options.contentRoot),
      extensions: SUPPORTED_EXTENSIONS,
    }
  }

  return fallbackRuntime(normalizedFramework, options.contentRoot)
}
