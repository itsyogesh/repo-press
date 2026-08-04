import { existsSync, readFileSync, readdirSync, statSync } from "node:fs"
import { dirname, join, relative, resolve } from "node:path"
import { fileURLToPath } from "node:url"

const repositoryRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..")
const expectedWorkspacePatterns = ["apps/*", "packages/*"]
const expectedApplications = ["apps/docs", "apps/web"]
const packageLockNames = new Set(["bun.lock", "bun.lockb", "package-lock.json", "pnpm-lock.yaml", "yarn.lock"])
const ignoredDirectories = new Set([".agents", ".claude", ".codex", ".git", ".next", ".worktrees", "node_modules"])

function readManifest(path) {
  try {
    return JSON.parse(readFileSync(path, "utf8"))
  } catch (error) {
    throw new Error(`Could not read ${relative(repositoryRoot, path)}: ${error.message}`)
  }
}

function findLockfiles(directory, lockfiles = []) {
  for (const entry of readdirSync(directory)) {
    if (ignoredDirectories.has(entry)) continue

    const path = join(directory, entry)
    if (statSync(path).isDirectory()) {
      findLockfiles(path, lockfiles)
    } else if (packageLockNames.has(entry)) {
      lockfiles.push(relative(repositoryRoot, path))
    }
  }

  return lockfiles
}

const errors = []
const rootManifest = readManifest(join(repositoryRoot, "package.json"))
const lockfile = readManifest(join(repositoryRoot, "package-lock.json"))
const ciWorkflow = readFileSync(join(repositoryRoot, ".github/workflows/ci.yml"), "utf8")

if (rootManifest.private !== true) errors.push("the root package must be private")
if (!ciWorkflow.includes("npm run docs:validate")) {
  errors.push("CI must run npm run docs:validate as an explicit required check")
}

const workspacePatterns = Array.isArray(rootManifest.workspaces) ? [...rootManifest.workspaces].sort() : []
if (JSON.stringify(workspacePatterns) !== JSON.stringify(expectedWorkspacePatterns)) {
  errors.push(`workspaces must be exactly ${expectedWorkspacePatterns.join(", ")}`)
}

for (const application of expectedApplications) {
  const manifestPath = join(repositoryRoot, application, "package.json")
  if (!existsSync(manifestPath)) {
    errors.push(`${application}/package.json is missing`)
    continue
  }

  const manifest = readManifest(manifestPath)
  if (manifest.private !== true) errors.push(`${application} must be private`)
}

const manifestPaths = [join(repositoryRoot, "package.json")]
for (const workspaceDirectory of ["apps", "packages"]) {
  const directory = join(repositoryRoot, workspaceDirectory)
  if (!existsSync(directory)) continue

  for (const entry of readdirSync(directory, { withFileTypes: true })) {
    const manifestPath = join(directory, entry.name, "package.json")
    if (entry.isDirectory() && existsSync(manifestPath)) manifestPaths.push(manifestPath)
  }
}

const dependencySections = [
  "dependencies",
  "devDependencies",
  "optionalDependencies",
  "peerDependencies",
]
const remotionDependencies = manifestPaths.flatMap((manifestPath) => {
  const manifest = readManifest(manifestPath)
  return dependencySections.flatMap((section) =>
    Object.entries(manifest[section] ?? {}).filter(
      ([name]) => name === "remotion" || name.startsWith("@remotion/"),
    ),
  )
})
const remotionVersions = new Set(remotionDependencies.map(([, version]) => version))
const [remotionVersion] = remotionVersions

if (
  remotionDependencies.length === 0 ||
  remotionVersions.size !== 1 ||
  !/^\d+\.\d+\.\d+$/.test(remotionVersion ?? "")
) {
  errors.push("all Remotion dependencies must use one identical exact version")
}

const lockedRemotionVersions = new Set(
  Object.entries(lockfile.packages ?? {})
    .filter(
      ([path]) =>
        path.endsWith("node_modules/remotion") || /node_modules\/@remotion\/[^/]+$/.test(path),
    )
    .map(([, manifest]) => manifest.version)
    .filter(Boolean),
)

if (
  remotionVersion &&
  (lockedRemotionVersions.size !== 1 || !lockedRemotionVersions.has(remotionVersion))
) {
  errors.push("package-lock.json must resolve the entire Remotion family to the pinned version")
}

const unexpectedApplicationManifests = existsSync(join(repositoryRoot, "apps"))
  ? readdirSync(join(repositoryRoot, "apps"), { withFileTypes: true })
      .filter((entry) => entry.isDirectory() && existsSync(join(repositoryRoot, "apps", entry.name, "package.json")))
      .map((entry) => `apps/${entry.name}`)
      .filter((application) => !expectedApplications.includes(application))
  : []

if (unexpectedApplicationManifests.length > 0) {
  errors.push(`unexpected application workspaces: ${unexpectedApplicationManifests.join(", ")}`)
}

const lockfiles = findLockfiles(repositoryRoot).sort()
if (JSON.stringify(lockfiles) !== JSON.stringify(["package-lock.json"])) {
  errors.push(`the only repository lockfile must be package-lock.json (found: ${lockfiles.join(", ") || "none"})`)
}

if (errors.length > 0) {
  console.error("Workspace verification failed:")
  for (const error of errors) console.error(`- ${error}`)
  process.exitCode = 1
} else {
  console.log("Workspace verification passed: apps/web and apps/docs use the root npm lockfile.")
}
