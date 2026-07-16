import { createHash } from "node:crypto"
import { beforeEach, describe, expect, it, vi } from "vitest"
import { computeRegistryItemIntegrity } from "@/lib/repopress/registry-integrity"

const { convexQueryMock } = vi.hoisted(() => ({ convexQueryMock: vi.fn() }))

vi.mock("convex/browser", () => ({
  ConvexHttpClient: class {
    query = convexQueryMock
  },
}))

vi.mock("@/lib/route-auth", () => ({
  RouteAuthError: class RouteAuthError extends Error {
    constructor(
      message: string,
      readonly status: number,
    ) {
      super(message)
    }
  },
  resolveRouteAuth: vi.fn(),
}))

vi.mock("@/lib/project-access-token", () => ({ mintServerQueryToken: vi.fn().mockResolvedValue("server-token") }))

vi.mock("@/lib/github", () => ({
  batchCommitAtExpectedHead: vi.fn(),
  createBranchFromSha: vi.fn(),
  createPullRequest: vi.fn(),
  deleteBranchRef: vi.fn(),
  getBranchHeadSha: vi.fn(),
  getTextFilesAtCommit: vi.fn(),
}))

process.env.NEXT_PUBLIC_CONVEX_URL ||= "https://example.convex.cloud"

import {
  batchCommitAtExpectedHead,
  createBranchFromSha,
  createPullRequest,
  deleteBranchRef,
  getBranchHeadSha,
  getTextFilesAtCommit,
} from "@/lib/github"
import { RouteAuthError, resolveRouteAuth } from "@/lib/route-auth"
import { POST } from "../route"

const BASE_SHA = "a".repeat(40)
const COMMIT_SHA = "b".repeat(40)
const source = '"use client"\nexport function Callout() { return null }\n'
const fixture = "<Callout>Safe fixture</Callout>\n"
const sourcePath = "registry/repopress/callout/callout.tsx"
const fixturePath = "registry/repopress/callout/fixture.mdx"

function registryItem() {
  const item = {
    name: "callout",
    type: "registry:component",
    dependencies: [],
    registryDependencies: [],
    files: [{ path: sourcePath, type: "registry:component", target: "@components/repopress/callout.tsx" }],
    meta: {
      repopress: {
        apiVersion: 1,
        version: "1.0.0",
        kind: "mdx-component",
        logicalId: "@repopress/callout",
        mdxName: "Callout",
        exportName: "Callout",
        frameworks: ["next"],
        preview: { fixtures: [fixturePath], defaultFixture: fixturePath },
        authoring: {
          logicalId: "@repopress/callout",
          mdxName: "Callout",
          displayName: "Callout",
          exportName: "Callout",
          frameworks: ["next"],
          runtime: "client",
          schemaStatus: "complete",
          props: [],
          slots: [{ name: "children", accepts: "mdx", required: true }],
          previewFixtures: [fixturePath],
          defaultFixture: fixturePath,
          provenance: {
            source: "registry",
            registryItem: "@repopress/callout",
            version: "1.0.0",
            integrity: `sha256-${Buffer.alloc(32).toString("base64")}`,
          },
        },
      },
    },
  }
  item.meta.repopress.authoring.provenance.integrity = computeRegistryItemIntegrity({
    item,
    files: [
      { path: sourcePath, content: source },
      { path: fixturePath, content: fixture },
    ],
  })
  return item
}

const project = {
  _id: "project_123",
  userId: "owner_1",
  repoOwner: "acme",
  repoName: "docs",
  branch: "main",
  contentRoot: "content",
  detectedFramework: "next",
}

const systemSnapshots = [
  { path: "mdx-components.tsx", content: "export const components = {}\n" },
  { path: "package.json", content: '{"dependencies":{}}\n' },
  { path: "app/globals.css", content: "@import 'tailwindcss';\n" },
]

function request(body: Record<string, unknown>, init: { origin?: string; contentType?: string } = {}) {
  return new Request("https://app.repopress.test/api/github/install-registry-item", {
    method: "POST",
    headers: {
      Origin: init.origin ?? "https://app.repopress.test",
      "Content-Type": init.contentType ?? "application/json",
    },
    body: JSON.stringify(body),
  })
}

function mockRegistryFetch(options: { redirect?: string; oversized?: boolean; sourceContentType?: string } = {}) {
  vi.stubGlobal(
    "fetch",
    vi.fn(async (input: string | URL | Request) => {
      const url = String(input)
      if (url.endsWith("/r/callout.json") && options.redirect) {
        return new Response(null, { status: 302, headers: { location: options.redirect } })
      }
      if (url.endsWith("/r/callout.json")) {
        const body = options.oversized ? "x".repeat(300_000) : JSON.stringify(registryItem())
        return new Response(body, { headers: { "content-type": "application/json" } })
      }
      if (url.endsWith(sourcePath)) {
        return new Response(source, { headers: { "content-type": options.sourceContentType ?? "text/plain" } })
      }
      if (url.endsWith(fixturePath)) return new Response(fixture, { headers: { "content-type": "text/plain" } })
      throw new Error(`unexpected fetch ${url}`)
    }),
  )
}

describe("POST /api/github/install-registry-item", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    convexQueryMock.mockResolvedValue(project)
    vi.mocked(resolveRouteAuth).mockResolvedValue({
      actingUserId: "owner_1",
      role: "owner",
      projectAccessToken: "project-token",
      githubToken: "gh-token",
    })
    vi.mocked(getBranchHeadSha).mockResolvedValue(BASE_SHA)
    vi.mocked(getTextFilesAtCommit).mockResolvedValueOnce(systemSnapshots).mockResolvedValueOnce([])
    vi.mocked(createBranchFromSha).mockResolvedValue(undefined)
    vi.mocked(batchCommitAtExpectedHead).mockResolvedValue({ commitSha: COMMIT_SHA, treeSha: "c".repeat(40) })
    vi.mocked(createPullRequest).mockResolvedValue({
      number: 42,
      url: "https://api.github.test/pulls/42",
      htmlUrl: "https://github.com/acme/docs/pull/42",
    })
    vi.mocked(deleteBranchRef).mockResolvedValue(undefined)
    mockRegistryFetch()
  })

  it("requires an authenticated editor and makes no GitHub writes when auth fails", async () => {
    vi.mocked(resolveRouteAuth).mockRejectedValue(new RouteAuthError("Unauthorized", 401))
    const response = await POST(request({ projectId: "project_123", item: "@repopress/callout", dryRun: true }))
    expect(response.status).toBe(401)
    expect(createBranchFromSha).not.toHaveBeenCalled()
    expect(batchCommitAtExpectedHead).not.toHaveBeenCalled()
  })

  it("denies viewers and cross-project callers through the shared project auth policy", async () => {
    vi.mocked(resolveRouteAuth).mockRejectedValue(new RouteAuthError('Forbidden: requires "editor" permission', 403))
    const response = await POST(request({ projectId: "project_other", item: "@repopress/callout", dryRun: true }))
    expect(response.status).toBe(403)
    expect(resolveRouteAuth).toHaveBeenCalledWith(project, "editor")
    expect(getBranchHeadSha).not.toHaveBeenCalled()
  })

  it("returns 404 for a missing project without touching GitHub", async () => {
    convexQueryMock.mockResolvedValue(null)
    const response = await POST(request({ projectId: "missing", item: "@repopress/callout", dryRun: true }))
    expect(response.status).toBe(404)
    expect(resolveRouteAuth).not.toHaveBeenCalled()
    expect(getBranchHeadSha).not.toHaveBeenCalled()
  })

  it.each([
    "owner",
    "repo",
    "branch",
    "baseBranch",
    "targetBranch",
    "registrySources",
  ])("rejects forged authority field %s", async (field) => {
    const response = await POST(
      request({ projectId: "project_123", item: "@repopress/callout", dryRun: true, [field]: "attacker/value" }),
    )
    expect(response.status).toBe(400)
    expect(getBranchHeadSha).not.toHaveBeenCalled()
  })

  it("enforces JSON content type and same-origin requests before reading authority", async () => {
    const wrongType = await POST(
      request({ projectId: "project_123", item: "@repopress/callout", dryRun: true }, { contentType: "text/plain" }),
    )
    const crossSite = await POST(
      request({ projectId: "project_123", item: "@repopress/callout", dryRun: true }, { origin: "https://evil.test" }),
    )
    expect(wrongType.status).toBe(415)
    expect(crossSite.status).toBe(403)
    expect(convexQueryMock).not.toHaveBeenCalled()
  })

  it("bounds and strictly validates the request body", async () => {
    const oversized = new Request("https://app.repopress.test/api/github/install-registry-item", {
      method: "POST",
      headers: { Origin: "https://app.repopress.test", "Content-Type": "application/json" },
      body: JSON.stringify({ projectId: "p", item: "@repopress/callout", dryRun: true, pad: "x".repeat(40_000) }),
    })
    expect((await POST(oversized)).status).toBe(413)
    expect(convexQueryMock).not.toHaveBeenCalled()
  })

  it("accepts only official selector or allowlisted HTTPS registry URL", async () => {
    const privateUrl = await POST(
      request({ projectId: "project_123", item: "https://127.0.0.1/r/callout.json", dryRun: true }),
    )
    const credentialUrl = await POST(
      request({ projectId: "project_123", item: "https://user@repopress.dev/r/callout.json", dryRun: true }),
    )
    expect(privateUrl.status).toBe(422)
    expect(credentialUrl.status).toBe(422)
    expect(getBranchHeadSha).not.toHaveBeenCalled()
  })

  it("rejects redirects outside the registry allowlist and oversized manifests", async () => {
    mockRegistryFetch({ redirect: "https://evil.test/callout.json" })
    const redirect = await POST(
      request({ projectId: "project_123", item: "https://repopress.dev/r/callout.json", dryRun: true }),
    )
    expect(redirect.status).toBe(422)
    vi.clearAllMocks()
    convexQueryMock.mockResolvedValue(project)
    vi.mocked(resolveRouteAuth).mockResolvedValue({
      actingUserId: "owner_1",
      role: "owner",
      projectAccessToken: "project-token",
      githubToken: "gh-token",
    })
    vi.mocked(getBranchHeadSha).mockResolvedValue(BASE_SHA)
    mockRegistryFetch({ oversized: true })
    const oversized = await POST(
      request({ projectId: "project_123", item: "https://repopress.dev/r/callout.json", dryRun: true }),
    )
    expect(oversized.status).toBe(422)
  })

  it("rejects executable or ambiguous content types for referenced registry bytes", async () => {
    mockRegistryFetch({ sourceContentType: "text/html" })
    const response = await POST(
      request({ projectId: "project_123", item: "https://repopress.dev/r/callout.json", dryRun: true }),
    )
    expect(response.status).toBe(422)
    expect(getBranchHeadSha).not.toHaveBeenCalled()
  })

  it("returns an immutable dry-run plan with server-derived coordinates and performs no writes", async () => {
    const response = await POST(request({ projectId: "project_123", item: "@repopress/callout", dryRun: true }))
    const payload = await response.json()
    expect(response.status).toBe(200)
    expect(payload).toMatchObject({
      ok: true,
      dryRun: true,
      repository: { owner: "acme", repo: "docs", baseBranch: "main", baseSha: BASE_SHA },
      item: { logicalId: "@repopress/callout", version: "1.0.0" },
      plan: { planVersion: 1, applicable: true },
      planDigest: expect.stringMatching(/^sha256:[a-f0-9]{64}$/u),
    })
    expect(getBranchHeadSha).toHaveBeenCalledWith("gh-token", "acme", "docs", "main")
    expect(getTextFilesAtCommit).toHaveBeenCalledWith(
      "gh-token",
      "acme",
      "docs",
      BASE_SHA,
      expect.arrayContaining(["mdx-components.tsx", "package.json", "app/globals.css", "repopress.lock.json"]),
    )
    expect(createBranchFromSha).not.toHaveBeenCalled()
    expect(batchCommitAtExpectedHead).not.toHaveBeenCalled()
    expect(createPullRequest).not.toHaveBeenCalled()
  })

  it("returns deterministic planner conflicts without GitHub writes", async () => {
    vi.mocked(getTextFilesAtCommit).mockReset().mockResolvedValue([])
    const response = await POST(request({ projectId: "project_123", item: "@repopress/callout", dryRun: true }))
    const payload = await response.json()
    expect(response.status).toBe(409)
    expect(payload.code).toBe("INSTALL_CONFLICT")
    expect(payload.plan.conflicts).toEqual(
      expect.arrayContaining([expect.objectContaining({ code: "MISSING_RUNTIME_MAP" })]),
    )
    expect(createBranchFromSha).not.toHaveBeenCalled()
  })

  it("requires the reviewed base SHA for publish and rejects drift before writes", async () => {
    const missing = await POST(
      request({
        projectId: "project_123",
        item: "@repopress/callout",
        dryRun: false,
        idempotencyKey: "install-callout-001",
      }),
    )
    expect(missing.status).toBe(400)
    const drift = await POST(
      request({
        projectId: "project_123",
        item: "@repopress/callout",
        dryRun: false,
        expectedBaseSha: "d".repeat(40),
        idempotencyKey: "install-callout-001",
      }),
    )
    expect(drift.status).toBe(409)
    expect(createBranchFromSha).not.toHaveBeenCalled()
  })

  it("creates a deterministic dedicated branch from the exact base, one batch commit, and a PR to the base", async () => {
    const body = {
      projectId: "project_123",
      item: "@repopress/callout",
      dryRun: false,
      expectedBaseSha: BASE_SHA,
      idempotencyKey: "install-callout-001",
    }
    const response = await POST(request(body))
    const payload = await response.json()
    expect(response.status).toBe(200)
    const keyDigest = createHash("sha256").update(body.idempotencyKey).digest("hex").slice(0, 12)
    const branch = `repopress/install/callout-${BASE_SHA.slice(0, 12)}-${keyDigest}`
    expect(createBranchFromSha).toHaveBeenCalledOnce()
    expect(createBranchFromSha).toHaveBeenCalledWith("gh-token", "acme", "docs", branch, BASE_SHA)
    expect(batchCommitAtExpectedHead).toHaveBeenCalledOnce()
    expect(batchCommitAtExpectedHead).toHaveBeenCalledWith(
      "gh-token",
      "acme",
      "docs",
      { branch, protectedBaseBranch: "main", expectedHeadSha: BASE_SHA },
      expect.arrayContaining([
        expect.objectContaining({ path: "components/repopress/callout.tsx", action: "create" }),
        expect.objectContaining({ path: "mdx-components.tsx", action: "update" }),
        expect.objectContaining({ path: "repopress.lock.json", action: "create" }),
      ]),
      expect.stringContaining("Install @repopress/callout@1.0.0"),
    )
    expect(createPullRequest).toHaveBeenCalledWith(
      "gh-token",
      "acme",
      "docs",
      branch,
      "main",
      "Install @repopress/callout@1.0.0 via RepoPress",
      expect.stringContaining("Plan digest:"),
    )
    expect(vi.mocked(createPullRequest).mock.calls[0][6]).toContain("Conflicts:\n- None")
    expect(payload).toMatchObject({
      ok: true,
      dryRun: false,
      branch,
      commitSha: COMMIT_SHA,
      pullRequest: { number: 42, url: "https://github.com/acme/docs/pull/42" },
    })
    expect(branch).not.toBe("main")
  })

  it("cleans up only the newly-created branch when the batch commit fails", async () => {
    vi.mocked(batchCommitAtExpectedHead).mockRejectedValue(new Error("tree failed"))
    const response = await POST(
      request({
        projectId: "project_123",
        item: "@repopress/callout",
        dryRun: false,
        expectedBaseSha: BASE_SHA,
        idempotencyKey: "install-callout-001",
      }),
    )
    expect(response.status).toBe(502)
    const branch = vi.mocked(createBranchFromSha).mock.calls[0][3]
    expect(deleteBranchRef).toHaveBeenCalledWith("gh-token", "acme", "docs", branch)
    expect(createPullRequest).not.toHaveBeenCalled()
  })

  it("keeps the committed review branch and reports it explicitly if PR creation fails", async () => {
    vi.mocked(createPullRequest).mockRejectedValue(new Error("PR failed"))
    const response = await POST(
      request({
        projectId: "project_123",
        item: "@repopress/callout",
        dryRun: false,
        expectedBaseSha: BASE_SHA,
        idempotencyKey: "install-callout-001",
      }),
    )
    const payload = await response.json()
    expect(response.status).toBe(502)
    expect(payload.code).toBe("PULL_REQUEST_FAILED")
    expect(payload.branch).toMatch(/^repopress\/install\//u)
    expect(deleteBranchRef).not.toHaveBeenCalled()
  })
})
