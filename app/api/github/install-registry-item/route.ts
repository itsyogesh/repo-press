import { createHash } from "node:crypto"
import { ConvexHttpClient } from "convex/browser"
import { NextResponse } from "next/server"
import ts from "typescript"
import { api } from "@/convex/_generated/api"
import type { Doc, Id } from "@/convex/_generated/dataModel"
import {
  type BatchOperation,
  batchCommitAtExpectedHead,
  createBranchFromSha,
  createPullRequest,
  findOpenPullRequestByHead,
  getBranchHeadSha,
  getDedicatedBranchState,
  getTextFilesAtCommit,
} from "@/lib/github"
import { mintServerQueryToken } from "@/lib/project-access-token"
import {
  dryRunInstallPlan,
  type ProjectInstallLayout,
  planRegistryInstall,
  type RegistryInstallPlan,
  type RepositoryFileSnapshot,
} from "@/lib/repopress/install-plan"
import { repoPressLockSchema } from "@/lib/repopress/lock-schema"
import { type RegistrySourceInput, resolveRegistryItems } from "@/lib/repopress/registry-resolver"
import { canonicalizeInstallTarget, REGISTRY_LIMITS, registryItemSchema } from "@/lib/repopress/registry-schema"
import { RouteAuthError, resolveRouteAuth } from "@/lib/route-auth"

const convex = new ConvexHttpClient(process.env.NEXT_PUBLIC_CONVEX_URL!)
const MAX_REQUEST_BYTES = 32 * 1024
const MAX_REGISTRY_FILE_BYTES = 2 * 1024 * 1024
const MAX_REGISTRY_TOTAL_BYTES = 16 * 1024 * 1024
const REGISTRY_TIMEOUT_MS = 5_000
const MAX_REDIRECTS = 2
const SHA = /^[a-f0-9]{40}$/u
const PLAN_DIGEST = /^sha256:[a-f0-9]{64}$/u
const ITEM_INTEGRITY = /^sha256-[A-Za-z0-9+/]{43}=$/u
const IDEMPOTENCY_KEY = /^[A-Za-z0-9._:-]{8,64}$/u
const PROJECT_ID = /^[A-Za-z0-9_-]{1,128}$/u
const OFFICIAL_ITEM_URL = "https://repopress.dev/r/callout.json"
const OFFICIAL_ITEM_ROOT = "https://repopress.dev/registry/repopress/callout/"

const ALLOWED_REQUEST_KEYS = new Set([
  "projectId",
  "item",
  "dryRun",
  "expectedBaseSha",
  "expectedPlanDigest",
  "expectedItemIntegrity",
  "idempotencyKey",
])

type InstallRequest = {
  projectId: string
  item: string
  dryRun: boolean
  expectedBaseSha?: string
  expectedPlanDigest?: string
  expectedItemIntegrity?: string
  idempotencyKey?: string
}

class InstallRouteError extends Error {
  constructor(
    readonly code: string,
    readonly status: number,
    message: string,
    readonly details?: Record<string, unknown>,
  ) {
    super(message)
  }
}

function errorResponse(error: InstallRouteError): NextResponse {
  return NextResponse.json(
    { ok: false, code: error.code, error: error.message, ...(error.details ?? {}) },
    { status: error.status },
  )
}

async function parseRequest(request: Request): Promise<InstallRequest> {
  const contentType = request.headers.get("content-type")?.split(";", 1)[0]?.trim().toLowerCase()
  if (contentType !== "application/json") {
    throw new InstallRouteError("UNSUPPORTED_MEDIA_TYPE", 415, "Content-Type must be application/json")
  }
  const origin = request.headers.get("origin")
  if (!origin || origin !== new URL(request.url).origin) {
    throw new InstallRouteError("ORIGIN_REJECTED", 403, "Request origin is not allowed")
  }
  const declaredLength = request.headers.get("content-length")
  if (declaredLength && (!/^\d+$/u.test(declaredLength) || Number(declaredLength) > MAX_REQUEST_BYTES)) {
    throw new InstallRouteError("REQUEST_TOO_LARGE", 413, "Request body exceeds byte limit")
  }
  const source = await request.text()
  if (Buffer.byteLength(source, "utf8") > MAX_REQUEST_BYTES) {
    throw new InstallRouteError("REQUEST_TOO_LARGE", 413, "Request body exceeds byte limit")
  }
  let raw: unknown
  try {
    raw = JSON.parse(source) as unknown
  } catch {
    throw new InstallRouteError("INVALID_REQUEST", 400, "Request body must be valid JSON")
  }
  if (!raw || typeof raw !== "object" || Array.isArray(raw) || Object.getPrototypeOf(raw) !== Object.prototype) {
    throw new InstallRouteError("INVALID_REQUEST", 400, "Request body must be an object")
  }
  const input = raw as Record<string, unknown>
  const unknownKeys = Object.keys(input).filter((key) => !ALLOWED_REQUEST_KEYS.has(key))
  if (unknownKeys.length > 0) {
    throw new InstallRouteError("UNKNOWN_REQUEST_FIELD", 400, `Unsupported request field: ${unknownKeys.sort()[0]}`)
  }
  if (typeof input.projectId !== "string" || !PROJECT_ID.test(input.projectId)) {
    throw new InstallRouteError("INVALID_REQUEST", 400, "projectId is invalid")
  }
  if (typeof input.item !== "string" || input.item.length === 0 || input.item.length > 256) {
    throw new InstallRouteError("INVALID_REQUEST", 400, "item is invalid")
  }
  if (typeof input.dryRun !== "boolean") {
    throw new InstallRouteError("INVALID_REQUEST", 400, "dryRun must be a boolean")
  }
  if (
    input.expectedBaseSha !== undefined &&
    (typeof input.expectedBaseSha !== "string" || !SHA.test(input.expectedBaseSha))
  ) {
    throw new InstallRouteError("INVALID_REQUEST", 400, "expectedBaseSha must be a full Git commit SHA")
  }
  if (
    input.expectedPlanDigest !== undefined &&
    (typeof input.expectedPlanDigest !== "string" || !PLAN_DIGEST.test(input.expectedPlanDigest))
  ) {
    throw new InstallRouteError("INVALID_REQUEST", 400, "expectedPlanDigest must be a SHA-256 plan digest")
  }
  if (
    input.expectedItemIntegrity !== undefined &&
    (typeof input.expectedItemIntegrity !== "string" || !ITEM_INTEGRITY.test(input.expectedItemIntegrity))
  ) {
    throw new InstallRouteError("INVALID_REQUEST", 400, "expectedItemIntegrity must be SHA-256 SRI")
  }
  if (
    input.idempotencyKey !== undefined &&
    (typeof input.idempotencyKey !== "string" || !IDEMPOTENCY_KEY.test(input.idempotencyKey))
  ) {
    throw new InstallRouteError("INVALID_REQUEST", 400, "idempotencyKey is invalid")
  }
  if (!input.dryRun && input.expectedBaseSha === undefined) {
    throw new InstallRouteError("EXPECTED_BASE_REQUIRED", 400, "Publishing requires the reviewed base SHA")
  }
  if (!input.dryRun && input.idempotencyKey === undefined) {
    throw new InstallRouteError("IDEMPOTENCY_KEY_REQUIRED", 400, "Publishing requires an idempotency key")
  }
  if (!input.dryRun && input.expectedPlanDigest === undefined) {
    throw new InstallRouteError("EXPECTED_PLAN_REQUIRED", 400, "Publishing requires the reviewed plan digest")
  }
  if (!input.dryRun && input.expectedItemIntegrity === undefined) {
    throw new InstallRouteError("EXPECTED_ITEM_REQUIRED", 400, "Publishing requires the reviewed item integrity")
  }
  return input as InstallRequest
}

function normalizeRegistryManifestUrl(selector: string): URL {
  if (selector === "@repopress/callout") return new URL(OFFICIAL_ITEM_URL)
  let url: URL
  try {
    url = new URL(selector)
  } catch {
    throw new InstallRouteError("REGISTRY_ITEM_NOT_ALLOWED", 422, "Registry item is not allowlisted")
  }
  if (
    url.href !== OFFICIAL_ITEM_URL ||
    url.protocol !== "https:" ||
    url.username ||
    url.password ||
    url.port ||
    url.search ||
    url.hash
  ) {
    throw new InstallRouteError("REGISTRY_ITEM_NOT_ALLOWED", 422, "Registry URL is not allowlisted")
  }
  return url
}

function assertAllowedFetchUrl(url: URL, kind: "manifest" | "referenced-file"): void {
  const allowed = kind === "manifest" ? url.href === OFFICIAL_ITEM_URL : url.href.startsWith(OFFICIAL_ITEM_ROOT)
  if (
    !allowed ||
    url.protocol !== "https:" ||
    url.hostname !== "repopress.dev" ||
    url.username ||
    url.password ||
    url.port ||
    url.search ||
    url.hash
  ) {
    throw new InstallRouteError("REGISTRY_FETCH_REJECTED", 422, "Registry fetch target is not allowlisted")
  }
}

async function cancelResponseBody(response: Response): Promise<void> {
  try {
    const cancellation = response.body?.cancel()
    if (cancellation) void cancellation.catch(() => undefined)
  } catch {
    // Cancellation is best-effort and must not replace the primary refusal.
  }
}

async function readBounded(response: Response, maximum: number, signal: AbortSignal): Promise<string> {
  const declared = response.headers.get("content-length")
  if (declared && (!/^\d+$/u.test(declared) || Number(declared) > maximum)) {
    await cancelResponseBody(response)
    throw new InstallRouteError("REGISTRY_RESPONSE_TOO_LARGE", 422, "Registry response exceeds byte limit")
  }
  if (!response.body) return ""
  const reader = response.body.getReader()
  const chunks: Uint8Array[] = []
  let bytes = 0
  let primaryError: unknown
  let abortRead: (() => void) | undefined
  const aborted = new Promise<never>((_resolve, reject) => {
    abortRead = () => reject(new InstallRouteError("REGISTRY_FETCH_TIMEOUT", 422, "Registry response timed out"))
    if (signal.aborted) abortRead()
    else signal.addEventListener("abort", abortRead, { once: true })
  })
  try {
    while (true) {
      const result = await Promise.race([reader.read(), aborted])
      if (result.done) break
      bytes += result.value.byteLength
      if (bytes > maximum) {
        throw new InstallRouteError("REGISTRY_RESPONSE_TOO_LARGE", 422, "Registry response exceeds byte limit")
      }
      chunks.push(result.value)
    }
  } catch (error) {
    primaryError = error
    throw error
  } finally {
    if (primaryError !== undefined || signal.aborted) {
      try {
        const cancellation = reader.cancel()
        void cancellation.catch(() => undefined)
      } catch {
        // Preserve the primary error.
      }
    }
    if (abortRead) signal.removeEventListener("abort", abortRead)
    try {
      reader.releaseLock()
    } catch {
      // Preserve the primary error when the stream still has a pending read.
    }
  }
  const merged = new Uint8Array(bytes)
  let offset = 0
  for (const chunk of chunks) {
    merged.set(chunk, offset)
    offset += chunk.byteLength
  }
  try {
    return new TextDecoder("utf-8", { fatal: true }).decode(merged)
  } catch {
    throw new InstallRouteError("REGISTRY_RESPONSE_INVALID", 422, "Registry response is not valid UTF-8")
  }
}

async function fetchRegistryText(initial: URL, kind: "manifest" | "referenced-file", maximum: number): Promise<string> {
  let url = initial
  for (let redirects = 0; redirects <= MAX_REDIRECTS; redirects += 1) {
    assertAllowedFetchUrl(url, kind)
    const controller = new AbortController()
    const timeout = setTimeout(() => controller.abort(), REGISTRY_TIMEOUT_MS)
    let response: Response | undefined
    try {
      response = await fetch(url, {
        method: "GET",
        redirect: "manual",
        credentials: "omit",
        cache: "no-store",
        signal: controller.signal,
        headers: { Accept: kind === "manifest" ? "application/json" : "text/plain, application/octet-stream;q=0.8" },
      })
      if (response.status >= 300 && response.status < 400) {
        const location = response.headers.get("location")
        await cancelResponseBody(response)
        if (!location || redirects === MAX_REDIRECTS) {
          throw new InstallRouteError("REGISTRY_REDIRECT_REJECTED", 422, "Registry redirect was rejected")
        }
        url = new URL(location, url)
        continue
      }
      if (!response.ok) {
        await cancelResponseBody(response)
        throw new InstallRouteError("REGISTRY_FETCH_FAILED", 422, "Registry fetch failed")
      }
      if (kind === "manifest") {
        const contentType = response.headers.get("content-type")?.split(";", 1)[0]?.trim().toLowerCase()
        if (contentType !== "application/json" && contentType !== "application/registry+json") {
          await cancelResponseBody(response)
          throw new InstallRouteError("REGISTRY_CONTENT_TYPE_REJECTED", 422, "Registry manifest must be JSON")
        }
      } else {
        const contentType = response.headers.get("content-type")?.split(";", 1)[0]?.trim().toLowerCase()
        if (
          !contentType ||
          ![
            "application/octet-stream",
            "application/typescript",
            "text/markdown",
            "text/mdx",
            "text/plain",
            "text/typescript",
          ].includes(contentType)
        ) {
          await cancelResponseBody(response)
          throw new InstallRouteError(
            "REGISTRY_CONTENT_TYPE_REJECTED",
            422,
            "Registry referenced file has an unsupported content type",
          )
        }
      }
      return await readBounded(response, maximum, controller.signal)
    } catch (error) {
      if (error instanceof InstallRouteError) throw error
      if (controller.signal.aborted) {
        throw new InstallRouteError("REGISTRY_FETCH_TIMEOUT", 422, "Registry response timed out")
      }
      if (response) await cancelResponseBody(response)
      throw new InstallRouteError("REGISTRY_FETCH_FAILED", 422, "Registry fetch failed")
    } finally {
      clearTimeout(timeout)
    }
  }
  throw new InstallRouteError("REGISTRY_REDIRECT_REJECTED", 422, "Registry redirect was rejected")
}

function referencedPaths(item: ReturnType<typeof registryItemSchema.parse>): string[] {
  const paths = new Set<string>()
  for (const file of item.files ?? []) paths.add(file.path)
  for (const fixture of item.meta.repopress.preview.fixtures) paths.add(fixture)
  for (const fixture of item.meta.repopress.authoring.previewFixtures ?? []) paths.add(fixture)
  if (item.meta.repopress.preview.defaultFixture) paths.add(item.meta.repopress.preview.defaultFixture)
  if (item.meta.repopress.authoring.defaultFixture) paths.add(item.meta.repopress.authoring.defaultFixture)
  for (const asset of item.meta.repopress.authoring.assets ?? []) paths.add(asset.path)
  if (paths.size > REGISTRY_LIMITS.maxFiles + REGISTRY_LIMITS.maxFixtures + REGISTRY_LIMITS.maxAssets) {
    throw new InstallRouteError("REGISTRY_FILE_LIMIT", 422, "Registry referenced file limit exceeded")
  }
  return [...paths].sort()
}

async function resolveOfficialRegistryItem(selector: string, framework: "next" | "fumadocs") {
  const manifestUrl = normalizeRegistryManifestUrl(selector)
  const manifestSource = await fetchRegistryText(manifestUrl, "manifest", REGISTRY_LIMITS.maxBytes)
  let raw: unknown
  try {
    raw = JSON.parse(manifestSource) as unknown
  } catch {
    throw new InstallRouteError("REGISTRY_MANIFEST_INVALID", 422, "Registry manifest is not valid JSON")
  }
  let item: ReturnType<typeof registryItemSchema.parse>
  try {
    item = registryItemSchema.parse(raw)
  } catch {
    throw new InstallRouteError("REGISTRY_MANIFEST_INVALID", 422, "Registry manifest failed validation")
  }
  if (item.meta.repopress.logicalId !== "@repopress/callout" || item.name !== "callout") {
    throw new InstallRouteError("REGISTRY_ITEM_NOT_ALLOWED", 422, "Registry manifest identity is not allowlisted")
  }
  const files = [] as Array<{ path: string; content: string }>
  let totalBytes = 0
  for (const path of referencedPaths(item)) {
    const url = new URL(path, "https://repopress.dev/")
    const content = await fetchRegistryText(url, "referenced-file", MAX_REGISTRY_FILE_BYTES)
    totalBytes += Buffer.byteLength(content, "utf8")
    if (totalBytes > MAX_REGISTRY_TOTAL_BYTES) {
      throw new InstallRouteError("REGISTRY_RESPONSE_TOO_LARGE", 422, "Registry referenced bytes exceed limit")
    }
    files.push({ path, content })
  }
  const version = item.meta.repopress.version
  const integrity = item.meta.repopress.authoring.provenance?.integrity
  if (!version || !integrity) {
    throw new InstallRouteError("REGISTRY_MANIFEST_INVALID", 422, "Registry item lacks immutable identity")
  }
  const digestHex = Buffer.from(integrity.slice("sha256-".length), "base64").toString("hex")
  const source: RegistrySourceInput = {
    reference: item.meta.repopress.logicalId,
    item,
    files,
    resolved: {
      address: manifestUrl.href,
      sourceRef: version,
      resolvedRef: `sha256:${digestHex}`,
    },
  }
  try {
    return resolveRegistryItems({ requested: [source.reference], sources: [source], framework })
  } catch {
    throw new InstallRouteError(
      "REGISTRY_RESOLUTION_FAILED",
      422,
      "Registry item failed integrity or dependency resolution",
    )
  }
}

function hasControlOrBidi(value: string): boolean {
  for (const character of value) {
    const codePoint = character.codePointAt(0) ?? 0
    if (
      codePoint <= 0x1f ||
      (codePoint >= 0x7f && codePoint <= 0x9f) ||
      codePoint === 0x61c ||
      codePoint === 0x200e ||
      codePoint === 0x200f ||
      (codePoint >= 0x202a && codePoint <= 0x202e) ||
      (codePoint >= 0x2066 && codePoint <= 0x2069)
    )
      return true
  }
  return false
}

function safeRelativePath(value: string, label: string): string {
  if (
    typeof value !== "string" ||
    value.length > 2_048 ||
    value.startsWith("/") ||
    value.includes("\\") ||
    hasControlOrBidi(value)
  ) {
    throw new InstallRouteError("LAYOUT_INVALID", 422, `${label} is not a safe repository-relative path`)
  }
  const segments: string[] = []
  for (const segment of value.normalize("NFC").split("/")) {
    if (segment === "" || segment === ".") continue
    if (segment === "..") {
      throw new InstallRouteError("LAYOUT_INVALID", 422, `${label} escapes the repository root`)
    }
    segments.push(segment)
  }
  return segments.join("/")
}

function joinPath(root: string, path: string): string {
  return root ? `${root}/${path}` : path
}

function contentRootAncestors(contentRoot: string): string[] {
  const normalized = safeRelativePath(contentRoot, "Project content root")
  const segments = normalized ? normalized.split("/") : []
  if (segments.length > 16) throw new InstallRouteError("LAYOUT_INVALID", 422, "Project content root is too deep")
  const roots: string[] = []
  for (let end = Math.max(0, segments.length - 1); end >= 0; end -= 1) {
    roots.push(segments.slice(0, end).join("/"))
  }
  return [...new Set(roots)]
}

function evidenceJson(source: string, _label: string): Record<string, unknown> | null {
  if (Buffer.byteLength(source, "utf8") > 1024 * 1024) return null
  try {
    const parsed = JSON.parse(source) as unknown
    return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? (parsed as Record<string, unknown>) : null
  } catch {
    return null
  }
}

function plainRecord(value: unknown): Record<string, unknown> | null {
  return value &&
    typeof value === "object" &&
    !Array.isArray(value) &&
    Object.getPrototypeOf(value) === Object.prototype
    ? (value as Record<string, unknown>)
    : null
}

function projectConfigJson(source: string): Record<string, unknown> | null {
  if (Buffer.byteLength(source, "utf8") > 1024 * 1024) return null
  const result = ts.parseConfigFileTextToJson("tsconfig.json", source)
  if (result.error) return null
  return plainRecord(result.config)
}

function resolveComponentsAlias(
  root: string,
  componentsSource: string,
  projectSource: string,
): { path: string; importPrefix: string; css: string } | null {
  const components = evidenceJson(componentsSource, "components.json")
  const project = projectConfigJson(projectSource)
  const aliases = plainRecord(components?.aliases)
  const tailwind = plainRecord(components?.tailwind)
  const compilerOptions = plainRecord(project?.compilerOptions)
  const paths = plainRecord(compilerOptions?.paths)
  const importPrefix = aliases?.components
  const css = tailwind?.css
  const baseUrl = compilerOptions?.baseUrl ?? "."
  if (
    typeof importPrefix !== "string" ||
    !/^(?:@|~)\/[A-Za-z0-9._/-]+$/u.test(importPrefix) ||
    typeof css !== "string" ||
    typeof baseUrl !== "string" ||
    !paths
  )
    return null
  const matches: string[] = []
  for (const [pattern, rawTargets] of Object.entries(paths)) {
    if (!pattern.endsWith("*") || !importPrefix.startsWith(pattern.slice(0, -1)) || !Array.isArray(rawTargets)) continue
    if (rawTargets.length !== 1 || typeof rawTargets[0] !== "string" || !rawTargets[0].includes("*")) continue
    const suffix = importPrefix.slice(pattern.length - 1)
    matches.push(rawTargets[0].replace("*", suffix))
  }
  if (matches.length !== 1) return null
  try {
    const physical = safeRelativePath(
      [baseUrl, matches[0]].filter((part) => part !== ".").join("/"),
      "Components alias",
    )
    const cssPath = safeRelativePath(css, "CSS target")
    return { path: joinPath(root, physical), importPrefix, css: joinPath(root, cssPath) }
  } catch {
    return null
  }
}

async function discoverInstallLayout(
  token: string,
  project: Doc<"projects">,
  baseSha: string,
): Promise<ProjectInstallLayout> {
  const framework = project.detectedFramework
  if (framework !== "next" && framework !== "fumadocs") {
    throw new InstallRouteError(
      "FRAMEWORK_UNSUPPORTED",
      422,
      "Registry installation supports Next.js and Fumadocs projects",
    )
  }
  const roots = contentRootAncestors(project.contentRoot)
  const evidencePaths = new Set<string>()
  for (const root of roots) {
    for (const path of [
      "package.json",
      "components.json",
      "tsconfig.json",
      "jsconfig.json",
      "mdx-components.tsx",
      "app/globals.css",
      "src/mdx-components.tsx",
      "src/app/globals.css",
    ]) {
      evidencePaths.add(joinPath(root, path))
    }
  }
  const snapshots = await getTextFilesAtCommit(token, project.repoOwner, project.repoName, baseSha, [...evidencePaths])
  const indexed = new Map(snapshots.map((snapshot) => [canonicalizeInstallTarget(snapshot.path), snapshot.content]))
  const matches: ProjectInstallLayout[] = []
  for (const root of roots) {
    const packagePath = joinPath(root, "package.json")
    const componentsPath = joinPath(root, "components.json")
    const packageJson = indexed.get(canonicalizeInstallTarget(packagePath))
    const componentsJson = indexed.get(canonicalizeInstallTarget(componentsPath))
    if (!packageJson || !componentsJson) continue
    const manifest = evidenceJson(packageJson, "package.json")
    const dependencies = { ...plainRecord(manifest?.dependencies), ...plainRecord(manifest?.devDependencies) }
    if (typeof dependencies.next !== "string") continue
    const configSources = [joinPath(root, "tsconfig.json"), joinPath(root, "jsconfig.json")]
      .map((path) => indexed.get(canonicalizeInstallTarget(path)))
      .filter((source): source is string => source !== undefined)
    if (configSources.length !== 1) continue
    const alias = resolveComponentsAlias(root, componentsJson, configSources[0])
    if (!alias) continue
    for (const profile of [
      { runtime: "mdx-components.tsx", css: "app/globals.css" },
      { runtime: "src/mdx-components.tsx", css: "src/app/globals.css" },
    ]) {
      const runtimeMapPath = joinPath(root, profile.runtime)
      const cssTarget = joinPath(root, profile.css)
      if (
        alias.css !== cssTarget ||
        !indexed.has(canonicalizeInstallTarget(runtimeMapPath)) ||
        !indexed.has(canonicalizeInstallTarget(cssTarget))
      )
        continue
      matches.push({
        framework,
        aliases: [{ name: "@components", path: alias.path, importPrefix: alias.importPrefix }],
        runtimeMapPath,
        cssTarget,
        packageJsonPath: packagePath,
        lockPath: joinPath(root, "repopress.lock.json"),
      })
    }
  }
  if (matches.length === 0) {
    throw new InstallRouteError("LAYOUT_NOT_FOUND", 422, "No supported install layout was proven at the base commit")
  }
  if (matches.length !== 1) {
    throw new InstallRouteError("LAYOUT_AMBIGUOUS", 422, "Multiple supported install layouts match the project")
  }
  return matches[0]
}

function lockedTargetPaths(snapshots: readonly RepositoryFileSnapshot[], lockPath: string): string[] {
  const source = snapshots.find((snapshot) => snapshot.path === lockPath)?.content
  if (!source) return []
  let parsed: unknown
  try {
    parsed = JSON.parse(source) as unknown
  } catch {
    return []
  }
  const result = repoPressLockSchema.safeParse(parsed)
  if (!result.success) return []
  return Object.values(result.data.items).flatMap((item) => item.targets.map((target) => target.path))
}

async function buildPlan(
  token: string,
  project: Doc<"projects">,
  baseSha: string,
  layout: ProjectInstallLayout,
  resolved: ReturnType<typeof resolveRegistryItems>,
): Promise<RegistryInstallPlan> {
  const systemPaths = [
    layout.runtimeMapPath,
    layout.packageJsonPath ?? "package.json",
    layout.cssTarget,
    layout.lockPath,
  ]
  let snapshots = await getTextFilesAtCommit(token, project.repoOwner, project.repoName, baseSha, systemPaths)
  const lockedPaths = lockedTargetPaths(snapshots, layout.lockPath)
  if (lockedPaths.length > 0) {
    const lockedSnapshots = await getTextFilesAtCommit(token, project.repoOwner, project.repoName, baseSha, lockedPaths)
    snapshots = [...snapshots, ...lockedSnapshots]
  }
  let plan = planRegistryInstall({ resolved, layout, currentFiles: snapshots, currentLock: null })
  const present = new Set(snapshots.map((snapshot) => snapshot.path))
  const proposedPaths = plan.fileChanges
    .filter((change) => change.kind === "registry" && !present.has(change.path))
    .map((change) => change.path)
  if (proposedPaths.length > 0) {
    const targetSnapshots = await getTextFilesAtCommit(
      token,
      project.repoOwner,
      project.repoName,
      baseSha,
      proposedPaths,
    )
    if (targetSnapshots.length > 0) snapshots = [...snapshots, ...targetSnapshots]
    plan = planRegistryInstall({ resolved, layout, currentFiles: snapshots, currentLock: null })
  }
  return plan
}

function planDigest(plan: RegistryInstallPlan, baseSha: string, projectId: string, logicalId: string): string {
  return `sha256:${createHash("sha256")
    .update("repopress-registry-install-plan-v1\0", "utf8")
    .update(projectId, "utf8")
    .update("\0", "utf8")
    .update(baseSha, "utf8")
    .update("\0", "utf8")
    .update(logicalId, "utf8")
    .update("\0", "utf8")
    .update(JSON.stringify(plan), "utf8")
    .digest("hex")}`
}

function installBranch(itemName: string, baseSha: string, idempotencyKey: string): string {
  const key = createHash("sha256").update(idempotencyKey, "utf8").digest("hex").slice(0, 12)
  return `repopress/install/${itemName}-${baseSha.slice(0, 12)}-${key}`
}

function pullRequestBody(plan: RegistryInstallPlan, logicalId: string, version: string, digest: string): string {
  const files = plan.fileChanges.slice(0, 100).map((change) => `- \`${change.path}\` (${change.kind})`)
  const packages = plan.packageChanges.slice(0, 100).map((change) => `- \`${change.name}\`: ${change.after}`)
  const warnings = plan.warnings.slice(0, 100).map((warning) => `- ${warning.code}: ${warning.message}`)
  return [
    `Installs ${logicalId}@${version} through RepoPress's declarative registry planner.`,
    "",
    `Plan digest: \`${digest}\``,
    "",
    "Files:",
    ...(files.length > 0 ? files : ["- No file changes"]),
    ...(plan.fileChanges.length > files.length ? [`- …and ${plan.fileChanges.length - files.length} more`] : []),
    "",
    "Packages:",
    ...(packages.length > 0 ? packages : ["- No package changes"]),
    "",
    "Warnings:",
    ...(warnings.length > 0 ? warnings : ["- None"]),
    "",
    "Conflicts:",
    "- None",
  ].join("\n")
}

export async function POST(request: Request) {
  let input: InstallRequest
  try {
    input = await parseRequest(request)
  } catch (error) {
    return errorResponse(
      error instanceof InstallRouteError
        ? error
        : new InstallRouteError("INVALID_REQUEST", 400, "Request could not be parsed"),
    )
  }

  try {
    const serverQueryToken = await mintServerQueryToken()
    const project = await convex.query(api.projects.get, {
      id: input.projectId as Id<"projects">,
      serverQueryToken,
    })
    if (!project) throw new InstallRouteError("PROJECT_NOT_FOUND", 404, "Project not found")
    let auth: Awaited<ReturnType<typeof resolveRouteAuth>>
    try {
      auth = await resolveRouteAuth(project, "editor")
    } catch (error) {
      if (error instanceof RouteAuthError) throw new InstallRouteError("ACCESS_DENIED", error.status, error.message)
      throw error
    }
    normalizeRegistryManifestUrl(input.item)
    const baseSha = await getBranchHeadSha(auth.githubToken, project.repoOwner, project.repoName, project.branch)
    if (!input.dryRun && input.expectedBaseSha !== baseSha) {
      throw new InstallRouteError("BASE_DRIFT", 409, "Project base branch changed since dry run", {
        expectedBaseSha: input.expectedBaseSha,
        currentBaseSha: baseSha,
      })
    }
    const layout = await discoverInstallLayout(auth.githubToken, project, baseSha)
    const resolved = await resolveOfficialRegistryItem(input.item, layout.framework)
    const item = resolved.at(-1)
    if (!item) throw new InstallRouteError("REGISTRY_RESOLUTION_FAILED", 422, "Registry item could not be resolved")
    let plan: RegistryInstallPlan
    try {
      plan = await buildPlan(auth.githubToken, project, baseSha, layout, resolved)
    } catch (error) {
      if (error instanceof InstallRouteError) throw error
      throw new InstallRouteError("INSTALL_PLAN_INVALID", 422, "Repository snapshots could not produce a safe plan")
    }
    const digest = planDigest(plan, baseSha, String(project._id), item.logicalId)
    const common = {
      repository: {
        owner: project.repoOwner,
        repo: project.repoName,
        baseBranch: project.branch,
        baseSha,
      },
      item: { logicalId: item.logicalId, version: item.authoring.version, integrity: item.integrity },
      plan: dryRunInstallPlan(plan),
      planDigest: digest,
    }
    if (!input.dryRun && input.expectedItemIntegrity !== item.integrity) {
      throw new InstallRouteError("ITEM_INTEGRITY_DRIFT", 409, "Registry item integrity changed since review", {
        expectedItemIntegrity: input.expectedItemIntegrity,
        currentItemIntegrity: item.integrity,
      })
    }
    if (!input.dryRun && input.expectedPlanDigest !== digest) {
      throw new InstallRouteError("REVIEWED_PLAN_DRIFT", 409, "Registry install plan changed since review", {
        expectedPlanDigest: input.expectedPlanDigest,
        currentPlanDigest: digest,
      })
    }
    if (!plan.applicable) {
      return NextResponse.json(
        { ok: false, dryRun: input.dryRun, code: "INSTALL_CONFLICT", ...common },
        { status: 409 },
      )
    }
    if (input.dryRun) return NextResponse.json({ ok: true, dryRun: true, ...common })
    if (plan.fileChanges.length === 0) {
      return NextResponse.json({ ok: true, dryRun: false, noChanges: true, ...common })
    }

    const version = item.authoring.version ?? item.item.meta.repopress.version
    if (!version) throw new InstallRouteError("REGISTRY_MANIFEST_INVALID", 422, "Registry item version is missing")
    const branch = installBranch(item.item.name, baseSha, input.idempotencyKey as string)
    const title = `Install ${item.logicalId}@${version} via RepoPress`
    const commitMessage = `${title}\n\nPlan-Digest: ${digest}`
    let reused = false
    let branchState: Awaited<ReturnType<typeof getDedicatedBranchState>> = null
    try {
      await createBranchFromSha(auth.githubToken, project.repoOwner, project.repoName, branch, baseSha)
    } catch {
      try {
        branchState = await getDedicatedBranchState(
          auth.githubToken,
          project.repoOwner,
          project.repoName,
          branch,
          baseSha,
        )
      } catch {
        branchState = null
      }
      if (!branchState) {
        throw new InstallRouteError("BRANCH_CREATE_FAILED", 502, "Could not create the registry install branch")
      }
      reused = true
    }
    const operations: BatchOperation[] = plan.fileChanges.map((change) => ({
      path: change.path,
      content: change.after,
      contentEncoding: "utf-8",
      action: change.before === null ? "create" : "update",
    }))
    const matchingCommit = (state: Awaited<ReturnType<typeof getDedicatedBranchState>>): string | null => {
      if (!state?.commit) return null
      return state.commit.parents.length === 1 &&
        state.commit.parents[0] === baseSha &&
        state.commit.message === commitMessage
        ? state.commit.sha
        : null
    }
    let commitSha = matchingCommit(branchState)
    if (branchState && branchState.headSha !== baseSha && !commitSha) {
      throw new InstallRouteError("INSTALL_BRANCH_CONFLICT", 409, "Dedicated install branch contains different work", {
        branch,
      })
    }
    if (!commitSha) {
      try {
        const commit = await batchCommitAtExpectedHead(
          auth.githubToken,
          project.repoOwner,
          project.repoName,
          { branch, protectedBaseBranch: project.branch, expectedHeadSha: baseSha },
          operations,
          commitMessage,
        )
        commitSha = commit.commitSha
      } catch {
        let recovered: Awaited<ReturnType<typeof getDedicatedBranchState>> = null
        try {
          recovered = await getDedicatedBranchState(
            auth.githubToken,
            project.repoOwner,
            project.repoName,
            branch,
            baseSha,
          )
        } catch {
          recovered = null
        }
        commitSha = matchingCommit(recovered)
        if (!commitSha) {
          throw new InstallRouteError("BATCH_COMMIT_FAILED", 502, "Registry batch commit failed", {
            branch,
            recovery:
              "Inspect the retained branch and open a pull request if the commit landed, or delete it manually before retrying with a new key.",
          })
        }
        reused = true
      }
    } else reused = true

    let pullRequest = await findOpenPullRequestByHead(
      auth.githubToken,
      project.repoOwner,
      project.repoName,
      branch,
      project.branch,
      commitSha,
    )
    if (pullRequest) reused = true
    if (!pullRequest) {
      try {
        pullRequest = await createPullRequest(
          auth.githubToken,
          project.repoOwner,
          project.repoName,
          branch,
          project.branch,
          title,
          pullRequestBody(plan, item.logicalId, version, digest),
        )
      } catch {
        try {
          pullRequest = await findOpenPullRequestByHead(
            auth.githubToken,
            project.repoOwner,
            project.repoName,
            branch,
            project.branch,
            commitSha,
          )
        } catch {
          pullRequest = null
        }
        if (!pullRequest) {
          throw new InstallRouteError("PULL_REQUEST_FAILED", 502, "Commit created, but pull request creation failed", {
            branch,
            commitSha,
            recovery: "Open a pull request from the retained branch or delete it before retrying with a new key.",
          })
        }
        reused = true
      }
    }
    return NextResponse.json({
      ok: true,
      dryRun: false,
      ...common,
      branch,
      commitSha,
      reused,
      pullRequest: { number: pullRequest.number, url: pullRequest.htmlUrl },
    })
  } catch (error) {
    if (error instanceof InstallRouteError) return errorResponse(error)
    return errorResponse(new InstallRouteError("INSTALL_FAILED", 500, "Registry installation failed"))
  }
}
