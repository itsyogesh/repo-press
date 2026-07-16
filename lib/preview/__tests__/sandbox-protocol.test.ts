import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import {
  acceptBootstrap,
  advanceSandboxSequence,
  createBootstrapCapability,
  createSandboxSessionState,
  invalidateBootstrapCapability,
  invalidateSandboxSession,
  rotateSandboxSnapshot,
  SANDBOX_BOOTSTRAP_TTL_MS,
  SANDBOX_CAPABILITY_COLLISION_ATTEMPTS,
  SANDBOX_MAX_ACTIVE_CAPABILITIES,
  SANDBOX_MAX_COLLECTION_ITEMS,
  SANDBOX_MAX_DATA_DEPTH,
  SANDBOX_MAX_DATA_NODES,
  SANDBOX_MAX_MESSAGE_BYTES,
  SANDBOX_MAX_STRING_BYTES,
  SANDBOX_RATE_BURST,
  SANDBOX_RATE_WINDOW_MS,
  validateSandboxMessage,
} from "../sandbox-protocol"

const issuedCapabilities = new Set<string>()

const issueCapability = (expectedWindow: object, sessionId = "session-1", rotate?: string) => {
  const capability = createBootstrapCapability({ expectedWindow, sessionId, rotate })
  issuedCapabilities.add(capability)
  return capability
}

const session = (snapshotVersion = 2) =>
  createSandboxSessionState({
    sessionId: "session-1",
    snapshotVersion,
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

beforeEach(() => {
  vi.useFakeTimers()
  vi.setSystemTime(new Date(1_000))
})

afterEach(() => {
  for (const capability of issuedCapabilities) invalidateBootstrapCapability(capability)
  issuedCapabilities.clear()
  vi.restoreAllMocks()
  vi.useRealTimers()
})

describe("opaque sandbox bootstrap", () => {
  it("binds a single-use 256-bit capability to its intended WindowProxy and session", () => {
    const expectedWindow = {}
    const capability = issueCapability(expectedWindow)

    expect(capability).toMatch(/^[A-Za-z0-9_-]{43}$/)
    expect(
      acceptBootstrap({
        expectedWindow,
        eventSource: expectedWindow,
        capability,
        sessionId: "session-1",
        origin: "null",
      }),
    ).toBe(true)
    expect(
      acceptBootstrap({
        expectedWindow,
        eventSource: expectedWindow,
        capability,
        sessionId: "session-1",
        origin: "null",
      }),
    ).toBe(false)
  })

  it("cannot be bypassed by passing an attacker window as both declared identities", () => {
    const intendedWindow = {}
    const attackerWindow = {}
    const capability = issueCapability(intendedWindow)

    expect(
      acceptBootstrap({
        expectedWindow: attackerWindow,
        eventSource: attackerWindow,
        capability,
        sessionId: "session-1",
        origin: "https://trusted.test",
      }),
    ).toBe(false)
    expect(
      acceptBootstrap({
        expectedWindow: intendedWindow,
        eventSource: intendedWindow,
        capability,
        sessionId: "session-1",
        origin: "null",
      }),
    ).toBe(true)
  })

  it("rejects a wrong session without consuming the intended bootstrap", () => {
    const expectedWindow = {}
    const capability = issueCapability(expectedWindow)

    expect(
      acceptBootstrap({
        expectedWindow,
        eventSource: expectedWindow,
        capability,
        sessionId: "foreign",
        origin: "null",
      }),
    ).toBe(false)
    expect(
      acceptBootstrap({
        expectedWindow,
        eventSource: expectedWindow,
        capability,
        sessionId: "session-1",
        origin: "null",
      }),
    ).toBe(true)
  })

  it("fails closed for malformed bootstrap attempts without throwing", () => {
    const expectedWindow = {}
    const capability = issueCapability(expectedWindow)
    const attempts = [
      () => acceptBootstrap({ expectedWindow, eventSource: expectedWindow, capability: null, sessionId: "session-1" }),
      () => acceptBootstrap({ expectedWindow: null, eventSource: null, capability, sessionId: "session-1" }),
      () => acceptBootstrap(undefined as never),
    ]

    for (const attempt of attempts) {
      expect(attempt).not.toThrow()
      expect(attempt()).toBe(false)
    }
  })

  it("fails closed on expiry, clock rollback, rotation, and explicit invalidation", () => {
    const expectedWindow = {}
    const expired = issueCapability(expectedWindow)
    vi.setSystemTime(new Date(1_000 + SANDBOX_BOOTSTRAP_TTL_MS))
    expect(
      acceptBootstrap({ expectedWindow, eventSource: expectedWindow, capability: expired, sessionId: "session-1" }),
    ).toBe(false)

    vi.setSystemTime(new Date(2_000))
    const rollback = issueCapability(expectedWindow)
    vi.setSystemTime(new Date(1_999))
    expect(
      acceptBootstrap({ expectedWindow, eventSource: expectedWindow, capability: rollback, sessionId: "session-1" }),
    ).toBe(false)

    vi.setSystemTime(new Date(3_000))
    const oldCapability = issueCapability(expectedWindow)
    const replacement = issueCapability(expectedWindow, "session-1", oldCapability)
    expect(
      acceptBootstrap({
        expectedWindow,
        eventSource: expectedWindow,
        capability: oldCapability,
        sessionId: "session-1",
      }),
    ).toBe(false)
    expect(invalidateBootstrapCapability(replacement)).toBe(true)
    expect(invalidateBootstrapCapability(replacement)).toBe(false)
  })

  it("bounds active capability records", () => {
    const expectedWindow = {}
    const capabilities = Array.from({ length: SANDBOX_MAX_ACTIVE_CAPABILITIES }, () => issueCapability(expectedWindow))

    expect(() => issueCapability(expectedWindow)).toThrow(/active bootstrap capability limit/i)
    for (const capability of capabilities) invalidateBootstrapCapability(capability)
  })

  it("bounds repeated cryptographic collisions instead of looping", () => {
    let calls = 0
    const getRandomValues = vi.spyOn(globalThis.crypto, "getRandomValues").mockImplementation(((array: Uint8Array) => {
      calls += 1
      array.fill(calls <= SANDBOX_CAPABILITY_COLLISION_ATTEMPTS + 1 ? 0 : calls)
      return array
    }) as Crypto["getRandomValues"])
    const expectedWindow = {}
    const first = issueCapability(expectedWindow)

    expect(() => issueCapability(expectedWindow)).toThrow(/unique bootstrap capability/i)
    expect(getRandomValues).toHaveBeenCalledTimes(SANDBOX_CAPABILITY_COLLISION_ATTEMPTS + 1)
    invalidateBootstrapCapability(first)
  })
})

describe("host-owned sandbox state", () => {
  it("creates immutable state with host-owned identity and snapshot authority", () => {
    const state = session()

    expect(state).toEqual({
      sessionId: "session-1",
      snapshotVersion: 2,
      sequence: 0,
      invalidated: false,
      rateLimit: { windowStartedAt: 1_000, acceptedMessages: 0 },
    })
    expect(Object.isFrozen(state)).toBe(true)
    expect(Object.isFrozen(state.rateLimit)).toBe(true)
    expect(() => createSandboxSessionState({ sessionId: "", snapshotVersion: 2 })).toThrow(TypeError)
    expect(() => createSandboxSessionState({ sessionId: "session-1", snapshotVersion: 0 })).toThrow(TypeError)
  })

  it("rotates only to a higher host snapshot and resets ordering and rate state", () => {
    const first = validateSandboxMessage(message(), session())
    expect(first.accepted).toBe(true)
    vi.setSystemTime(new Date(1_500))

    const rotated = rotateSandboxSnapshot(first.nextState, { snapshotVersion: 3 })
    expect(rotated).toEqual({
      sessionId: "session-1",
      snapshotVersion: 3,
      sequence: 0,
      invalidated: false,
      rateLimit: { windowStartedAt: 1_500, acceptedMessages: 0 },
    })
    expect(() => rotateSandboxSnapshot(rotated, { snapshotVersion: 3 })).toThrow(TypeError)
  })
})

describe("atomic inbound attempt validation", () => {
  it("returns a detached successful result whose next state already carries sequence and rate", () => {
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
    const result = validateSandboxMessage(input, session())

    expect(result.accepted).toBe(true)
    if (!result.accepted) throw new Error("expected validation success")
    expect(result.message).toEqual(input)
    expect(result.message).not.toBe(input)
    expect(result.nextState.sequence).toBe(1)
    expect(result.nextState.rateLimit.acceptedMessages).toBe(1)
    expect(Object.isFrozen(result)).toBe(true)
    expect(Object.isFrozen(result.message)).toBe(true)
    expect(advanceSandboxSequence(result)).toBe(result.nextState)

    ;(input.payload as { diagnostics: Array<{ importChain: string[] }> }).diagnostics[0].importChain[0] = "mutated"
    expect(result.message.payload).toEqual({
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

  it("charges malformed, wrong-session, schema-invalid, oversized, and replay attempts", () => {
    let state = session()
    const attempts: Array<{ input: unknown; code: string }> = [
      { input: undefined, code: "MALFORMED_MESSAGE" },
      { input: message({ sessionId: "foreign" }), code: "SESSION_MISMATCH" },
      { input: message({ extra: true }), code: "SCHEMA_INVALID" },
      {
        input: message({ type: "error", payload: { code: "X", message: "x".repeat(SANDBOX_MAX_MESSAGE_BYTES) } }),
        code: "MESSAGE_TOO_LARGE",
      },
    ]

    for (const [index, attempt] of attempts.entries()) {
      const result = validateSandboxMessage(attempt.input, state)
      expect(result).toMatchObject({ accepted: false, code: attempt.code })
      expect(result.nextState.rateLimit.acceptedMessages).toBe(index + 1)
      state = result.nextState
    }

    const accepted = validateSandboxMessage(message(), state)
    expect(accepted.accepted).toBe(true)
    state = accepted.nextState
    const replay = validateSandboxMessage(message(), state)
    expect(replay).toMatchObject({ accepted: false, code: "SEQUENCE_MISMATCH" })
    expect(replay.nextState.rateLimit.acceptedMessages).toBe(attempts.length + 2)
  })

  it("limits 32 total attempts before parsing the 33rd and recovers exactly at the window boundary", () => {
    let state = session()
    for (let attempt = 0; attempt < SANDBOX_RATE_BURST; attempt += 1) {
      state = validateSandboxMessage(null, state).nextState
    }

    let getterCalls = 0
    const expensive = message()
    Object.defineProperty(expensive, "payload", {
      enumerable: true,
      get() {
        getterCalls += 1
        return {}
      },
    })
    const limited = validateSandboxMessage(expensive, state)
    expect(limited).toMatchObject({ accepted: false, code: "RATE_LIMIT" })
    expect(limited.nextState).toBe(state)
    expect(getterCalls).toBe(0)

    vi.setSystemTime(new Date(1_000 + SANDBOX_RATE_WINDOW_MS))
    const recovered = validateSandboxMessage(message(), state)
    expect(recovered.accepted).toBe(true)
    expect(recovered.nextState.rateLimit).toEqual({
      windowStartedAt: 1_000 + SANDBOX_RATE_WINDOW_MS,
      acceptedMessages: 1,
    })
  })

  it("requires the exact host snapshot and next contiguous sequence", () => {
    let state = session()

    for (const snapshotVersion of [1, 3]) {
      const result = validateSandboxMessage(message({ snapshotVersion }), state)
      expect(result).toMatchObject({ accepted: false, code: "SNAPSHOT_MISMATCH" })
      state = result.nextState
    }
    for (const sequence of [2, 99, Number.MAX_SAFE_INTEGER]) {
      const result = validateSandboxMessage(message({ sequence }), state)
      expect(result).toMatchObject({ accepted: false, code: "SEQUENCE_MISMATCH" })
      expect(result.nextState.sequence).toBe(0)
      state = result.nextState
    }

    const exact = validateSandboxMessage(message({ sequence: 1 }), state)
    expect(exact.accepted).toBe(true)
    expect(exact.nextState.sequence).toBe(1)
  })

  it("rejects old frame messages after a host snapshot rotation", () => {
    const rotated = rotateSandboxSnapshot(session(), { snapshotVersion: 3 })

    expect(validateSandboxMessage(message({ snapshotVersion: 2 }), rotated)).toMatchObject({
      accepted: false,
      code: "SNAPSHOT_MISMATCH",
    })
    expect(validateSandboxMessage(message({ snapshotVersion: 3 }), rotated).accepted).toBe(true)
  })
})

describe("allocation-bounded strict schemas", () => {
  it("models every inert sandbox-to-host response and rejects unknown payload fields", () => {
    const variants = [
      message({ type: "ready", payload: {} }),
      message({ type: "status", payload: { status: "rendering" } }),
      message({ type: "resize", payload: { width: 1280, height: 720 } }),
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

    for (const input of variants) expect(validateSandboxMessage(input, session()).accepted).toBe(true)
    expect(validateSandboxMessage(message({ type: "ready", payload: { extra: true } }), session())).toMatchObject({
      accepted: false,
      code: "SCHEMA_INVALID",
    })
    for (const invalid of [
      message({ extra: true }),
      message({ protocolVersion: 2 }),
      message({ sessionId: "" }),
      message({ snapshotVersion: 0 }),
      message({ sequence: 0 }),
      message({ sequence: Number.POSITIVE_INFINITY }),
    ]) {
      expect(validateSandboxMessage(invalid, session()).accepted).toBe(false)
    }
  })

  it("rejects accessors without getter execution", () => {
    let getterCalls = 0
    const input = message()
    Object.defineProperty(input.payload, "danger", {
      enumerable: true,
      get() {
        getterCalls += 1
        return "secret"
      },
    })

    expect(validateSandboxMessage(input, session())).toMatchObject({ accepted: false, code: "MALFORMED_MESSAGE" })
    expect(getterCalls).toBe(0)
  })

  it("rejects cycles, sparse arrays, exotic values, and non-finite numbers", () => {
    const cycle: Record<string, unknown> = {}
    cycle.self = cycle
    const sparse: unknown[] = []
    sparse.length = 2
    sparse[1] = "present"

    for (const payload of [
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
    ]) {
      expect(validateSandboxMessage(message({ payload }), session())).toMatchObject({
        accepted: false,
        code: "MALFORMED_MESSAGE",
      })
    }
  })

  it("stops cumulative UTF-8 traversal before inspecting later descriptors", () => {
    let lateDescriptorReads = 0
    let getterCalls = 0
    const target = {
      first: "x".repeat(Math.floor(SANDBOX_MAX_MESSAGE_BYTES / 3)),
      second: "x".repeat(Math.floor(SANDBOX_MAX_MESSAGE_BYTES / 3)),
      third: "x".repeat(Math.floor(SANDBOX_MAX_MESSAGE_BYTES / 3)),
    }
    Object.defineProperty(target, "late", {
      enumerable: true,
      get() {
        getterCalls += 1
        return "never"
      },
    })
    const payload = new Proxy(target, {
      getOwnPropertyDescriptor(object, property) {
        if (property === "late") lateDescriptorReads += 1
        return Reflect.getOwnPropertyDescriptor(object, property)
      },
    })

    expect(validateSandboxMessage(message({ payload }), session())).toMatchObject({
      accepted: false,
      code: "MESSAGE_TOO_LARGE",
    })
    expect(lateDescriptorReads).toBe(0)
    expect(getterCalls).toBe(0)
  })

  it("bounds individual strings, collections, depth, and total nodes", () => {
    let tooDeep: unknown = null
    for (let index = 0; index <= SANDBOX_MAX_DATA_DEPTH; index += 1) tooDeep = [tooDeep]
    const tooManyNodes = Array.from({ length: Math.ceil(SANDBOX_MAX_DATA_NODES / 64) }, () =>
      Array.from({ length: 64 }, () => null),
    )
    const tooManyItems = Array.from({ length: SANDBOX_MAX_COLLECTION_ITEMS + 1 }, () => null)
    const tooLongString = "🙂".repeat(Math.floor(SANDBOX_MAX_STRING_BYTES / 4) + 1)

    for (const payload of [tooDeep, tooManyNodes, tooManyItems, tooLongString]) {
      expect(validateSandboxMessage(message({ payload }), session()).accepted).toBe(false)
    }
  })
})

describe("teardown", () => {
  it("invalidates explicitly and through a terminal sandbox message", () => {
    const expectedWindow = {}
    const pendingCapability = issueCapability(expectedWindow)
    const invalid = invalidateSandboxSession(session())
    expect(invalid.invalidated).toBe(true)
    expect(invalidateSandboxSession(invalid)).toBe(invalid)
    expect(
      acceptBootstrap({
        expectedWindow,
        eventSource: expectedWindow,
        capability: pendingCapability,
        sessionId: "session-1",
      }),
    ).toBe(false)
    expect(validateSandboxMessage(message(), invalid)).toMatchObject({ accepted: false, code: "SESSION_INVALIDATED" })

    const teardown = validateSandboxMessage(message({ type: "teardown" }), session())
    expect(teardown.accepted).toBe(true)
    expect(teardown.nextState.invalidated).toBe(true)
    expect(validateSandboxMessage(message({ sequence: 2 }), teardown.nextState)).toMatchObject({
      accepted: false,
      code: "SESSION_INVALIDATED",
    })
  })
})
