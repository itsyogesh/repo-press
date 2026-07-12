import { describe, expect, it } from "vitest"
import {
  previewDiagnosticSchema,
  previewFidelitySchema,
  previewResultSchema,
  previewSessionEventSchema,
  previewSessionStatusSchema,
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
})
