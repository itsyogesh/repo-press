import path from "node:path"
import { getFile } from "@/lib/github"
import { buildRequestScopeId, executeGitHubRequest } from "@/lib/repopress/github-request-control"

const IMPORT_RE = /(?:import|export)\s+(?:[^"'`]*?\sfrom\s*)?["']([^"']+)["']|import\(\s*["']([^"']+)["']\s*\)/g

function normalizeRepoPath(filePath: string) {
  return filePath.replace(/\\/g, "/").replace(/^\.?\//, "")
}

function extractRelativeImports(source: string) {
  const imports = new Set<string>()
  for (const match of source.matchAll(IMPORT_RE)) {
    const specifier = match[1] || match[2]
    if (specifier && (specifier.startsWith("./") || specifier.startsWith("../"))) {
      imports.add(specifier)
    }
  }
  return Array.from(imports)
}

function candidatePaths(fromPath: string, specifier: string) {
  const fromDir = path.posix.dirname(normalizeRepoPath(fromPath))
  const base = path.posix.normalize(path.posix.join(fromDir, specifier))
  const ext = path.posix.extname(base)

  if (ext) {
    return [base]
  }

  return [
    `${base}.ts`,
    `${base}.tsx`,
    `${base}.js`,
    `${base}.jsx`,
    `${base}.mjs`,
    `${base}.cjs`,
    path.posix.join(base, "index.ts"),
    path.posix.join(base, "index.tsx"),
    path.posix.join(base, "index.js"),
    path.posix.join(base, "index.jsx"),
    path.posix.join(base, "index.mjs"),
    path.posix.join(base, "index.cjs"),
  ]
}

function buildBundleSha(entries: Array<{ path: string; sha: string }>) {
  return entries
    .sort((a, b) => a.path.localeCompare(b.path))
    .map((entry) => `${entry.path}:${entry.sha}`)
    .join("|")
}

export async function collectRepoModuleBundle({
  token,
  owner,
  repo,
  branch,
  entryPath,
}: {
  token: string
  owner: string
  repo: string
  branch: string
  entryPath: string
}) {
  const scope = buildRequestScopeId(token)
  const normalizedEntryPath = normalizeRepoPath(entryPath)
  const sources: Record<string, string> = {}
  const shas: Array<{ path: string; sha: string }> = []
  let rateLimited = false
  let retryCount = 0

  const fetchModule = async (repoPath: string) => {
    const requestResult = await executeGitHubRequest({
      key: `repo-module:${scope}:${owner}/${repo}@${branch}:${repoPath}`,
      request: () => getFile(token, owner, repo, repoPath, branch),
    })
    rateLimited ||= requestResult.rateLimited
    retryCount += requestResult.retryCount
    return requestResult.value
  }

  const visit = async (repoPath: string): Promise<void> => {
    if (sources[repoPath] !== undefined) {
      return
    }

    const file = await fetchModule(repoPath)
    if (!file) {
      throw new Error(`Module not found at ${repoPath}`)
    }

    sources[repoPath] = file.content
    shas.push({ path: repoPath, sha: file.sha })

    for (const specifier of extractRelativeImports(file.content)) {
      let resolvedPath: string | null = null
      for (const candidate of candidatePaths(repoPath, specifier)) {
        const candidateFile = await fetchModule(candidate)
        if (candidateFile) {
          sources[candidate] = candidateFile.content
          shas.push({ path: candidate, sha: candidateFile.sha })
          resolvedPath = candidate
          break
        }
      }

      if (!resolvedPath) {
        throw new Error(`Unable to resolve ${specifier} from ${repoPath}`)
      }

      await visit(resolvedPath)
    }
  }

  await visit(normalizedEntryPath)

  return {
    entryPath: normalizedEntryPath,
    entrySource: sources[normalizedEntryPath],
    sources,
    sha: buildBundleSha(shas),
    rateLimited,
    retryCount,
  }
}
