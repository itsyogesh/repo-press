import { type GitHubTextFileSnapshot, getBranchHeadSha, getTextFilesAtCommit } from "@/lib/github"
import { repoPressLockSchema } from "./lock-schema"
import { compareCodeUnits, deepFreeze, type NormalizedAuthoringMetadata } from "./registry-schema"

const MAX_PROJECT_ROOT_DEPTH = 16
const MAX_CONTENT_ROOT_BYTES = 2_048

export type ProjectLockAuthority = Readonly<{
  repoOwner: string
  repoName: string
  branch: string
  contentRoot: string
}>

export type ProjectLockAuthoringMetadata = Readonly<Record<string, NormalizedAuthoringMetadata>>

export type ProjectLockAuthoringResult = Readonly<{
  baseSha: string
  lockPath: string | null
  metadata: ProjectLockAuthoringMetadata
  diagnostics: readonly string[]
}>

function emptyMetadata(): ProjectLockAuthoringMetadata {
  return Object.freeze({})
}

function hasControlOrBidi(value: string): boolean {
  for (const character of value) {
    const code = character.codePointAt(0) ?? 0
    if (code < 0x20 || code === 0x7f || (code >= 0x202a && code <= 0x202e) || (code >= 0x2066 && code <= 0x2069)) {
      return true
    }
  }
  return false
}

function normalizeContentRoot(contentRoot: string): string[] {
  if (
    typeof contentRoot !== "string" ||
    Buffer.byteLength(contentRoot, "utf8") > MAX_CONTENT_ROOT_BYTES ||
    contentRoot.startsWith("/") ||
    contentRoot.includes("\\") ||
    hasControlOrBidi(contentRoot)
  ) {
    throw new TypeError("Project content root must be a safe repository-relative path")
  }
  const segments: string[] = []
  for (const segment of contentRoot.normalize("NFC").split("/")) {
    if (segment === "" || segment === ".") continue
    if (segment === "..") throw new TypeError("Project content root escapes the repository root")
    segments.push(segment)
  }
  if (segments.length > MAX_PROJECT_ROOT_DEPTH) throw new TypeError("Project content root is too deep")
  return segments
}

/** Candidate runtime roots, closest to the configured content tree first. */
export function projectLockCandidatePaths(contentRoot: string): readonly string[] {
  const segments = normalizeContentRoot(contentRoot)
  const paths: string[] = []
  for (let end = Math.max(0, segments.length - 1); end >= 0; end -= 1) {
    const root = segments.slice(0, end).join("/")
    paths.push(root ? `${root}/repopress.lock.json` : "repopress.lock.json")
  }
  return Object.freeze([...new Set(paths)])
}

function snapshotMap(snapshots: readonly GitHubTextFileSnapshot[]): ReadonlyMap<string, string> {
  if (!Array.isArray(snapshots)) throw new TypeError("Repository snapshots must be an array")
  const result = new Map<string, string>()
  for (let index = 0; index < snapshots.length; index += 1) {
    const descriptor = Object.getOwnPropertyDescriptor(snapshots, String(index))
    if (!descriptor || !("value" in descriptor)) throw new TypeError("Repository snapshot must be a data value")
    const snapshot = descriptor.value as GitHubTextFileSnapshot
    if (!snapshot || typeof snapshot !== "object" || Array.isArray(snapshot)) {
      throw new TypeError("Repository snapshot must be an object")
    }
    const pathDescriptor = Object.getOwnPropertyDescriptor(snapshot, "path")
    const contentDescriptor = Object.getOwnPropertyDescriptor(snapshot, "content")
    if (
      !pathDescriptor ||
      !("value" in pathDescriptor) ||
      typeof pathDescriptor.value !== "string" ||
      !contentDescriptor ||
      !("value" in contentDescriptor) ||
      typeof contentDescriptor.value !== "string" ||
      result.has(pathDescriptor.value)
    ) {
      throw new TypeError("Repository snapshot fields must be unique data values")
    }
    result.set(pathDescriptor.value, contentDescriptor.value)
  }
  return result
}

export function projectLockAuthoringFromSnapshots(
  baseSha: string,
  candidatePaths: readonly string[],
  snapshots: readonly GitHubTextFileSnapshot[],
): ProjectLockAuthoringResult {
  const indexed = snapshotMap(snapshots)
  const lockPath = candidatePaths.find((candidate) => indexed.has(candidate)) ?? null
  if (!lockPath) return deepFreeze({ baseSha, lockPath: null, metadata: emptyMetadata(), diagnostics: [] })

  let parsedJson: unknown
  try {
    parsedJson = JSON.parse(indexed.get(lockPath) as string) as unknown
  } catch {
    return deepFreeze({
      baseSha,
      lockPath,
      metadata: emptyMetadata(),
      diagnostics: [`Invalid registry lock snapshot at ${lockPath}`],
    })
  }
  const parsed = repoPressLockSchema.safeParse(parsedJson)
  if (!parsed.success) {
    return deepFreeze({
      baseSha,
      lockPath,
      metadata: emptyMetadata(),
      diagnostics: [`Invalid registry lock snapshot at ${lockPath}`],
    })
  }

  const metadata: Record<string, NormalizedAuthoringMetadata> = {}
  const entries = Object.values(parsed.data.items).sort((left, right) =>
    compareCodeUnits(left.authoring.mdxName, right.authoring.mdxName),
  )
  for (const entry of entries) {
    const mdxName = entry.authoring.mdxName
    if (Object.hasOwn(metadata, mdxName)) {
      return deepFreeze({
        baseSha,
        lockPath,
        metadata: emptyMetadata(),
        diagnostics: [`Registry lock snapshot has duplicate MDX name ${mdxName}`],
      })
    }
    Object.defineProperty(metadata, mdxName, {
      value: entry.authoring,
      enumerable: true,
      configurable: false,
      writable: false,
    })
  }
  return deepFreeze({ baseSha, lockPath, metadata, diagnostics: [] })
}

/** Load installed declarative metadata using only the authenticated project authority. */
export async function loadProjectLockAuthoringMetadata({
  accessToken,
  project,
}: {
  accessToken: string
  project: ProjectLockAuthority
}): Promise<ProjectLockAuthoringResult> {
  const candidatePaths = projectLockCandidatePaths(project.contentRoot)
  const baseSha = await getBranchHeadSha(accessToken, project.repoOwner, project.repoName, project.branch)
  const snapshots = await getTextFilesAtCommit(
    accessToken,
    project.repoOwner,
    project.repoName,
    baseSha,
    candidatePaths,
  )
  return projectLockAuthoringFromSnapshots(baseSha, candidatePaths, snapshots)
}
