import { describe, expect, it } from "vitest"
import {
  fileOverlayOperationSchema,
  genericRenderModelSchema,
  previewDiagnosticSchema,
  previewFidelitySchema,
  previewRequestSchema,
  previewResultSchema,
  previewSessionEventSchema,
  previewSessionStatusSchema,
  runtimeProfileSchema,
} from "../contracts"

const validResult = {
  fidelity: "generic",
  sessionId: "session-1",
  snapshotVersion: 1,
  status: "ready",
  target: { kind: "safe-fallback", renderModel: { blocks: [] } },
  diagnostics: [],
  downgradeReasons: [],
  cache: { hit: false },
}

const validRequest = {
  filePath: "guides/start.mdx",
  snapshotVersion: 1,
  base: { ref: "refs/heads/main", commitSha: "abc123" },
  document: {
    contentType: "mdx",
    body: "# Start",
    metadata: { title: "Start", draft: false, nested: { order: 1 }, tags: ["docs"] },
  },
  overlay: [{ operation: "write", path: "guides/start.mdx", content: "# Start" }],
  viewport: { width: 1280, height: 720 },
  theme: "system",
}

const validRuntimeProfile = {
  framework: "next",
  frameworkVersion: "16.0.10",
  runtimeRoot: "apps/docs",
  contentRoots: ["content/docs"],
  packageManager: "pnpm",
  lockfilePath: "pnpm-lock.yaml",
  componentEntrypoints: ["mdx-components.tsx"],
  styleEntrypoints: ["app/globals.css"],
  capabilities: {
    clientComponents: true,
    serverComponents: true,
    css: true,
    portals: false,
    astroIslands: false,
  },
  detection: { confidence: 0.95, evidence: ["next dependency", "app directory"] },
}

describe("preview contracts", () => {
  it.each(["generic", "compatible", "native"])("accepts the %s fidelity grade", (fidelity) => {
    expect(previewFidelitySchema.safeParse(fidelity).success).toBe(true)
  })

  it.each(["exact", "fallback", "", null])("rejects the unsupported fidelity grade %s", (fidelity) => {
    expect(previewFidelitySchema.safeParse(fidelity).success).toBe(false)
  })

  it.each(["queued", "building", "ready", "failed", "expired"])("accepts the %s session status", (status) => {
    expect(previewSessionStatusSchema.safeParse(status).success).toBe(true)
  })

  it.each(["pending", "complete", "", null])("rejects the unsupported session status %s", (status) => {
    expect(previewSessionStatusSchema.safeParse(status).success).toBe(false)
  })

  it("rejects raw cache keys and credentials instead of stripping them", () => {
    expect(
      previewResultSchema.safeParse({
        ...validResult,
        cache: { hit: false, key: "must-not-be-client-visible" },
      }).success,
    ).toBe(false)
    expect(previewResultSchema.safeParse({ ...validResult, credential: "secret" }).success).toBe(false)
  })

  it.each(["stage", "severity", "code", "message", "recoverable"])("requires diagnostic field %s", (field) => {
    const diagnostic: Record<string, unknown> = {
      stage: "render",
      severity: "error",
      code: "PREVIEW_RENDER_FAILED",
      message: "Preview rendering failed",
      recoverable: true,
    }

    const { [field]: _missing, ...incompleteDiagnostic } = diagnostic
    expect(previewDiagnosticSchema.safeParse(incompleteDiagnostic).success).toBe(false)
  })

  it("requires positive snapshot versions and event sequences", () => {
    const event = {
      sessionId: "session-1",
      snapshotVersion: 1,
      sequence: 1,
      type: "status",
      payload: { status: "ready" },
    }

    expect(previewSessionEventSchema.safeParse(event).success).toBe(true)
    expect(previewSessionEventSchema.safeParse({ ...event, snapshotVersion: 0 }).success).toBe(false)
    expect(previewSessionEventSchema.safeParse({ ...event, sequence: 0 }).success).toBe(false)
  })

  it("rejects unknown session event fields", () => {
    expect(
      previewSessionEventSchema.safeParse({
        sessionId: "session-1",
        snapshotVersion: 1,
        sequence: 1,
        type: "status",
        payload: { status: "ready" },
        credential: "secret",
      }).success,
    ).toBe(false)
  })
})

describe("preview requests", () => {
  it.each(["md", "mdx"])("accepts a full server-constructed %s request", (contentType) => {
    const parsed = previewRequestSchema.parse({
      ...validRequest,
      document: { ...validRequest.document, contentType },
    })

    expect(parsed.overlay).toEqual(validRequest.overlay)
    expect(parsed.viewport).toEqual({ width: 1280, height: 720 })
    expect(parsed.theme).toBe("system")
  })

  it.each([
    "filePath",
    "snapshotVersion",
    "base",
    "document",
    "overlay",
    "viewport",
  ])("requires request field %s", (field) => {
    const request: Record<string, unknown> = { ...validRequest }
    delete request[field]
    expect(previewRequestSchema.safeParse(request).success).toBe(false)
  })

  it("allows theme to be omitted and rejects invalid themes", () => {
    const { theme: _theme, ...withoutTheme } = validRequest
    expect(previewRequestSchema.safeParse(withoutTheme).success).toBe(true)
    expect(previewRequestSchema.safeParse({ ...validRequest, theme: "repository" }).success).toBe(false)
  })

  it.each(["userId", "projectId", "repository", "provider"])("rejects client-authoritative root field %s", (field) => {
    expect(previewRequestSchema.safeParse({ ...validRequest, [field]: "untrusted" }).success).toBe(false)
  })

  it.each([
    ["base", { ...validRequest.base, credential: "secret" }],
    ["document", { ...validRequest.document, cacheKey: "raw-key" }],
    ["viewport", { ...validRequest.viewport, deviceId: "client-device" }],
  ])("rejects unknown fields nested inside %s", (field, nestedValue) => {
    expect(previewRequestSchema.safeParse({ ...validRequest, [field]: nestedValue }).success).toBe(false)
  })

  it.each([
    ["base", "ref"],
    ["base", "commitSha"],
    ["document", "contentType"],
    ["document", "body"],
    ["document", "metadata"],
    ["viewport", "width"],
    ["viewport", "height"],
  ])("requires nested request field %s.%s", (parent, field) => {
    const parentValue = validRequest[parent as "base" | "document" | "viewport"]
    const nested: Record<string, unknown> = { ...parentValue }
    delete nested[field]
    expect(previewRequestSchema.safeParse({ ...validRequest, [parent]: nested }).success).toBe(false)
  })

  it("validates overlay operations within requests", () => {
    expect(
      previewRequestSchema.safeParse({
        ...validRequest,
        overlay: [{ operation: "delete", path: "guides/old.mdx" }],
      }).success,
    ).toBe(true)
    expect(
      previewRequestSchema.safeParse({
        ...validRequest,
        overlay: [{ operation: "write", path: "guides/start.mdx" }],
      }).success,
    ).toBe(false)
  })
})

describe("serializable render and runtime data", () => {
  it("accepts strict write and delete overlay operations", () => {
    expect(
      fileOverlayOperationSchema.safeParse({ operation: "write", path: "guide.mdx", content: "# Guide" }).success,
    ).toBe(true)
    expect(fileOverlayOperationSchema.safeParse({ operation: "delete", path: "old.mdx" }).success).toBe(true)
    expect(fileOverlayOperationSchema.safeParse({ operation: "move", path: "old.mdx" }).success).toBe(false)
    expect(
      fileOverlayOperationSchema.safeParse({ operation: "delete", path: "old.mdx", credential: "secret" }).success,
    ).toBe(false)
  })

  it("accepts JSON render blocks and rejects non-JSON or unknown model data", () => {
    const model = { blocks: [{ type: "heading", depth: 1, text: "Hello", attributes: { hidden: false } }] }
    const parsed = genericRenderModelSchema.parse(model)

    expect(JSON.parse(JSON.stringify(parsed))).toEqual(model)
    expect(genericRenderModelSchema.safeParse({ blocks: [{ type: "component", render: () => null }] }).success).toBe(
      false,
    )
    expect(genericRenderModelSchema.safeParse({ blocks: [], cacheKey: "raw-key" }).success).toBe(false)
  })

  it("accepts a complete runtime profile and its optional fields", () => {
    const parsed = runtimeProfileSchema.parse(validRuntimeProfile)
    expect(JSON.parse(JSON.stringify(parsed))).toEqual(validRuntimeProfile)

    const {
      frameworkVersion: _version,
      packageManager: _manager,
      lockfilePath: _lockfile,
      ...minimalProfile
    } = validRuntimeProfile
    expect(runtimeProfileSchema.safeParse(minimalProfile).success).toBe(true)
  })

  it.each(["next", "fumadocs", "astro", "generic"])("accepts the %s runtime framework", (framework) => {
    expect(runtimeProfileSchema.safeParse({ ...validRuntimeProfile, framework }).success).toBe(true)
  })

  it.each(["npm", "pnpm", "yarn", "bun"])("accepts the %s package manager", (packageManager) => {
    expect(runtimeProfileSchema.safeParse({ ...validRuntimeProfile, packageManager }).success).toBe(true)
  })

  it("validates runtime profile enums, capabilities, detection, and strict boundaries", () => {
    expect(runtimeProfileSchema.safeParse({ ...validRuntimeProfile, framework: "docusaurus" }).success).toBe(false)
    expect(runtimeProfileSchema.safeParse({ ...validRuntimeProfile, packageManager: "deno" }).success).toBe(false)
    expect(
      runtimeProfileSchema.safeParse({
        ...validRuntimeProfile,
        capabilities: { ...validRuntimeProfile.capabilities, webSockets: true },
      }).success,
    ).toBe(false)
    expect(
      runtimeProfileSchema.safeParse({
        ...validRuntimeProfile,
        detection: { ...validRuntimeProfile.detection, confidence: 1.1 },
      }).success,
    ).toBe(false)
    expect(runtimeProfileSchema.safeParse({ ...validRuntimeProfile, executable: "repo-code" }).success).toBe(false)
  })
})

describe("preview results", () => {
  it("accepts a sandboxed iframe target", () => {
    expect(
      previewResultSchema.safeParse({
        ...validResult,
        fidelity: "native",
        target: { kind: "sandboxed-iframe", url: "https://preview.example/session-1" },
      }).success,
    ).toBe(true)
  })

  it.each([
    "fidelity",
    "sessionId",
    "snapshotVersion",
    "status",
    "target",
    "diagnostics",
    "downgradeReasons",
    "cache",
  ])("requires result field %s", (field) => {
    const result: Record<string, unknown> = { ...validResult }
    delete result[field]
    expect(previewResultSchema.safeParse(result).success).toBe(false)
  })

  it("rejects invalid targets and nested render-model fields", () => {
    expect(
      previewResultSchema.safeParse({ ...validResult, target: { kind: "popup", url: "https://example.com" } }).success,
    ).toBe(false)
    expect(
      previewResultSchema.safeParse({
        ...validResult,
        target: { kind: "sandboxed-iframe", url: "not-a-url" },
      }).success,
    ).toBe(false)
    expect(
      previewResultSchema.safeParse({
        ...validResult,
        target: { kind: "safe-fallback", renderModel: { blocks: [], credential: "secret" } },
      }).success,
    ).toBe(false)
  })
})

describe("preview diagnostics", () => {
  const baseDiagnostic = {
    stage: "render",
    severity: "warning",
    code: "PREVIEW_WARNING",
    message: "Preview was downgraded",
    recoverable: true,
  }

  it.each([
    "detect",
    "resolve",
    "install",
    "compile",
    "execute",
    "render",
    "asset",
  ])("accepts the %s stage", (stage) => {
    expect(previewDiagnosticSchema.safeParse({ ...baseDiagnostic, stage }).success).toBe(true)
  })

  it.each(["info", "warning", "error"])("accepts the %s severity", (severity) => {
    expect(previewDiagnosticSchema.safeParse({ ...baseDiagnostic, severity }).success).toBe(true)
  })

  it("accepts optional source context and fidelity impact", () => {
    expect(
      previewDiagnosticSchema.safeParse({
        ...baseDiagnostic,
        file: "components/Chart.tsx",
        line: 12,
        column: 4,
        importChain: ["page.mdx", "components/Chart.tsx"],
        fidelityImpact: "compatible",
      }).success,
    ).toBe(true)
  })

  it("rejects invalid enums and unknown fields", () => {
    expect(previewDiagnosticSchema.safeParse({ ...baseDiagnostic, stage: "hydrate" }).success).toBe(false)
    expect(previewDiagnosticSchema.safeParse({ ...baseDiagnostic, severity: "fatal" }).success).toBe(false)
    expect(previewDiagnosticSchema.safeParse({ ...baseDiagnostic, fidelityImpact: "exact" }).success).toBe(false)
    expect(previewDiagnosticSchema.safeParse({ ...baseDiagnostic, credential: "secret" }).success).toBe(false)
  })
})
