import { z } from "zod"
import { previewDiagnosticSchema } from "./contracts"

export const SANDBOX_PROTOCOL_VERSION = 1 as const
export const SANDBOX_MAX_MESSAGE_BYTES = 64 * 1024
export const SANDBOX_MAX_STRING_BYTES = 32 * 1024
export const SANDBOX_MAX_COLLECTION_ITEMS = 64
export const SANDBOX_MAX_DATA_DEPTH = 12
export const SANDBOX_MAX_DATA_NODES = 1_024

/**
 * Fixed-window inbound policy. Every attempted message, valid or invalid,
 * consumes one of 32 slots. The 33rd attempt is rejected before message
 * traversal. A timestamp exactly 1,000 ms after the window start opens a new
 * window.
 */
export const SANDBOX_RATE_WINDOW_MS = 1_000
export const SANDBOX_RATE_BURST = 32

export const SANDBOX_BOOTSTRAP_TTL_MS = 30_000
export const SANDBOX_MAX_ACTIVE_CAPABILITIES = 16
export const SANDBOX_CAPABILITY_COLLISION_ATTEMPTS = 4

type JsonPrimitive = boolean | number | string | null
export type SandboxData = JsonPrimitive | SandboxData[] | { [key: string]: SandboxData }

const positiveSafeIntegerSchema = z.number().int().positive().safe()
const baseMessageFields = {
  protocolVersion: z.literal(SANDBOX_PROTOCOL_VERSION),
  sessionId: z.string().min(1),
  snapshotVersion: positiveSafeIntegerSchema,
  sequence: positiveSafeIntegerSchema,
}
const emptyPayloadSchema = z.object({}).strict()

export const sandboxMessageSchema = z.discriminatedUnion("type", [
  z.object({ ...baseMessageFields, type: z.literal("ready"), payload: emptyPayloadSchema }).strict(),
  z
    .object({
      ...baseMessageFields,
      type: z.literal("status"),
      payload: z.object({ status: z.enum(["loading", "rendering", "ready"]) }).strict(),
    })
    .strict(),
  z
    .object({
      ...baseMessageFields,
      type: z.literal("resize"),
      payload: z
        .object({
          width: positiveSafeIntegerSchema.max(100_000).optional(),
          height: positiveSafeIntegerSchema.max(100_000),
        })
        .strict(),
    })
    .strict(),
  z
    .object({
      ...baseMessageFields,
      type: z.literal("diagnostics"),
      payload: z.object({ diagnostics: z.array(previewDiagnosticSchema).max(SANDBOX_MAX_COLLECTION_ITEMS) }).strict(),
    })
    .strict(),
  z.object({ ...baseMessageFields, type: z.literal("rendered"), payload: emptyPayloadSchema }).strict(),
  z
    .object({
      ...baseMessageFields,
      type: z.literal("error"),
      payload: z
        .object({
          code: z.string().min(1),
          message: z.string().min(1),
          recoverable: z.boolean(),
        })
        .strict(),
    })
    .strict(),
  z.object({ ...baseMessageFields, type: z.literal("teardown"), payload: emptyPayloadSchema }).strict(),
])

export type SandboxMessage = z.infer<typeof sandboxMessageSchema>

export type SandboxSessionState = Readonly<{
  sessionId: string
  snapshotVersion: number
  sequence: number
  invalidated: boolean
  rateLimit: Readonly<{
    windowStartedAt: number
    attemptedMessages: number
  }>
}>

export type SandboxRefusalCode =
  | "INVALID_STATE"
  | "SESSION_INVALIDATED"
  | "CLOCK_INVALID"
  | "RATE_LIMIT"
  | "INVALID_TRANSPORT"
  | "MALFORMED_MESSAGE"
  | "MESSAGE_TOO_LARGE"
  | "MESSAGE_TOO_COMPLEX"
  | "SCHEMA_INVALID"
  | "SESSION_MISMATCH"
  | "SNAPSHOT_MISMATCH"
  | "SEQUENCE_MISMATCH"

export type SandboxValidationSuccess = Readonly<{
  accepted: true
  message: SandboxMessage
  nextState: SandboxSessionState
}>

export type SandboxValidationFailure = Readonly<{
  accepted: false
  code: SandboxRefusalCode
  nextState: SandboxSessionState
}>

export type SandboxValidationResult = SandboxValidationSuccess | SandboxValidationFailure

const activeSessionStates = new WeakSet<object>()
const authenticValidations = new WeakSet<object>()
const appliedValidations = new WeakSet<object>()

function isSafeTimestamp(value: number): boolean {
  return Number.isSafeInteger(value) && value >= 0
}

function currentTimestamp(): number | null {
  const now = Date.now()
  return isSafeTimestamp(now) ? now : null
}

function makeSessionState(input: SandboxSessionState): SandboxSessionState {
  const rateLimit = Object.freeze({ ...input.rateLimit })
  const state = Object.freeze({
    sessionId: input.sessionId,
    snapshotVersion: input.snapshotVersion,
    sequence: input.sequence,
    invalidated: input.invalidated,
    rateLimit,
  })
  activeSessionStates.add(state)
  return state
}

const INVALID_SESSION_STATE = makeSessionState({
  sessionId: "invalid",
  snapshotVersion: 1,
  sequence: 0,
  invalidated: true,
  rateLimit: { windowStartedAt: 0, attemptedMessages: 0 },
})

function isActiveState(state: unknown): state is SandboxSessionState {
  return typeof state === "object" && state !== null && activeSessionStates.has(state)
}

function makeFailure(code: SandboxRefusalCode, nextState: SandboxSessionState): SandboxValidationFailure {
  const result = Object.freeze({ accepted: false as const, code, nextState })
  authenticValidations.add(result)
  return result
}

function makeSuccess(message: SandboxMessage, nextState: SandboxSessionState): SandboxValidationSuccess {
  const result = Object.freeze({ accepted: true as const, message, nextState })
  authenticValidations.add(result)
  return result
}

function isPositiveSafeInteger(value: number): boolean {
  return Number.isSafeInteger(value) && value > 0
}

function measureString(value: string): { rawBytes: number; jsonBytes: number } {
  let rawBytes = 0
  let jsonBytes = 2
  for (let index = 0; index < value.length; index += 1) {
    const unit = value.charCodeAt(index)
    if (unit === 0x22 || unit === 0x5c) {
      rawBytes += 1
      jsonBytes += 2
      continue
    }
    if (unit <= 0x1f) {
      rawBytes += 1
      jsonBytes += unit === 0x08 || unit === 0x09 || unit === 0x0a || unit === 0x0c || unit === 0x0d ? 2 : 6
      continue
    }
    if (unit <= 0x7f) {
      rawBytes += 1
      jsonBytes += 1
      continue
    }
    if (unit <= 0x7ff) {
      rawBytes += 2
      jsonBytes += 2
      continue
    }
    if (unit >= 0xd800 && unit <= 0xdbff) {
      const next = value.charCodeAt(index + 1)
      if (next >= 0xdc00 && next <= 0xdfff) {
        rawBytes += 4
        jsonBytes += 4
        index += 1
      } else {
        rawBytes += 3
        jsonBytes += 6
      }
      continue
    }
    if (unit >= 0xdc00 && unit <= 0xdfff) {
      rawBytes += 3
      jsonBytes += 6
      continue
    }
    rawBytes += 3
    jsonBytes += 3
  }
  return { rawBytes, jsonBytes }
}

function isValidSessionId(value: unknown): value is string {
  if (typeof value !== "string" || value.length === 0) return false
  return measureString(value).rawBytes <= 256
}

export function createSandboxSessionState(input: { sessionId: string; snapshotVersion: number }): SandboxSessionState {
  const now = currentTimestamp()
  if (now === null) throw new TypeError("A safe host clock is required")
  if (!isValidSessionId(input.sessionId)) throw new TypeError("A bounded non-empty sessionId is required")
  if (!isPositiveSafeInteger(input.snapshotVersion)) {
    throw new TypeError("A positive safe snapshotVersion is required")
  }
  return makeSessionState({
    sessionId: input.sessionId,
    snapshotVersion: input.snapshotVersion,
    sequence: 0,
    invalidated: false,
    rateLimit: { windowStartedAt: now, attemptedMessages: 0 },
  })
}

export function rotateSandboxSnapshot(
  state: SandboxSessionState,
  input: { snapshotVersion: number },
): SandboxSessionState {
  if (!isActiveState(state) || state.invalidated) throw new TypeError("An active sandbox session is required")
  if (!isPositiveSafeInteger(input.snapshotVersion) || input.snapshotVersion <= state.snapshotVersion) {
    throw new TypeError("Snapshot rotation requires a higher positive safe version")
  }
  return makeSessionState({
    sessionId: state.sessionId,
    snapshotVersion: input.snapshotVersion,
    sequence: 0,
    invalidated: false,
    rateLimit: state.rateLimit,
  })
}

type BootstrapCapabilityOptions = Readonly<{
  expectedWindow: unknown
  sessionId: string
  rotate?: string
}>

type BootstrapAttempt = Readonly<{
  expectedWindow: unknown
  eventSource: unknown
  capability: unknown
  sessionId: unknown
  /** Opaque iframe origins are normally "null". This metadata is never authentication. */
  origin?: unknown
}>

type CapabilityRecord = Readonly<{
  expectedWindow: object
  sessionId: string
  issuedAt: number
  expiresAt: number
}>

const bootstrapCapabilities = new Map<string, CapabilityRecord>()
const BASE64URL_ALPHABET = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_"

function isWindowIdentity(value: unknown): value is object {
  return value !== null && (typeof value === "object" || typeof value === "function")
}

function encodeBase64Url(bytes: Uint8Array): string {
  let output = ""
  let buffer = 0
  let bits = 0
  for (const byte of bytes) {
    buffer = (buffer << 8) | byte
    bits += 8
    while (bits >= 6) {
      bits -= 6
      output += BASE64URL_ALPHABET[(buffer >>> bits) & 0x3f]
    }
  }
  if (bits > 0) output += BASE64URL_ALPHABET[(buffer << (6 - bits)) & 0x3f]
  return output
}

function pruneExpiredCapabilities(now: number): void {
  for (const [capability, record] of bootstrapCapabilities) {
    if (now >= record.expiresAt) bootstrapCapabilities.delete(capability)
  }
}

function invalidateCapabilitiesForSession(sessionId: string): void {
  for (const [capability, record] of bootstrapCapabilities) {
    if (record.sessionId === sessionId) bootstrapCapabilities.delete(capability)
  }
}

/**
 * Issues a 256-bit, single-use capability bound to one WindowProxy and session.
 * It belongs only in the one-time bootstrap message, never in iframe URLs or
 * serializable session state.
 */
export function createBootstrapCapability(options: BootstrapCapabilityOptions): string {
  const now = currentTimestamp()
  if (now === null || now > Number.MAX_SAFE_INTEGER - SANDBOX_BOOTSTRAP_TTL_MS) {
    throw new TypeError("A safe host clock is required")
  }
  if (!isWindowIdentity(options.expectedWindow)) throw new TypeError("An intended WindowProxy is required")
  if (!isValidSessionId(options.sessionId)) throw new TypeError("A bounded non-empty sessionId is required")

  pruneExpiredCapabilities(now)
  if (typeof options.rotate === "string") bootstrapCapabilities.delete(options.rotate)
  if (bootstrapCapabilities.size >= SANDBOX_MAX_ACTIVE_CAPABILITIES) {
    throw new Error("Active bootstrap capability limit reached")
  }

  const cryptoApi = globalThis.crypto
  if (!cryptoApi || typeof cryptoApi.getRandomValues !== "function") {
    throw new Error("Web Crypto is required to create a sandbox bootstrap capability")
  }

  for (let attempt = 0; attempt < SANDBOX_CAPABILITY_COLLISION_ATTEMPTS; attempt += 1) {
    const capability = encodeBase64Url(cryptoApi.getRandomValues(new Uint8Array(32)))
    if (bootstrapCapabilities.has(capability)) continue
    bootstrapCapabilities.set(capability, {
      expectedWindow: options.expectedWindow,
      sessionId: options.sessionId,
      issuedAt: now,
      expiresAt: now + SANDBOX_BOOTSTRAP_TTL_MS,
    })
    return capability
  }
  throw new Error("Unable to create a unique bootstrap capability")
}

export function invalidateBootstrapCapability(capability: unknown): boolean {
  return typeof capability === "string" && bootstrapCapabilities.delete(capability)
}

export function acceptBootstrap(attempt: BootstrapAttempt): boolean {
  try {
    if (typeof attempt.capability !== "string") return false
    const record = bootstrapCapabilities.get(attempt.capability)
    if (!record) return false

    const now = currentTimestamp()
    if (now === null || now < record.issuedAt || now >= record.expiresAt) {
      bootstrapCapabilities.delete(attempt.capability)
      return false
    }
    if (
      attempt.expectedWindow !== record.expectedWindow ||
      attempt.eventSource !== record.expectedWindow ||
      attempt.sessionId !== record.sessionId
    ) {
      return false
    }

    bootstrapCapabilities.delete(attempt.capability)
    return true
  } catch {
    return false
  }
}

type ParsedInspectionContext = {
  nodes: number
  seen: WeakSet<object>
}

const DANGEROUS_DATA_KEYS = new Set(["__proto__", "constructor", "prototype"])

/** Returns null as soon as the encoded string exceeds the caller's byte budget. */
function boundedUtf8Length(value: string, limit: number): number | null {
  if (value.length > limit) return null
  let bytes = 0
  for (let index = 0; index < value.length; index += 1) {
    const unit = value.charCodeAt(index)
    if (unit <= 0x7f) bytes += 1
    else if (unit <= 0x7ff) bytes += 2
    else if (unit >= 0xd800 && unit <= 0xdbff) {
      const next = value.charCodeAt(index + 1)
      if (next >= 0xdc00 && next <= 0xdfff) {
        bytes += 4
        index += 1
      } else bytes += 3
    } else bytes += 3
    if (bytes > limit) return null
  }
  return bytes
}

function inspectParsedData(
  input: unknown,
  context: ParsedInspectionContext,
  depth: number,
): "MALFORMED_MESSAGE" | "MESSAGE_TOO_LARGE" | "MESSAGE_TOO_COMPLEX" | null {
  context.nodes += 1
  if (context.nodes > SANDBOX_MAX_DATA_NODES || depth > SANDBOX_MAX_DATA_DEPTH) return "MESSAGE_TOO_COMPLEX"
  if (input === null || typeof input === "boolean") return null
  if (typeof input === "number") return Number.isFinite(input) ? null : "MALFORMED_MESSAGE"
  if (typeof input === "string") {
    return boundedUtf8Length(input, SANDBOX_MAX_STRING_BYTES) === null ? "MESSAGE_TOO_LARGE" : null
  }
  if (typeof input !== "object") return "MALFORMED_MESSAGE"
  if (context.seen.has(input)) return "MALFORMED_MESSAGE"
  context.seen.add(input)

  if (Array.isArray(input)) {
    if (input.length > SANDBOX_MAX_COLLECTION_ITEMS) return "MESSAGE_TOO_COMPLEX"
    for (let index = 0; index < input.length; index += 1) {
      const descriptor = Object.getOwnPropertyDescriptor(input, String(index))
      if (!descriptor || !("value" in descriptor) || !descriptor.enumerable) return "MALFORMED_MESSAGE"
      const failure = inspectParsedData(descriptor.value, context, depth + 1)
      if (failure) return failure
    }
    return null
  }

  const prototype = Object.getPrototypeOf(input)
  if (prototype !== Object.prototype && prototype !== null) return "MALFORMED_MESSAGE"
  let entries = 0
  for (const key in input) {
    if (!Object.hasOwn(input, key) || DANGEROUS_DATA_KEYS.has(key)) return "MALFORMED_MESSAGE"
    entries += 1
    if (entries > SANDBOX_MAX_COLLECTION_ITEMS) return "MESSAGE_TOO_COMPLEX"
    if (boundedUtf8Length(key, SANDBOX_MAX_STRING_BYTES) === null) return "MESSAGE_TOO_LARGE"
    const descriptor = Object.getOwnPropertyDescriptor(input, key)
    if (!descriptor || !("value" in descriptor) || !descriptor.enumerable) return "MALFORMED_MESSAGE"
    const failure = inspectParsedData(descriptor.value, context, depth + 1)
    if (failure) return failure
  }
  return null
}

function deepFreeze<T>(input: T): T {
  if (input !== null && typeof input === "object" && !Object.isFrozen(input)) {
    if (Array.isArray(input)) {
      for (let index = 0; index < input.length; index += 1) deepFreeze(input[index])
    } else {
      for (const key in input) {
        if (Object.hasOwn(input, key)) deepFreeze(input[key as keyof T])
      }
    }
    Object.freeze(input)
  }
  return input
}

export function serializeSandboxMessage(input: unknown): string {
  const parsed = sandboxMessageSchema.safeParse(input)
  if (!parsed.success) throw new TypeError("A valid sandbox message is required")
  const serialized = JSON.stringify(parsed.data)
  if (boundedUtf8Length(serialized, SANDBOX_MAX_MESSAGE_BYTES) === null) {
    throw new RangeError("Sandbox message exceeds the encoded byte limit")
  }
  return serialized
}

function parseMessage(input: unknown): { ok: true; message: SandboxMessage } | { ok: false; code: SandboxRefusalCode } {
  if (typeof input !== "string") return { ok: false, code: "INVALID_TRANSPORT" }
  if (boundedUtf8Length(input, SANDBOX_MAX_MESSAGE_BYTES) === null) {
    return { ok: false, code: "MESSAGE_TOO_LARGE" }
  }

  let decoded: unknown
  try {
    decoded = JSON.parse(input)
  } catch {
    return { ok: false, code: "MALFORMED_MESSAGE" }
  }
  const inspectionFailure = inspectParsedData(decoded, { nodes: 0, seen: new WeakSet() }, 0)
  if (inspectionFailure) return { ok: false, code: inspectionFailure }

  const parsed = sandboxMessageSchema.safeParse(decoded)
  return parsed.success ? { ok: true, message: deepFreeze(parsed.data) } : { ok: false, code: "SCHEMA_INVALID" }
}

function rateWindowAt(state: SandboxSessionState, now: number): SandboxSessionState["rateLimit"] | null {
  if (now < state.rateLimit.windowStartedAt) return null
  if (now - state.rateLimit.windowStartedAt >= SANDBOX_RATE_WINDOW_MS) {
    return { windowStartedAt: now, attemptedMessages: 0 }
  }
  return state.rateLimit
}

/**
 * Atomically charges one inbound attempt before parsing and returns an
 * authentic result. Always apply that result, before branching on `accepted`:
 * `state = advanceSandboxSequence(validateSandboxMessage(wire, state))`.
 */
export function validateSandboxMessage(input: unknown, state: SandboxSessionState): SandboxValidationResult {
  if (!isActiveState(state)) return makeFailure("INVALID_STATE", INVALID_SESSION_STATE)
  if (state.invalidated) return makeFailure("SESSION_INVALIDATED", state)

  const now = currentTimestamp()
  if (now === null) return makeFailure("CLOCK_INVALID", state)
  const window = rateWindowAt(state, now)
  if (!window) return makeFailure("CLOCK_INVALID", state)
  if (window.attemptedMessages >= SANDBOX_RATE_BURST) return makeFailure("RATE_LIMIT", state)

  const chargedState = makeSessionState({
    ...state,
    rateLimit: {
      windowStartedAt: window.windowStartedAt,
      attemptedMessages: window.attemptedMessages + 1,
    },
  })

  const parsed = parseMessage(input)
  if (!parsed.ok) return makeFailure(parsed.code, chargedState)
  const message = parsed.message
  if (message.sessionId !== state.sessionId) return makeFailure("SESSION_MISMATCH", chargedState)
  if (message.snapshotVersion !== state.snapshotVersion) return makeFailure("SNAPSHOT_MISMATCH", chargedState)
  if (state.sequence >= Number.MAX_SAFE_INTEGER || message.sequence !== state.sequence + 1) {
    return makeFailure("SEQUENCE_MISMATCH", chargedState)
  }

  const nextState = makeSessionState({
    ...chargedState,
    sequence: message.sequence,
    invalidated: message.type === "teardown",
  })
  if (nextState.invalidated) invalidateCapabilitiesForSession(nextState.sessionId)
  return makeSuccess(message, nextState)
}

/** Applies every authentic validation exactly once, including refusals. */
export function advanceSandboxSequence(validation: SandboxValidationResult): SandboxSessionState {
  if (!authenticValidations.has(validation)) throw new TypeError("An authentic validation result is required")
  if (appliedValidations.has(validation)) throw new TypeError("Sandbox validation result was already applied")
  appliedValidations.add(validation)
  return validation.nextState
}

/** Terminal, idempotent host teardown; also disposes pending bootstrap capabilities for the session. */
export function invalidateSandboxSession(state: SandboxSessionState): SandboxSessionState {
  if (!isActiveState(state)) return INVALID_SESSION_STATE
  if (state.invalidated) return state
  invalidateCapabilitiesForSession(state.sessionId)
  return makeSessionState({ ...state, invalidated: true })
}
