import path from "node:path"

type ImageUsage = "frontmatter" | "component" | "editor"

interface GetAuthoredImageValueArgs {
  repoPath: string
  selectedFilePath?: string
  usage: ImageUsage
  fieldName?: string
  semanticRole?: string
}

function toPublicAssetPath(repoPath: string): string {
  if (repoPath.startsWith("/public/")) {
    return repoPath.slice("/public".length)
  }
  if (repoPath.startsWith("public/")) {
    return `/${repoPath.slice("public".length)}`
  }
  return repoPath
}

function isBlogCoverField(fieldName?: string, semanticRole?: string): boolean {
  const normalizedField = fieldName?.toLowerCase()
  return semanticRole === "image" || normalizedField === "image" || normalizedField === "coverimage"
}

export function getAuthoredImageValue({ repoPath, usage, fieldName, semanticRole }: GetAuthoredImageValueArgs): string {
  if (usage === "frontmatter" && isBlogCoverField(fieldName, semanticRole)) {
    return path.posix.basename(repoPath)
  }

  return toPublicAssetPath(repoPath)
}
