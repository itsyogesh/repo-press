import { assertContentPath, toContentPath, toRepoPath } from "../preview/path-policy"

export function treePathToContentPath(contentRoot: string, repoPath: string): string {
  return toContentPath(contentRoot, repoPath)
}

export function resolveStudioCreatePaths(
  contentRoot: string,
  parentRepoPath: string,
  fileName: string,
): { repoPath: string; contentPath: string } {
  const safeFileName = assertContentPath(fileName)
  if (!parentRepoPath) {
    return {
      repoPath: toRepoPath(contentRoot, safeFileName),
      contentPath: safeFileName,
    }
  }

  const repoPath = `${assertContentPath(parentRepoPath)}/${safeFileName}`
  const contentPath = toContentPath(contentRoot, repoPath)
  return {
    repoPath: toRepoPath(contentRoot, contentPath),
    contentPath,
  }
}

export function prepareTitleSyncFiles(
  contentRoot: string,
  files: readonly { path: string; sha: string }[],
): { path: string; repoPath: string; sha: string }[] {
  return files.map((file) => {
    const path = toContentPath(contentRoot, file.path)
    return {
      path,
      repoPath: toRepoPath(contentRoot, path),
      sha: file.sha,
    }
  })
}
