import { describe, expect, it } from "vitest"
import { COMPATIBLE_DOCUMENT_MAX_BYTES } from "../compatible-artifact"
import {
  compatiblePreviewRequestSchema,
  compatiblePreviewRouteResponseSchema,
  compatiblePreviewSourcePathSchema,
} from "../product-extension"
import { createSignedCompatibleFixture } from "./compatible-test-fixture"

const BASE_COMMIT = "a".repeat(40)

const validRequest = {
  projectId: "project-1",
  filePath: "apps/web/content/blog/hello.mdx",
  baseCommitSha: BASE_COMMIT,
  snapshotVersion: 1,
  documentSource: "# Hello",
}

describe("compatible product extension contract", () => {
  it("accepts only a strict bounded MDX request", () => {
    expect(compatiblePreviewRequestSchema.safeParse(validRequest).success).toBe(true)
    expect(compatiblePreviewRequestSchema.safeParse({ ...validRequest, extra: true }).success).toBe(false)
    expect(compatiblePreviewRequestSchema.safeParse({ ...validRequest, filePath: "post.md" }).success).toBe(false)
    expect(compatiblePreviewRequestSchema.safeParse({ ...validRequest, baseCommitSha: "abc123" }).success).toBe(false)
    expect(compatiblePreviewRequestSchema.safeParse({ ...validRequest, documentSource: "" }).success).toBe(false)
    expect(
      compatiblePreviewRequestSchema.safeParse({
        ...validRequest,
        documentSource: "x".repeat(COMPATIBLE_DOCUMENT_MAX_BYTES + 1),
      }).success,
    ).toBe(false)
  })

  it("rejects invalid snapshot versions", () => {
    for (const snapshotVersion of [0, -1, 1.5, Number.MAX_SAFE_INTEGER + 1]) {
      expect(compatiblePreviewRequestSchema.safeParse({ ...validRequest, snapshotVersion }).success).toBe(false)
    }
  })

  it("accepts only normalized repository-relative source paths", () => {
    expect(compatiblePreviewSourcePathSchema.safeParse(".repopress/mdx-preview.tsx").success).toBe(true)
    for (const filePath of [
      "",
      "/.repopress/mdx-preview.tsx",
      "../mdx-preview.tsx",
      ".repopress//mdx-preview.tsx",
      ".repopress/./mdx-preview.tsx",
      ".repopress\\mdx-preview.tsx",
      ".repopress/preview\nentry.tsx",
      ".repopress/preview\u0000entry.tsx",
    ]) {
      expect(compatiblePreviewSourcePathSchema.safeParse(filePath).success).toBe(false)
    }
  })

  it("requires the response result, authority, and signed resolution to describe one snapshot", async () => {
    const fixture = await createSignedCompatibleFixture({
      baseCommit: BASE_COMMIT,
      sessionId: "session-1",
      snapshotVersion: 7,
    })
    const response = {
      previewResult: {
        fidelity: "compatible" as const,
        sessionId: "session-1",
        snapshotVersion: 7,
        status: "ready" as const,
        target: { kind: "sandboxed-iframe" as const, url: "https://preview.example.test/sandbox/compatible" },
        diagnostics: [],
        downgradeReasons: [],
        cache: { hit: false },
      },
      resolution: fixture.wire,
      authority: fixture.expectedAuthority,
    }

    expect(compatiblePreviewRouteResponseSchema.safeParse(response).success).toBe(true)
    expect(compatiblePreviewRouteResponseSchema.safeParse({ ...response, extra: true }).success).toBe(false)
    expect(
      compatiblePreviewRouteResponseSchema.safeParse({
        ...response,
        authority: { ...response.authority, sessionId: "other-session" },
      }).success,
    ).toBe(false)
    expect(
      compatiblePreviewRouteResponseSchema.safeParse({
        ...response,
        previewResult: { ...response.previewResult, snapshotVersion: 8 },
      }).success,
    ).toBe(false)

    const decoded = JSON.parse(response.resolution)
    decoded.authority.projectId = "other-project"
    expect(
      compatiblePreviewRouteResponseSchema.safeParse({ ...response, resolution: JSON.stringify(decoded) }).success,
    ).toBe(false)
  })

  it("rejects malformed or oversized resolution wires before accepting a route response", async () => {
    const fixture = await createSignedCompatibleFixture({ baseCommit: BASE_COMMIT })
    const response = {
      previewResult: {
        fidelity: "compatible" as const,
        sessionId: "session-1",
        snapshotVersion: 1,
        status: "ready" as const,
        target: { kind: "sandboxed-iframe" as const, url: "https://preview.example.test/sandbox/compatible" },
        diagnostics: [],
        downgradeReasons: [],
        cache: { hit: false },
      },
      authority: fixture.expectedAuthority,
      resolution: fixture.wire,
    }

    expect(compatiblePreviewRouteResponseSchema.safeParse({ ...response, resolution: "{" }).success).toBe(false)
    expect(
      compatiblePreviewRouteResponseSchema.safeParse({
        ...response,
        resolution: "x".repeat(1024 * 1024 + 1),
      }).success,
    ).toBe(false)
  })
})
