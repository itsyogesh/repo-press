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
  findOpenPullRequestByHead: vi.fn(),
  getBranchHeadSha: vi.fn(),
  getDedicatedBranchState: vi.fn(),
  getTextFilesAtCommit: vi.fn(),
  verifyBatchCommitTree: vi.fn(),
}))

process.env.NEXT_PUBLIC_CONVEX_URL ||= "https://example.convex.cloud"

import {
  batchCommitAtExpectedHead,
  createBranchFromSha,
  createPullRequest,
  deleteBranchRef,
  findOpenPullRequestByHead,
  getBranchHeadSha,
  getDedicatedBranchState,
  getTextFilesAtCommit,
  verifyBatchCommitTree,
} from "@/lib/github"
import { RouteAuthError, resolveRouteAuth } from "@/lib/route-auth"
import { POST } from "../route"

const BASE_SHA = "a".repeat(40)
const COMMIT_SHA = "b".repeat(40)
const INSTALL_BRANCH = `repopress/install/callout-${BASE_SHA.slice(0, 12)}-${createHash("sha256")
  .update("install-callout-001")
  .digest("hex")
  .slice(0, 12)}`
const source = '"use client"\nexport function Callout() { return null }\n'
const fixture = "<Callout>Safe fixture</Callout>\n"
const sourcePath = "registry/repopress/callout/callout.tsx"
const fixturePath = "registry/repopress/callout/fixture.mdx"

function registryItem(sourceContent = source) {
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
      { path: sourcePath, content: sourceContent },
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
  { path: "package.json", content: '{"dependencies":{"next":"16.0.0"}}\n' },
  { path: "app/globals.css", content: "@import 'tailwindcss';\n" },
]

const layoutSnapshots = [
  {
    path: "components.json",
    content: JSON.stringify({ aliases: { components: "@/components" }, tailwind: { css: "app/globals.css" } }),
  },
  {
    path: "tsconfig.json",
    content: JSON.stringify({ compilerOptions: { baseUrl: ".", paths: { "@/*": ["./*"] } } }),
  },
]

function mockRepositoryFiles(files = [...systemSnapshots, ...layoutSnapshots]) {
  const indexed = new Map(files.map((file) => [file.path, file.content]))
  vi.mocked(getTextFilesAtCommit)
    .mockReset()
    .mockImplementation(async (_token, _owner, _repo, _sha, paths) =>
      paths.flatMap((path) => {
        const content = indexed.get(path)
        return content === undefined ? [] : [{ path, content }]
      }),
    )
}

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

async function reviewedPublishBody(overrides: Record<string, unknown> = {}) {
  const response = await POST(request({ projectId: "project_123", item: "@repopress/callout", dryRun: true }))
  if (!response.ok) throw new Error(`dry run failed with ${response.status}`)
  const payload = await response.json()
  vi.mocked(createBranchFromSha).mockClear()
  vi.mocked(batchCommitAtExpectedHead).mockClear()
  vi.mocked(createPullRequest).mockClear()
  return {
    projectId: "project_123",
    item: "@repopress/callout",
    dryRun: false,
    expectedBaseSha: payload.repository.baseSha,
    expectedPlanDigest: payload.planDigest,
    expectedItemIntegrity: payload.item.integrity,
    idempotencyKey: "install-callout-001",
    ...overrides,
  }
}

function mockRegistryFetch(
  options: { redirect?: string; oversized?: boolean; sourceContentType?: string; sourceContent?: string } = {},
) {
  vi.stubGlobal(
    "fetch",
    vi.fn(async (input: string | URL | Request) => {
      const url = String(input)
      if (url.endsWith("/r/callout.json") && options.redirect) {
        return new Response(null, { status: 302, headers: { location: options.redirect } })
      }
      if (url.endsWith("/r/callout.json")) {
        const body = options.oversized
          ? "x".repeat(300_000)
          : JSON.stringify(registryItem(options.sourceContent ?? source))
        return new Response(body, { headers: { "content-type": "application/json" } })
      }
      if (url.endsWith(sourcePath)) {
        return new Response(options.sourceContent ?? source, {
          headers: { "content-type": options.sourceContentType ?? "text/plain" },
        })
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
    mockRepositoryFiles()
    vi.mocked(createBranchFromSha).mockResolvedValue(undefined)
    vi.mocked(batchCommitAtExpectedHead).mockResolvedValue({ commitSha: COMMIT_SHA, treeSha: "c".repeat(40) })
    vi.mocked(createPullRequest).mockResolvedValue({
      number: 42,
      url: "https://api.github.test/pulls/42",
      htmlUrl: "https://github.com/acme/docs/pull/42",
      headSha: COMMIT_SHA,
      headRef: INSTALL_BRANCH,
      headRepoFullName: "acme/docs",
      baseRef: "main",
    })
    vi.mocked(deleteBranchRef).mockResolvedValue(undefined)
    vi.mocked(getDedicatedBranchState).mockResolvedValue({ headSha: BASE_SHA, commit: null })
    vi.mocked(findOpenPullRequestByHead).mockResolvedValue(null)
    vi.mocked(verifyBatchCommitTree).mockResolvedValue(true)
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
    expect(createBranchFromSha).not.toHaveBeenCalled()
  })

  it("does not let a hostile response-body cancel promise stall an early refusal", async () => {
    vi.useFakeTimers()
    try {
      const cancel = vi.fn(() => new Promise<void>(() => {}))
      vi.stubGlobal(
        "fetch",
        vi.fn().mockResolvedValue(
          new Response(new ReadableStream({ cancel }), {
            headers: { "content-type": "text/html" },
          }),
        ),
      )
      const responsePromise = POST(request({ projectId: "project_123", item: "@repopress/callout", dryRun: true }))
      const outcome = Promise.race([
        responsePromise,
        new Promise<"stalled">((resolve) => setTimeout(() => resolve("stalled"), 5_100)),
      ])
      await vi.advanceTimersByTimeAsync(5_100)
      const response = await outcome
      expect(response).not.toBe("stalled")
      expect((response as Response).status).toBe(422)
      expect(cancel).toHaveBeenCalledOnce()
    } finally {
      vi.useRealTimers()
    }
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
    mockRepositoryFiles([
      ...systemSnapshots,
      ...layoutSnapshots,
      { path: "components/repopress/callout.tsx", content: "locally owned content\n" },
    ])
    const response = await POST(request({ projectId: "project_123", item: "@repopress/callout", dryRun: true }))
    const payload = await response.json()
    expect(response.status).toBe(409)
    expect(payload.code).toBe("INSTALL_CONFLICT")
    expect(payload.plan.conflicts).toEqual(
      expect.arrayContaining([expect.objectContaining({ code: "UNMANAGED_TARGET_EXISTS" })]),
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
    const drift = await POST(request(await reviewedPublishBody({ expectedBaseSha: "d".repeat(40) })))
    expect(drift.status).toBe(409)
    expect(createBranchFromSha).not.toHaveBeenCalled()
  })

  it("binds publish to the reviewed item integrity even when the base SHA is unchanged", async () => {
    const reviewed = await reviewedPublishBody()
    mockRegistryFetch({ sourceContent: `${source}\n// upstream mutation\n` })
    const response = await POST(request(reviewed))
    const payload = await response.json()
    expect(response.status).toBe(409)
    expect(payload.code).toBe("ITEM_INTEGRITY_DRIFT")
    expect(createBranchFromSha).not.toHaveBeenCalled()
    expect(batchCommitAtExpectedHead).not.toHaveBeenCalled()
  })

  it("binds publish to the exact reviewed plan at the unchanged base SHA", async () => {
    const reviewed = await reviewedPublishBody()
    mockRepositoryFiles([
      ...layoutSnapshots,
      ...systemSnapshots.map((snapshot) =>
        snapshot.path === "mdx-components.tsx"
          ? { ...snapshot, content: `// changed after review\n${snapshot.content}` }
          : snapshot,
      ),
    ])
    const response = await POST(request(reviewed))
    const payload = await response.json()
    expect(response.status).toBe(409)
    expect(payload.code).toBe("REVIEWED_PLAN_DRIFT")
    expect(createBranchFromSha).not.toHaveBeenCalled()
  })

  it("cancels rejected registry response bodies and leaves no write side effects", async () => {
    const cancel = vi.fn()
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        new Response(new ReadableStream({ cancel }), {
          headers: { "content-type": "text/html" },
        }),
      ),
    )
    const response = await POST(request({ projectId: "project_123", item: "@repopress/callout", dryRun: true }))
    expect(response.status).toBe(422)
    expect(cancel).toHaveBeenCalledOnce()
    expect(createBranchFromSha).not.toHaveBeenCalled()
  })

  it("keeps the body deadline active after headers and cancels a stalled stream without timer leaks", async () => {
    vi.useFakeTimers()
    const cancel = vi.fn()
    try {
      vi.stubGlobal(
        "fetch",
        vi.fn().mockResolvedValue(
          new Response(
            new ReadableStream({
              pull: () => new Promise<void>(() => {}),
              cancel,
            }),
            { headers: { "content-type": "application/json" } },
          ),
        ),
      )
      const pending = POST(request({ projectId: "project_123", item: "@repopress/callout", dryRun: true }))
      await vi.advanceTimersByTimeAsync(5_100)
      const response = await pending
      const payload = await response.json()
      expect(response.status).toBe(422)
      expect(payload.code).toBe("REGISTRY_FETCH_TIMEOUT")
      expect(cancel).toHaveBeenCalledOnce()
      expect(vi.getTimerCount()).toBe(0)
    } finally {
      vi.useRealTimers()
    }
  })

  it.each([
    ["redirect", 302, { location: "https://evil.test/item.json" }],
    ["non-ok", 500, {}],
    ["declared oversize", 200, { "content-type": "application/json", "content-length": "999999" }],
  ])("cancels a registry body rejected for %s", async (_label, status, headers) => {
    const cancel = vi.fn()
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(new ReadableStream({ cancel }), { status, headers })))
    const response = await POST(request({ projectId: "project_123", item: "@repopress/callout", dryRun: true }))
    expect(response.status).toBe(422)
    expect(cancel).toHaveBeenCalledOnce()
    expect(createBranchFromSha).not.toHaveBeenCalled()
  })

  it("discovers a nested app layout only from exact-SHA content-root ancestor evidence", async () => {
    convexQueryMock.mockResolvedValue({ ...project, contentRoot: "apps/docs/content/docs" })
    mockRepositoryFiles([
      { path: "apps/docs/package.json", content: '{"dependencies":{"next":"16.0.0"}}\n' },
      { path: "apps/docs/mdx-components.tsx", content: "export const components = {}\n" },
      { path: "apps/docs/app/globals.css", content: "@import 'tailwindcss';\n" },
      {
        path: "apps/docs/components.json",
        content: JSON.stringify({ aliases: { components: "@/components" }, tailwind: { css: "app/globals.css" } }),
      },
      {
        path: "apps/docs/tsconfig.json",
        content: JSON.stringify({ compilerOptions: { baseUrl: ".", paths: { "@/*": ["./*"] } } }),
      },
    ])
    const response = await POST(request({ projectId: "project_123", item: "@repopress/callout", dryRun: true }))
    const payload = await response.json()
    expect(response.status).toBe(200)
    expect(payload.plan.fileChanges).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ path: "apps/docs/components/repopress/callout.tsx" }),
        expect.objectContaining({ path: "apps/docs/mdx-components.tsx" }),
      ]),
    )
    expect(getTextFilesAtCommit).toHaveBeenCalledWith(
      "gh-token",
      "acme",
      "docs",
      BASE_SHA,
      expect.arrayContaining(["apps/docs/components.json", "apps/docs/tsconfig.json"]),
    )
  })

  it("fails closed when more than one content-root ancestor is a viable app layout", async () => {
    convexQueryMock.mockResolvedValue({ ...project, contentRoot: "apps/docs/content/docs" })
    mockRepositoryFiles([
      ...systemSnapshots,
      ...layoutSnapshots,
      { path: "apps/docs/package.json", content: '{"dependencies":{"next":"16.0.0"}}\n' },
      { path: "apps/docs/mdx-components.tsx", content: "export const components = {}\n" },
      { path: "apps/docs/app/globals.css", content: "@import 'tailwindcss';\n" },
      { path: "apps/docs/components.json", content: layoutSnapshots[0].content },
      { path: "apps/docs/tsconfig.json", content: layoutSnapshots[1].content },
    ])
    const response = await POST(request({ projectId: "project_123", item: "@repopress/callout", dryRun: true }))
    const payload = await response.json()
    expect(response.status).toBe(422)
    expect(payload.code).toBe("LAYOUT_AMBIGUOUS")
    expect(createBranchFromSha).not.toHaveBeenCalled()
  })

  it("supports a uniquely proven src layout without equating import aliases to physical paths", async () => {
    convexQueryMock.mockResolvedValue({ ...project, contentRoot: "src/content/docs" })
    mockRepositoryFiles([
      { path: "package.json", content: '{"dependencies":{"next":"16.0.0"}}\n' },
      { path: "src/mdx-components.tsx", content: "export const components = {}\n" },
      { path: "src/app/globals.css", content: "@import 'tailwindcss';\n" },
      {
        path: "components.json",
        content: JSON.stringify({ aliases: { components: "@/components" }, tailwind: { css: "src/app/globals.css" } }),
      },
      {
        path: "tsconfig.json",
        content: JSON.stringify({ compilerOptions: { baseUrl: ".", paths: { "@/*": ["./src/*"] } } }),
      },
    ])
    const response = await POST(request({ projectId: "project_123", item: "@repopress/callout", dryRun: true }))
    const payload = await response.json()
    expect(response.status).toBe(200)
    expect(payload.plan.fileChanges).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ path: "src/components/repopress/callout.tsx" }),
        expect.objectContaining({ path: "src/mdx-components.tsx" }),
      ]),
    )
  })

  it("accepts standard JSONC tsconfig path evidence without weakening package or components JSON", async () => {
    mockRepositoryFiles([
      ...systemSnapshots,
      layoutSnapshots[0],
      {
        path: "tsconfig.json",
        content: `{
          // Standard TypeScript JSONC configuration.
          "compilerOptions": {
            "baseUrl": ".",
            "paths": { "@/*": ["./*",], },
          },
        }`,
      },
    ])
    const response = await POST(request({ projectId: "project_123", item: "@repopress/callout", dryRun: true }))
    expect(response.status).toBe(200)
  })

  it.each([
    "../content",
    "/content",
    "content\\docs",
    "content/\u202edocs",
  ])("fails closed for malformed project contentRoot %s", async (contentRoot) => {
    convexQueryMock.mockResolvedValue({ ...project, contentRoot })
    const response = await POST(request({ projectId: "project_123", item: "@repopress/callout", dryRun: true }))
    const payload = await response.json()
    expect(response.status).toBe(422)
    expect(payload.code).toBe("LAYOUT_INVALID")
    expect(createBranchFromSha).not.toHaveBeenCalled()
  })

  it("returns LAYOUT_NOT_FOUND when exact-base evidence is incomplete", async () => {
    mockRepositoryFiles([{ path: "package.json", content: '{"dependencies":{"next":"16.0.0"}}\n' }])
    const response = await POST(request({ projectId: "project_123", item: "@repopress/callout", dryRun: true }))
    const payload = await response.json()
    expect(response.status).toBe(422)
    expect(payload.code).toBe("LAYOUT_NOT_FOUND")
    expect(createBranchFromSha).not.toHaveBeenCalled()
  })

  it("creates a deterministic dedicated branch from the exact base, one batch commit, and a PR to the base", async () => {
    const body = await reviewedPublishBody()
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

  it("resumes from the exact base when createRef succeeded but its response was lost", async () => {
    const reviewed = await reviewedPublishBody()
    vi.mocked(createBranchFromSha).mockRejectedValue(new Error("response lost"))
    vi.mocked(getDedicatedBranchState).mockResolvedValue({ headSha: BASE_SHA, commit: null })
    const response = await POST(request(reviewed))
    const payload = await response.json()
    expect(response.status).toBe(200)
    expect(payload.reused).toBe(true)
    expect(batchCommitAtExpectedHead).toHaveBeenCalledOnce()
    expect(createPullRequest).toHaveBeenCalledOnce()
  })

  it("continues to PR creation when updateRef succeeded but its response was lost", async () => {
    const reviewed = await reviewedPublishBody()
    vi.mocked(batchCommitAtExpectedHead).mockRejectedValue(new Error("response lost after updateRef"))
    vi.mocked(getDedicatedBranchState).mockResolvedValue({
      headSha: COMMIT_SHA,
      commit: {
        sha: COMMIT_SHA,
        parents: [BASE_SHA],
        message: `Install @repopress/callout@1.0.0 via RepoPress\n\nPlan-Digest: ${reviewed.expectedPlanDigest}`,
      },
    })
    const response = await POST(request(reviewed))
    const payload = await response.json()
    expect(response.status).toBe(200)
    expect(payload).toMatchObject({ reused: true, commitSha: COMMIT_SHA })
    expect(createPullRequest).toHaveBeenCalledOnce()
  })

  it("recovers an existing exact PR when createPullRequest succeeds but its response is lost", async () => {
    const reviewed = await reviewedPublishBody()
    vi.mocked(createPullRequest).mockRejectedValue(new Error("response lost after PR creation"))
    vi.mocked(findOpenPullRequestByHead)
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce({ number: 42, htmlUrl: "https://github.com/acme/docs/pull/42" })
    const response = await POST(request(reviewed))
    const payload = await response.json()
    expect(response.status).toBe(200)
    expect(payload).toMatchObject({ reused: true, pullRequest: { number: 42 } })
    expect(createPullRequest).toHaveBeenCalledOnce()
  })

  it("reuses a prior matching commit and PR without duplicate writes", async () => {
    const reviewed = await reviewedPublishBody()
    vi.mocked(createBranchFromSha).mockRejectedValue({ status: 422 })
    vi.mocked(getDedicatedBranchState).mockResolvedValue({
      headSha: COMMIT_SHA,
      commit: {
        sha: COMMIT_SHA,
        parents: [BASE_SHA],
        message: `Install @repopress/callout@1.0.0 via RepoPress\n\nPlan-Digest: ${reviewed.expectedPlanDigest}`,
      },
    })
    vi.mocked(findOpenPullRequestByHead).mockResolvedValue({
      number: 42,
      htmlUrl: "https://github.com/acme/docs/pull/42",
    })
    const response = await POST(request(reviewed))
    const payload = await response.json()
    expect(response.status).toBe(200)
    expect(payload).toMatchObject({ reused: true, commitSha: COMMIT_SHA, pullRequest: { number: 42 } })
    expect(batchCommitAtExpectedHead).not.toHaveBeenCalled()
    expect(createPullRequest).not.toHaveBeenCalled()
    expect(verifyBatchCommitTree).toHaveBeenCalledWith(
      "gh-token",
      "acme",
      "docs",
      BASE_SHA,
      COMMIT_SHA,
      expect.arrayContaining([expect.objectContaining({ path: "components/repopress/callout.tsx" })]),
    )
  })

  it("rejects a copied plan message when the resumed commit tree has extra or different changes", async () => {
    const reviewed = await reviewedPublishBody()
    vi.mocked(createBranchFromSha).mockRejectedValue({ status: 422 })
    vi.mocked(getDedicatedBranchState).mockResolvedValue({
      headSha: COMMIT_SHA,
      commit: {
        sha: COMMIT_SHA,
        parents: [BASE_SHA],
        message: `Install @repopress/callout@1.0.0 via RepoPress\n\nPlan-Digest: ${reviewed.expectedPlanDigest}`,
      },
    })
    vi.mocked(verifyBatchCommitTree).mockResolvedValue(false)
    const response = await POST(request(reviewed))
    const payload = await response.json()
    expect(response.status).toBe(409)
    expect(payload.code).toBe("INSTALL_BRANCH_CONFLICT")
    expect(batchCommitAtExpectedHead).not.toHaveBeenCalled()
    expect(createPullRequest).not.toHaveBeenCalled()
    expect(findOpenPullRequestByHead).not.toHaveBeenCalled()
  })

  it("rejects a deterministic branch containing a mismatched commit", async () => {
    const reviewed = await reviewedPublishBody()
    vi.mocked(createBranchFromSha).mockRejectedValue({ status: 422 })
    vi.mocked(getDedicatedBranchState).mockResolvedValue({
      headSha: COMMIT_SHA,
      commit: { sha: COMMIT_SHA, parents: [BASE_SHA], message: "unrelated commit" },
    })
    const response = await POST(request(reviewed))
    const payload = await response.json()
    expect(response.status).toBe(409)
    expect(payload.code).toBe("INSTALL_BRANCH_CONFLICT")
    expect(batchCommitAtExpectedHead).not.toHaveBeenCalled()
    expect(createPullRequest).not.toHaveBeenCalled()
  })

  it("retains the branch for inspection when an ambiguous post-update batch failure occurs", async () => {
    vi.mocked(batchCommitAtExpectedHead).mockRejectedValue(new Error("connection lost after updateRef"))
    const response = await POST(request(await reviewedPublishBody()))
    const payload = await response.json()
    expect(response.status).toBe(502)
    const branch = vi.mocked(createBranchFromSha).mock.calls[0][3]
    expect(payload).toMatchObject({
      code: "BATCH_COMMIT_FAILED",
      branch,
      recovery: expect.stringContaining("Inspect"),
    })
    expect(deleteBranchRef).not.toHaveBeenCalled()
    expect(createPullRequest).not.toHaveBeenCalled()
  })

  it("never deletes the dedicated branch when its expected head has advanced", async () => {
    vi.mocked(batchCommitAtExpectedHead).mockRejectedValue(new Error("Dedicated branch head changed"))
    const response = await POST(request(await reviewedPublishBody()))
    const payload = await response.json()
    expect(response.status).toBe(502)
    expect(payload).toMatchObject({
      code: "BATCH_COMMIT_FAILED",
      branch: expect.stringMatching(/^repopress\/install\//u),
      recovery: expect.stringContaining("delete it manually"),
    })
    expect(deleteBranchRef).not.toHaveBeenCalled()
    expect(createPullRequest).not.toHaveBeenCalled()
  })

  it("returns an idempotent no-change success for an already-installed applicable plan", async () => {
    const dryRunResponse = await POST(request({ projectId: "project_123", item: "@repopress/callout", dryRun: true }))
    const dryRunPayload = await dryRunResponse.json()
    expect(dryRunResponse.status).toBe(200)

    const currentFiles = new Map(
      [...systemSnapshots, ...layoutSnapshots].map((snapshot) => [snapshot.path, snapshot.content]),
    )
    for (const change of dryRunPayload.plan.fileChanges as Array<{ path: string; after: string }>) {
      currentFiles.set(change.path, change.after)
    }
    vi.mocked(getTextFilesAtCommit)
      .mockReset()
      .mockImplementation(async (_token, _owner, _repo, _sha, paths) =>
        paths.flatMap((path) => {
          const content = currentFiles.get(path)
          return content === undefined ? [] : [{ path, content }]
        }),
      )
    vi.mocked(createBranchFromSha).mockClear()
    vi.mocked(batchCommitAtExpectedHead).mockClear()
    vi.mocked(createPullRequest).mockClear()

    const noChangeReview = await POST(request({ projectId: "project_123", item: "@repopress/callout", dryRun: true }))
    const noChangeReviewPayload = await noChangeReview.json()
    expect(noChangeReview.status).toBe(200)
    const noChangePublishBody = {
      projectId: "project_123",
      item: "@repopress/callout",
      dryRun: false,
      expectedBaseSha: BASE_SHA,
      expectedPlanDigest: noChangeReviewPayload.planDigest,
      expectedItemIntegrity: noChangeReviewPayload.item.integrity,
      idempotencyKey: "install-callout-001",
    }
    const response = await POST(request(noChangePublishBody))
    const payload = await response.json()
    expect(response.status).toBe(200)
    expect(payload).toMatchObject({
      ok: true,
      dryRun: false,
      noChanges: true,
      repository: { baseSha: BASE_SHA },
      plan: { applicable: true, fileChanges: [] },
      planDigest: expect.stringMatching(/^sha256:[a-f0-9]{64}$/u),
    })
    expect(createBranchFromSha).not.toHaveBeenCalled()
    expect(batchCommitAtExpectedHead).not.toHaveBeenCalled()
    expect(createPullRequest).not.toHaveBeenCalled()
    expect(deleteBranchRef).not.toHaveBeenCalled()

    const repeatedResponse = await POST(request(noChangePublishBody))
    expect(repeatedResponse.status).toBe(200)
    expect(await repeatedResponse.json()).toEqual(payload)
    expect(createBranchFromSha).not.toHaveBeenCalled()
  })

  it("keeps the committed review branch and reports it explicitly if PR creation fails", async () => {
    vi.mocked(createPullRequest).mockRejectedValue(new Error("PR failed"))
    const response = await POST(request(await reviewedPublishBody()))
    const payload = await response.json()
    expect(response.status).toBe(502)
    expect(payload.code).toBe("PULL_REQUEST_FAILED")
    expect(payload.branch).toMatch(/^repopress\/install\//u)
    expect(deleteBranchRef).not.toHaveBeenCalled()
  })

  it("rejects a newly-created PR whose returned head advanced beyond the reviewed commit", async () => {
    const reviewed = await reviewedPublishBody()
    vi.mocked(createPullRequest).mockResolvedValue({
      number: 42,
      url: "https://api.github.test/pulls/42",
      htmlUrl: "https://github.com/acme/docs/pull/42",
      headSha: "d".repeat(40),
      headRef: INSTALL_BRANCH,
      headRepoFullName: "acme/docs",
      baseRef: "main",
    })
    const response = await POST(request(reviewed))
    const payload = await response.json()
    expect(response.status).toBe(409)
    expect(payload).toMatchObject({ code: "PR_HEAD_DRIFT", branch: INSTALL_BRANCH, commitSha: COMMIT_SHA })
    expect(createPullRequest).toHaveBeenCalledOnce()
  })
})
