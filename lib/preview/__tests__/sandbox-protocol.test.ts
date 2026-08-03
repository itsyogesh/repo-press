import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import {
  acceptBootstrap,
  advanceSandboxSequence,
  createBootstrapCapability,
  createSandboxAssetResponse,
  createSandboxSessionState,
  invalidateBootstrapCapability,
  invalidateSandboxSession,
  parseSandboxAssetDelivery,
  rotateSandboxSnapshot,
  SANDBOX_BOOTSTRAP_TTL_MS,
  SANDBOX_CAPABILITY_COLLISION_ATTEMPTS,
  SANDBOX_MAX_ACTIVE_CAPABILITIES,
  SANDBOX_MAX_ASSET_BYTES,
  SANDBOX_MAX_ASSET_ITEMS,
  SANDBOX_MAX_ASSET_SOURCE_BYTES,
  SANDBOX_MAX_COLLECTION_ITEMS,
  SANDBOX_MAX_DATA_DEPTH,
  SANDBOX_MAX_DATA_NODES,
  SANDBOX_MAX_MESSAGE_BYTES,
  SANDBOX_MAX_STRING_BYTES,
  SANDBOX_RATE_BURST,
  SANDBOX_RATE_WINDOW_MS,
  serializeSandboxAssetError,
  serializeSandboxMessage,
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

const serializedMessage = (overrides: Record<string, unknown> = {}) => serializeSandboxMessage(message(overrides))
const rawMessage = (overrides: Record<string, unknown> = {}) => JSON.stringify(message(overrides))

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
  it("creates immutable state with attempted-message accounting", () => {
    const state = session()

    expect(state).toEqual({
      sessionId: "session-1",
      snapshotVersion: 2,
      sequence: 0,
      invalidated: false,
      rateLimit: { windowStartedAt: 1_000, attemptedMessages: 0 },
    })
    expect(Object.isFrozen(state)).toBe(true)
    expect(Object.isFrozen(state.rateLimit)).toBe(true)
  })

  it("rotates snapshot authority without resetting the current rate window", () => {
    let state = session()
    for (let attempt = 0; attempt < SANDBOX_RATE_BURST; attempt += 1) {
      state = advanceSandboxSequence(validateSandboxMessage("{", state))
    }
    vi.setSystemTime(new Date(1_500))

    const rotated = rotateSandboxSnapshot(state, { snapshotVersion: 3 })
    expect(rotated).toEqual({
      sessionId: "session-1",
      snapshotVersion: 3,
      sequence: 0,
      invalidated: false,
      rateLimit: { windowStartedAt: 1_000, attemptedMessages: SANDBOX_RATE_BURST },
    })
    expect(validateSandboxMessage(serializedMessage({ snapshotVersion: 3 }), rotated)).toMatchObject({
      accepted: false,
      code: "RATE_LIMIT",
    })

    vi.setSystemTime(new Date(1_000 + SANDBOX_RATE_WINDOW_MS))
    const recovered = validateSandboxMessage(serializedMessage({ snapshotVersion: 3 }), rotated)
    expect(recovered.accepted).toBe(true)
    expect(recovered.nextState.rateLimit).toEqual({ windowStartedAt: 2_000, attemptedMessages: 1 })
  })
})

describe("canonical atomic application", () => {
  it("uses one unconditional validate-and-apply path for successes and refusals", () => {
    let state = session()
    const handle = (wire: unknown) => {
      const validation = validateSandboxMessage(wire, state)
      state = advanceSandboxSequence(validation)
      return validation
    }

    const malformed = handle("{")
    expect(malformed).toMatchObject({ accepted: false, code: "MALFORMED_MESSAGE" })
    expect(state.sequence).toBe(0)
    expect(state.rateLimit.attemptedMessages).toBe(1)

    const accepted = handle(serializedMessage())
    expect(accepted.accepted).toBe(true)
    expect(state.sequence).toBe(1)
    expect(state.rateLimit.attemptedMessages).toBe(2)

    expect(() => advanceSandboxSequence(malformed)).toThrow(/already applied/i)
    expect(() => advanceSandboxSequence({ ...accepted } as never)).toThrow(/authentic validation result/i)
  })

  it("charges malformed, wrong-session, schema-invalid, oversized, and replay attempts", () => {
    let state = session()
    const handle = (wire: unknown) => {
      const validation = validateSandboxMessage(wire, state)
      state = advanceSandboxSequence(validation)
      return validation
    }
    const attempts: Array<{ input: unknown; code: string }> = [
      { input: "{", code: "MALFORMED_MESSAGE" },
      { input: serializedMessage({ sessionId: "foreign" }), code: "SESSION_MISMATCH" },
      { input: rawMessage({ extra: true }), code: "SCHEMA_INVALID" },
      {
        input: rawMessage({ type: "error", payload: { code: "X", message: "x".repeat(SANDBOX_MAX_MESSAGE_BYTES) } }),
        code: "MESSAGE_TOO_LARGE",
      },
    ]

    for (const [index, attempt] of attempts.entries()) {
      expect(handle(attempt.input)).toMatchObject({ accepted: false, code: attempt.code })
      expect(state.rateLimit.attemptedMessages).toBe(index + 1)
    }
    expect(handle(serializedMessage()).accepted).toBe(true)
    expect(handle(serializedMessage())).toMatchObject({ accepted: false, code: "SEQUENCE_MISMATCH" })
    expect(state.sequence).toBe(1)
    expect(state.rateLimit.attemptedMessages).toBe(attempts.length + 2)
  })

  it("limits 32 total attempts before parsing the 33rd and recovers at the exact boundary", () => {
    let state = session()
    for (let attempt = 0; attempt < SANDBOX_RATE_BURST; attempt += 1) {
      state = advanceSandboxSequence(validateSandboxMessage("{", state))
    }
    const parse = vi.spyOn(JSON, "parse")
    const limited = validateSandboxMessage(serializedMessage(), state)
    expect(limited).toMatchObject({ accepted: false, code: "RATE_LIMIT" })
    expect(parse).not.toHaveBeenCalled()
    state = advanceSandboxSequence(limited)

    vi.setSystemTime(new Date(1_000 + SANDBOX_RATE_WINDOW_MS))
    const recovered = validateSandboxMessage(serializedMessage(), state)
    expect(recovered.accepted).toBe(true)
    expect(recovered.nextState.rateLimit).toEqual({ windowStartedAt: 2_000, attemptedMessages: 1 })
  })

  it("requires the exact host snapshot and contiguous sequence", () => {
    let state = session()
    for (const snapshotVersion of [1, 3]) {
      const result = validateSandboxMessage(serializedMessage({ snapshotVersion }), state)
      expect(result).toMatchObject({ accepted: false, code: "SNAPSHOT_MISMATCH" })
      state = advanceSandboxSequence(result)
    }
    for (const sequence of [2, 99, Number.MAX_SAFE_INTEGER]) {
      const result = validateSandboxMessage(serializedMessage({ sequence }), state)
      expect(result).toMatchObject({ accepted: false, code: "SEQUENCE_MISMATCH" })
      state = advanceSandboxSequence(result)
      expect(state.sequence).toBe(0)
    }
  })
})

describe("serialized allocation boundary", () => {
  it("serializes and validates every inert sandbox-to-host response", () => {
    const variants = [
      serializedMessage({ type: "ready", payload: {} }),
      serializedMessage({ type: "status", payload: { status: "rendering" } }),
      serializedMessage({ type: "resize", payload: { width: 1280, height: 720 } }),
      serializedMessage({ type: "diagnostics", payload: { diagnostics: [] } }),
      serializedMessage({ type: "rendered", payload: {} }),
      serializedMessage({
        type: "asset-request",
        payload: { requestId: "asset-1", source: "images/cover.png" },
      }),
      serializedMessage({ type: "error", payload: { code: "RENDER_FAILED", message: "Failed", recoverable: true } }),
      serializedMessage({ type: "teardown", payload: {} }),
    ]

    for (const wire of variants) expect(validateSandboxMessage(wire, session()).accepted).toBe(true)
  })

  it("rejects non-string transport before object traps or getters", () => {
    let ownKeysCalls = 0
    let getterCalls = 0
    const objectTransport = new Proxy(
      Object.defineProperty({}, "payload", {
        enumerable: true,
        get() {
          getterCalls += 1
          return {}
        },
      }),
      {
        ownKeys() {
          ownKeysCalls += 1
          throw new Error("must not enumerate")
        },
      },
    )

    const result = validateSandboxMessage(objectTransport, session())
    expect(result).toMatchObject({ accepted: false, code: "INVALID_TRANSPORT" })
    expect(result.nextState.rateLimit.attemptedMessages).toBe(1)
    expect(ownKeysCalls).toBe(0)
    expect(getterCalls).toBe(0)
  })

  it("caps UTF-8 bytes before JSON.parse even when code-unit length is below the byte limit", () => {
    const wire = `{"large":"${"🙂".repeat(Math.floor(SANDBOX_MAX_MESSAGE_BYTES / 4) + 1)}"}`
    expect(wire.length).toBeLessThan(SANDBOX_MAX_MESSAGE_BYTES)
    const parse = vi.spyOn(JSON, "parse")

    const result = validateSandboxMessage(wire, session())
    expect(result).toMatchObject({ accepted: false, code: "MESSAGE_TOO_LARGE" })
    expect(parse).not.toHaveBeenCalled()
  })

  it("rejects dangerous keys, malformed JSON, and non-finite JSON tokens", () => {
    const dangerous = rawMessage().replace('"payload":{}', '"payload":{"__proto__":{}}')
    expect(validateSandboxMessage(dangerous, session())).toMatchObject({ accepted: false, code: "MALFORMED_MESSAGE" })
    for (const wire of ["{", "NaN", "Infinity", "-Infinity"]) {
      expect(validateSandboxMessage(wire, session())).toMatchObject({ accepted: false, code: "MALFORMED_MESSAGE" })
    }
  })

  it("retains fail-closed defenses for object, cyclic, sparse, accessor, and exotic inputs", () => {
    const cycle: Record<string, unknown> = {}
    cycle.self = cycle
    const sparse: unknown[] = []
    sparse.length = 2
    sparse[1] = "present"

    for (const input of [cycle, sparse, new Date(), new Map(), Number.NaN, BigInt(1), Symbol("value")]) {
      expect(validateSandboxMessage(input, session())).toMatchObject({ accepted: false, code: "INVALID_TRANSPORT" })
    }
  })

  it("bounds post-parse strings, collections, depth, and nodes without full key snapshots", () => {
    let tooDeep: unknown = null
    for (let index = 0; index <= SANDBOX_MAX_DATA_DEPTH; index += 1) tooDeep = [tooDeep]
    const tooManyNodes = Array.from({ length: Math.ceil(SANDBOX_MAX_DATA_NODES / 64) }, () =>
      Array.from({ length: 64 }, () => null),
    )
    const tooManyItems = Array.from({ length: SANDBOX_MAX_COLLECTION_ITEMS + 1 }, () => null)
    const tooLongString = "x".repeat(SANDBOX_MAX_STRING_BYTES + 1)

    for (const payload of [tooDeep, tooManyNodes, tooManyItems, tooLongString]) {
      expect(validateSandboxMessage(rawMessage({ payload }), session()).accepted).toBe(false)
    }
  })
})

describe("authenticated asset delivery", () => {
  const expected = {
    sessionId: "session-1",
    snapshotVersion: 2,
    requestId: "asset-1",
    source: "images/cover.png",
  }

  it("keeps request controls bounded by item, id, and source limits", () => {
    expect(SANDBOX_MAX_ASSET_ITEMS).toBe(8)
    expect(
      validateSandboxMessage(
        serializedMessage({ type: "asset-request", payload: { requestId: "asset-1", source: "images/cover.png" } }),
        session(),
      ).accepted,
    ).toBe(true)
    expect(() =>
      serializeSandboxMessage(
        message({ type: "asset-request", payload: { requestId: "x".repeat(65), source: "images/cover.png" } }),
      ),
    ).toThrow()
    expect(() =>
      serializeSandboxMessage(
        message({
          type: "asset-request",
          payload: { requestId: "asset-1", source: "x".repeat(SANDBOX_MAX_ASSET_SOURCE_BYTES + 1) },
        }),
      ),
    ).toThrow()
  })

  it("accepts only a matching bounded MIME-typed ArrayBuffer response", () => {
    const bytes = Uint8Array.from([1, 2, 3]).buffer
    const delivery = createSandboxAssetResponse({ ...expected, mimeType: "image/png", bytes })

    expect(parseSandboxAssetDelivery(delivery, expected)).toEqual({
      type: "asset-response",
      requestId: "asset-1",
      source: "images/cover.png",
      mimeType: "image/png",
      bytes,
    })
    expect(() =>
      createSandboxAssetResponse({
        ...expected,
        mimeType: "image/svg+xml" as never,
        bytes,
      }),
    ).toThrow()
    expect(() =>
      createSandboxAssetResponse({
        ...expected,
        mimeType: "image/png",
        bytes: new ArrayBuffer(SANDBOX_MAX_ASSET_BYTES + 1),
      }),
    ).toThrow()
  })

  it("rejects stale authority, unsolicited identity, and malformed transferables", () => {
    const delivery = createSandboxAssetResponse({
      ...expected,
      mimeType: "image/webp",
      bytes: Uint8Array.from([1]).buffer,
    })
    expect(parseSandboxAssetDelivery(delivery, { ...expected, sessionId: "stale" })).toBeNull()
    expect(parseSandboxAssetDelivery(delivery, { ...expected, snapshotVersion: 3 })).toBeNull()
    expect(parseSandboxAssetDelivery(delivery, { ...expected, requestId: "unsolicited" })).toBeNull()
    expect(parseSandboxAssetDelivery(delivery, { ...expected, source: "images/other.png" })).toBeNull()
    expect(parseSandboxAssetDelivery({ control: delivery.control, bytes: new Uint8Array([1]) }, expected)).toBeNull()
    expect(
      parseSandboxAssetDelivery({ control: delivery.control, bytes: Uint8Array.from([1, 2]).buffer }, expected),
    ).toBeNull()
    expect(parseSandboxAssetDelivery({ ...delivery, extra: true }, expected)).toBeNull()
  })

  it("carries an opaque matching error without bytes", () => {
    const wire = serializeSandboxAssetError({ ...expected, code: "unavailable" })
    expect(parseSandboxAssetDelivery(wire, expected)).toEqual({
      type: "asset-error",
      requestId: "asset-1",
      source: "images/cover.png",
      code: "unavailable",
    })
    expect(parseSandboxAssetDelivery({ control: wire, bytes: new ArrayBuffer(0) }, expected)).toBeNull()
  })
})

describe("teardown", () => {
  it("invalidates explicitly and through a terminal sandbox message", () => {
    const invalid = invalidateSandboxSession(session())
    expect(invalid.invalidated).toBe(true)
    const teardown = validateSandboxMessage(serializedMessage({ type: "teardown" }), session())
    expect(teardown.accepted).toBe(true)
    expect(advanceSandboxSequence(teardown).invalidated).toBe(true)
  })
})
