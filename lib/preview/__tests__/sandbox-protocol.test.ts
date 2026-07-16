import { describe, expect, it } from "vitest"
import {
  acceptBootstrap,
  advanceSandboxSequence,
  createBootstrapCapability,
  invalidateSandboxSession,
  SANDBOX_BOOTSTRAP_TTL_MS,
  SANDBOX_MAX_COLLECTION_ITEMS,
  SANDBOX_MAX_DATA_DEPTH,
  SANDBOX_MAX_DATA_NODES,
  SANDBOX_MAX_MESSAGE_BYTES,
  SANDBOX_MAX_STRING_BYTES,
  SANDBOX_RATE_BURST,
  SANDBOX_RATE_WINDOW_MS,
  type SandboxSessionState,
  validateSandboxMessage,
} from "../sandbox-protocol"

const session = (overrides: Partial<SandboxSessionState> = {}): SandboxSessionState => ({
  sessionId: "session-1",
  snapshotVersion: 2,
  sequence: 0,
  invalidated: false,
  rateLimit: {
    windowStartedAt: 1_000,
    acceptedMessages: 0,
  },
  ...overrides,
})

const message = (overrides: Record<string, unknown> = {}) => ({
  protocolVersion: 1,
  type: "rendered",
  sessionId: "session-1",
  snapshotVersion: 2,
  sequence: 1,
  payload: {},
  ...overrides,
})

describe("opaque sandbox bootstrap", () => {
  it("accepts the exact WindowProxy and a single-use 256-bit capability", () => {
    const expectedWindow = {}
    const capability = createBootstrapCapability({ now: 5_000 })

    expect(capability).toMatch(/^[A-Za-z0-9_-]{43}$/)
    expect(
      acceptBootstrap({ expectedWindow, eventSource: expectedWindow, capability, origin: "null", now: 5_001 }),
    ).toBe(true)
    expect(
      acceptBootstrap({ expectedWindow, eventSource: expectedWindow, capability, origin: "null", now: 5_002 }),
    ).toBe(false)
  })

  it("never treats origin as authentication and does not consume on a foreign source", () => {
    const expectedWindow = {}
    const capability = createBootstrapCapability({ now: 10 })

    expect(
      acceptBootstrap({ expectedWindow, eventSource: {}, capability, origin: "https://trusted.test", now: 11 }),
    ).toBe(false)
    expect(acceptBootstrap({ expectedWindow, eventSource: expectedWindow, capability, origin: "null", now: 12 })).toBe(
      true,
    )
  })

  it("requires a non-null WindowProxy object even when source identity matches", () => {
    const capability = createBootstrapCapability({ now: 20 })

    expect(acceptBootstrap({ expectedWindow: null, eventSource: null, capability, origin: "null", now: 21 })).toBe(
      false,
    )
  })

  it("fails closed for wrong, malformed, expired, and rotated capabilities without throwing", () => {
    const expectedWindow = {}
    const expired = createBootstrapCapability({ now: 0 })
    const rotated = createBootstrapCapability({ now: 1 })
    createBootstrapCapability({ now: 2, rotate: rotated })

    const attempts = [
      () => acceptBootstrap({ expectedWindow, eventSource: expectedWindow, capability: "wrong", now: 2 }),
      () => acceptBootstrap({ expectedWindow, eventSource: expectedWindow, capability: null, now: 2 }),
      () =>
        acceptBootstrap({
          expectedWindow,
          eventSource: expectedWindow,
          capability: expired,
          now: SANDBOX_BOOTSTRAP_TTL_MS,
        }),
      () => acceptBootstrap({ expectedWindow, eventSource: expectedWindow, capability: rotated, now: 2 }),
    ]

    for (const attempt of attempts) {
      expect(attempt).not.toThrow()
      expect(attempt()).toBe(false)
    }

    expect(() => createBootstrapCapability({ now: Number.MAX_SAFE_INTEGER })).toThrow(TypeError)
  })
})

describe("sandbox message validation", () => {
  it("accepts and detaches a strict versioned plain-data message", () => {
    const input = message({
      type: "diagnostics",
      payload: {
        diagnostics: [
          {
            stage: "render",
            severity: "info",
            code: "READY",
            message: "Ready",
            importChain: ["entry.mdx"],
            recoverable: true,
          },
        ],
      },
    })
    const parsed = validateSandboxMessage(input, session(), { now: 1_001 })

    expect(parsed).toEqual(input)
    expect(parsed).not.toBe(input)
    expect(parsed?.payload).not.toBe(input.payload)
    expect(Object.isFrozen(parsed)).toBe(true)
    expect(Object.isFrozen(parsed?.payload)).toBe(true)

    ;(input.payload as { diagnostics: Array<{ importChain: string[] }> }).diagnostics[0].importChain[0] = "mutated"
    expect(parsed?.payload).toEqual({
      diagnostics: [
        {
          stage: "render",
          severity: "info",
          code: "READY",
          message: "Ready",
          importChain: ["entry.mdx"],
          recoverable: true,
        },
      ],
    })
  })

  it("rejects unknown fields, message types, payload fields, versions, and malformed identities without throwing", () => {
    const invalid = [
      message({ extra: true }),
      message({ type: "custom" }),
      message({ payload: { script: "no" } }),
      message({ protocolVersion: 2 }),
      message({ type: "" }),
      message({ sessionId: "" }),
      message({ snapshotVersion: 0 }),
      message({ snapshotVersion: Number.MAX_SAFE_INTEGER + 1 }),
      message({ sequence: 0 }),
      message({ sequence: Number.POSITIVE_INFINITY }),
      null,
      Object.create(null),
    ]

    for (const input of invalid) {
      expect(() => validateSandboxMessage(input, session(), { now: 1_001 })).not.toThrow()
      expect(validateSandboxMessage(input, session(), { now: 1_001 })).toBeNull()
    }
  })

  it("models every sandbox-to-host response with a strict payload", () => {
    const variants = [
      message({ type: "ready", payload: {} }),
      message({ type: "status", payload: { status: "rendering" } }),
      message({ type: "resize", payload: { height: 720 } }),
      message({
        type: "diagnostics",
        payload: {
          diagnostics: [
            {
              stage: "render",
              severity: "warning",
              code: "FALLBACK",
              message: "Used a fallback",
              recoverable: true,
            },
          ],
        },
      }),
      message({ type: "rendered", payload: {} }),
      message({ type: "error", payload: { code: "RENDER_FAILED", message: "Failed", recoverable: true } }),
      message({ type: "teardown", payload: {} }),
    ]

    for (const input of variants) {
      expect(validateSandboxMessage(input, session(), { now: 1_001 })).toEqual(input)
    }

    expect(
      validateSandboxMessage(message({ type: "ready", payload: { extra: true } }), session(), { now: 1_001 }),
    ).toBeNull()
    expect(
      validateSandboxMessage(message({ type: "status", payload: { status: "unknown" } }), session(), { now: 1_001 }),
    ).toBeNull()
  })

  it("rejects accessors without executing their getters", () => {
    let getterCalls = 0
    const input = message()
    Object.defineProperty(input.payload, "danger", {
      enumerable: true,
      get() {
        getterCalls += 1
        return "secret"
      },
    })

    expect(validateSandboxMessage(input, session(), { now: 1_001 })).toBeNull()
    expect(getterCalls).toBe(0)
  })

  it("rejects cycles, sparse arrays, exotic values, and non-finite numbers", () => {
    const cycle: Record<string, unknown> = {}
    cycle.self = cycle
    const sparse = Array.from({ length: 2 })
    sparse[1] = "present"

    const invalidPayloads = [
      cycle,
      sparse,
      new Date(),
      new Map(),
      Number.NaN,
      Number.NEGATIVE_INFINITY,
      BigInt(1),
      undefined,
      Symbol("value"),
      () => undefined,
    ]

    for (const payload of invalidPayloads) {
      expect(validateSandboxMessage(message({ payload }), session(), { now: 1_001 })).toBeNull()
    }
  })

  it("enforces string, collection, depth, node, and serialized UTF-8 limits", () => {
    let tooDeep: unknown = null
    for (let index = 0; index <= SANDBOX_MAX_DATA_DEPTH; index += 1) tooDeep = [tooDeep]

    const tooManyNodes = Array.from({ length: Math.ceil(SANDBOX_MAX_DATA_NODES / 64) }, () =>
      Array.from({ length: 64 }, () => null),
    )
    const tooManyItems = Array.from({ length: SANDBOX_MAX_COLLECTION_ITEMS + 1 }, () => null)
    const tooLongString = "🙂".repeat(Math.floor(SANDBOX_MAX_STRING_BYTES / 4) + 1)
    const largeChunk = "x".repeat(Math.floor(SANDBOX_MAX_MESSAGE_BYTES / 3))
    const tooLargeMessage = message({
      type: "diagnostics",
      payload: {
        diagnostics: [
          { stage: "render", severity: "error", code: largeChunk, message: largeChunk, recoverable: false },
          { stage: "render", severity: "error", code: "LARGE", message: largeChunk, recoverable: false },
        ],
      },
    })

    for (const payload of [tooDeep, tooManyNodes, tooManyItems, tooLongString]) {
      expect(validateSandboxMessage(message({ payload }), session(), { now: 1_001 })).toBeNull()
    }
    expect(validateSandboxMessage(tooLargeMessage, session(), { now: 1_001 })).toBeNull()
  })

  it("binds session and ordering while resetting sequence for a higher snapshot", () => {
    const current = session({ sequence: 7 })

    expect(validateSandboxMessage(message({ sessionId: "foreign", sequence: 8 }), current, { now: 1_001 })).toBeNull()
    expect(validateSandboxMessage(message({ snapshotVersion: 1, sequence: 99 }), current, { now: 1_001 })).toBeNull()
    expect(validateSandboxMessage(message({ sequence: 7 }), current, { now: 1_001 })).toBeNull()
    expect(validateSandboxMessage(message({ sequence: 6 }), current, { now: 1_001 })).toBeNull()
    expect(validateSandboxMessage(message({ snapshotVersion: 3, sequence: 1 }), current, { now: 1_001 })).not.toBeNull()
  })
})

describe("sandbox sequence and rate state", () => {
  it("advances immutably and caller mutation cannot alter accepted state", () => {
    const inputState = session()
    const inputMessage = message()
    const next = advanceSandboxSequence(inputState, inputMessage, { now: 1_001 })

    expect(next).not.toBe(inputState)
    expect(next.sequence).toBe(1)
    expect(next.rateLimit.acceptedMessages).toBe(1)
    expect(Object.isFrozen(next)).toBe(true)
    expect(Object.isFrozen(next.rateLimit)).toBe(true)

    ;(inputState as { sequence: number }).sequence = 99
    ;(inputState.rateLimit as { acceptedMessages: number }).acceptedMessages = 99
    inputMessage.sequence = 99
    expect(next.sequence).toBe(1)
    expect(next.rateLimit.acceptedMessages).toBe(1)
  })

  it("permits the documented burst, rejects the next message, and recovers at the window boundary", () => {
    let state = session()
    for (let sequence = 1; sequence <= SANDBOX_RATE_BURST; sequence += 1) {
      const input = message({ sequence })
      expect(validateSandboxMessage(input, state, { now: 1_000 + SANDBOX_RATE_WINDOW_MS - 1 })).not.toBeNull()
      state = advanceSandboxSequence(state, input, { now: 1_000 + SANDBOX_RATE_WINDOW_MS - 1 })
    }

    const overBurst = message({ sequence: SANDBOX_RATE_BURST + 1 })
    expect(validateSandboxMessage(overBurst, state, { now: 1_000 + SANDBOX_RATE_WINDOW_MS - 1 })).toBeNull()
    expect(validateSandboxMessage(overBurst, state, { now: 1_000 + SANDBOX_RATE_WINDOW_MS })).not.toBeNull()

    const recovered = advanceSandboxSequence(state, overBurst, { now: 1_000 + SANDBOX_RATE_WINDOW_MS })
    expect(recovered.rateLimit).toEqual({
      windowStartedAt: 1_000 + SANDBOX_RATE_WINDOW_MS,
      acceptedMessages: 1,
    })
  })

  it("fails closed for invalid timestamps and never advances an invalid message", () => {
    const stateBefore = session()

    expect(validateSandboxMessage(message(), stateBefore, { now: Number.NaN })).toBeNull()
    expect(validateSandboxMessage(message(), stateBefore, { now: Number.MAX_SAFE_INTEGER + 1 })).toBeNull()
    expect(advanceSandboxSequence(stateBefore, message({ sequence: 0 }), { now: 1_001 })).toBe(stateBefore)
  })

  it("invalidates idempotently and rejects every later message", () => {
    const active = session()
    const invalid = invalidateSandboxSession(active)

    expect(invalid.invalidated).toBe(true)
    expect(Object.isFrozen(invalid)).toBe(true)
    expect(invalidateSandboxSession(invalid)).toBe(invalid)
    expect(validateSandboxMessage(message(), invalid, { now: 1_001 })).toBeNull()
    expect(advanceSandboxSequence(invalid, message(), { now: 1_001 })).toBe(invalid)
  })

  it("treats a sandbox teardown message as terminal", () => {
    const tornDown = advanceSandboxSequence(session(), message({ type: "teardown" }), { now: 1_001 })

    expect(tornDown.invalidated).toBe(true)
    expect(validateSandboxMessage(message({ sequence: 2 }), tornDown, { now: 1_002 })).toBeNull()
  })
})
