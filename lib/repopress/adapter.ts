import { getFileContent } from "@/lib/github"
import * as esbuild from "esbuild-wasm"

export interface ResolvedPreviewContext {
  components: Record<string, any>
  scope: Record<string, unknown>
  allowImports: Record<string, Record<string, unknown>>
  diagnostics: string[]
}

// Temporary in-memory cache for transpiled adapters
const adapterCache = new Map<string, string>()

export async function loadPreviewAdapter(
  token: string,
  owner: string,
  repo: string,
  branch: string,
  entryPath: string
): Promise<{ source: string | null; error: string | null }> {
  const cacheKey = `${owner}/${repo}@${branch}:${entryPath}`
  
  if (adapterCache.has(cacheKey)) {
    return { source: adapterCache.get(cacheKey)!, error: null }
  }

  try {
    const content = await getFileContent(token, owner, repo, entryPath, branch)
    
    if (!content) {
      return { source: null, error: `Adapter file not found at ${entryPath}` }
    }

    // Initialize esbuild if not already initialized
    if (!esbuild.default) {
       // We'll need a different way to run esbuild in the server or we run it in Next.js edge/browser
    }

    return { source: content, error: null }
  } catch (error: any) {
    return { source: null, error: error.message }
  }
}
