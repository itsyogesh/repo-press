import { z } from "zod"
import { previewDiagnosticSchema } from "./contracts"

export const SANDBOX_PROTOCOL_VERSION = 1 as const

/** Maximum encoded size of one sandbox-to-host protocol message. */
export const SANDBOX_MAX_MESSAGE_BYTES = 64 * 1024
/** Maximum encoded size of any string value or object key. */
export const SANDBOX_MAX_STRING_BYTES = 32 * 1024
/** Maximum entries in any one array or object. */
export const SANDBOX_MAX_COLLECTION_ITEMS = 64
/** Maximum nesting below the message root. */
export const SANDBOX_MAX_DATA_DEPTH = 12
/** Maximum values visited while validating one message. */
export const SANDBOX_MAX_DATA_NODES = 1_024

/**
 * Fixed-window inbound rate policy. The first 32 messages in a 1,000 ms
 * window are accepted. A timestamp exactly on the next boundary opens a new
 * window, so rejected senders recover without timers or hidden mutable state.
 */
export const SANDBOX_RATE_WINDOW_MS = 1_000
export const SANDBOX_RATE_BURST = 32

/** Bootstrap capabilities expire at this boundary and are never reusable. */
export const SANDBOX_BOOTSTRAP_TTL_MS = 30_000

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
    acceptedMessages: number
  }>
}>

type ClockOptions = Readonly<{ now?: number }>

type BootstrapCapabilityOptions = ClockOptions &
  Readonly<{
    rotate?: string
  }>

type BootstrapAttempt = ClockOptions &
  Readonly<{
    expectedWindow: unknown
    eventSource: unknown
    capability: unknown
    /** Opaque iframe origins are normally "null". This is metadata, never authentication. */
    origin?: unknown
  }>

type CapabilityRecord = Readonly<{ expiresAt: number }>
const bootstrapCapabilities = new Map<string, CapabilityRecord>()

const BASE64URL_ALPHABET = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_"

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

function resolvedNow(now: number | undefined): number {
  return now ?? Date.now()
}

function isValidTimestamp(value: number): boolean {
  return Number.isSafeInteger(value) && value >= 0
}

function pruneExpiredCapabilities(now: number): void {
  for (const [capability, record] of bootstrapCapabilities) {
    if (now >= record.expiresAt) bootstrapCapabilities.delete(capability)
  }
}

/**
 * Creates a 256-bit, single-use bootstrap capability with Web Crypto only.
 * Send it in the one-time bootstrap message, never in an iframe URL. Passing
 * `rotate` atomically invalidates a prior capability before issuing the next.
 */
export function createBootstrapCapability(options: BootstrapCapabilityOptions = {}): string {
  const now = resolvedNow(options.now)
  if (!isValidTimestamp(now) || now > Number.MAX_SAFE_INTEGER - SANDBOX_BOOTSTRAP_TTL_MS) {
    throw new TypeError("A safe, non-negative bootstrap timestamp is required")
  }

  if (typeof options.rotate === "string") bootstrapCapabilities.delete(options.rotate)
  pruneExpiredCapabilities(now)

  const cryptoApi = globalThis.crypto
  if (!cryptoApi || typeof cryptoApi.getRandomValues !== "function") {
    throw new Error("Web Crypto is required to create a sandbox bootstrap capability")
  }

  let capability = ""
  do {
    capability = encodeBase64Url(cryptoApi.getRandomValues(new Uint8Array(32)))
  } while (bootstrapCapabilities.has(capability))

  bootstrapCapabilities.set(capability, { expiresAt: now + SANDBOX_BOOTSTRAP_TTL_MS })
  return capability
}

/**
 * Authenticates only the exact iframe WindowProxy and a live single-use
 * capability. `origin` is intentionally ignored because an allow-scripts-only
 * iframe has an opaque origin.
 */
export function acceptBootstrap(attempt: BootstrapAttempt): boolean {
  try {
    const now = resolvedNow(attempt.now)
    if (!isValidTimestamp(now)) return false
    if (
      attempt.expectedWindow === null ||
      (typeof attempt.expectedWindow !== "object" && typeof attempt.expectedWindow !== "function")
    ) {
      return false
    }
    if (attempt.eventSource !== attempt.expectedWindow) return false
    if (typeof attempt.capability !== "string") return false

    const record = bootstrapCapabilities.get(attempt.capability)
    if (!record) return false
    bootstrapCapabilities.delete(attempt.capability)
    return now < record.expiresAt
  } catch {
    return false
  }
}

type CloneContext = {
  nodes: number
  seen: WeakSet<object>
}

type CloneResult = { ok: true; value: SandboxData } | { ok: false }
const INVALID_CLONE: CloneResult = { ok: false }

function utf8Size(value: string): number {
  return new TextEncoder().encode(value).byteLength
}

function cloneBoundedPlainData(input: unknown, context: CloneContext, depth: number): CloneResult {
  context.nodes += 1
  if (context.nodes > SANDBOX_MAX_DATA_NODES || depth > SANDBOX_MAX_DATA_DEPTH) return INVALID_CLONE

  if (input === null || typeof input === "boolean") return { ok: true, value: input }
  if (typeof input === "number") return Number.isFinite(input) ? { ok: true, value: input } : INVALID_CLONE
  if (typeof input === "string") {
    return utf8Size(input) <= SANDBOX_MAX_STRING_BYTES ? { ok: true, value: input } : INVALID_CLONE
  }
  if (typeof input !== "object") return INVALID_CLONE
  if (context.seen.has(input)) return INVALID_CLONE
  context.seen.add(input)

  if (Array.isArray(input)) {
    if (input.length > SANDBOX_MAX_COLLECTION_ITEMS) return INVALID_CLONE
    const descriptors = Object.getOwnPropertyDescriptors(input)
    if (Object.getOwnPropertySymbols(input).length > 0) return INVALID_CLONE
    const propertyNames = Object.getOwnPropertyNames(input)
    if (propertyNames.length !== input.length + 1 || !Object.hasOwn(descriptors, "length")) return INVALID_CLONE

    const output: SandboxData[] = []
    for (let index = 0; index < input.length; index += 1) {
      const descriptor = descriptors[String(index)]
      if (!descriptor || !("value" in descriptor) || !descriptor.enumerable) return INVALID_CLONE
      const cloned = cloneBoundedPlainData(descriptor.value, context, depth + 1)
      if (!cloned.ok) return cloned
      output.push(cloned.value)
    }
    return { ok: true, value: output }
  }

  const prototype = Object.getPrototypeOf(input)
  if (prototype !== Object.prototype && prototype !== null) return INVALID_CLONE
  if (Object.getOwnPropertySymbols(input).length > 0) return INVALID_CLONE

  const descriptors = Object.getOwnPropertyDescriptors(input)
  const keys = Object.keys(descriptors)
  if (keys.length > SANDBOX_MAX_COLLECTION_ITEMS) return INVALID_CLONE

  const output: Record<string, SandboxData> = {}
  for (const key of keys) {
    if (utf8Size(key) > SANDBOX_MAX_STRING_BYTES) return INVALID_CLONE
    const descriptor = descriptors[key]
    if (!("value" in descriptor) || !descriptor.enumerable) return INVALID_CLONE
    const cloned = cloneBoundedPlainData(descriptor.value, context, depth + 1)
    if (!cloned.ok) return cloned
    Object.defineProperty(output, key, {
      value: cloned.value,
      enumerable: true,
      writable: true,
      configurable: true,
    })
  }
  return { ok: true, value: output }
}

function safelyCloneBounded(input: unknown): SandboxData | null {
  try {
    const result = cloneBoundedPlainData(input, { nodes: 0, seen: new WeakSet() }, 0)
    return result.ok ? result.value : null
  } catch {
    return null
  }
}

function deepFreeze<T>(input: T): T {
  if (input !== null && typeof input === "object" && !Object.isFrozen(input)) {
    for (const value of Object.values(input)) deepFreeze(value)
    Object.freeze(input)
  }
  return input
}

const sandboxSessionStateSchema = z
  .object({
    sessionId: z.string().min(1),
    snapshotVersion: positiveSafeIntegerSchema,
    sequence: z.number().int().nonnegative().safe(),
    invalidated: z.boolean(),
    rateLimit: z
      .object({
        windowStartedAt: z.number().int().nonnegative().safe(),
        acceptedMessages: z.number().int().min(0).max(SANDBOX_RATE_BURST),
      })
      .strict(),
  })
  .strict()

function parseState(input: unknown): SandboxSessionState | null {
  const cloned = safelyCloneBounded(input)
  if (cloned === null) return null
  const parsed = sandboxSessionStateSchema.safeParse(cloned)
  return parsed.success ? deepFreeze(parsed.data) : null
}

function parseMessage(input: unknown): SandboxMessage | null {
  const cloned = safelyCloneBounded(input)
  if (cloned === null) return null

  let encodedSize: number
  try {
    encodedSize = utf8Size(JSON.stringify(cloned))
  } catch {
    return null
  }
  if (encodedSize > SANDBOX_MAX_MESSAGE_BYTES) return null

  const parsed = sandboxMessageSchema.safeParse(cloned)
  return parsed.success ? deepFreeze(parsed.data) : null
}

function activeRateWindow(state: SandboxSessionState, now: number): SandboxSessionState["rateLimit"] | null {
  if (!isValidTimestamp(now) || now < state.rateLimit.windowStartedAt) return null
  if (now - state.rateLimit.windowStartedAt >= SANDBOX_RATE_WINDOW_MS) {
    return { windowStartedAt: now, acceptedMessages: 0 }
  }
  return state.rateLimit
}

/** Validates schema, identity, replay ordering, teardown, size, and rate policy. */
export function validateSandboxMessage(
  input: unknown,
  sessionState: SandboxSessionState,
  options: ClockOptions = {},
): SandboxMessage | null {
  try {
    const state = parseState(sessionState)
    if (!state || state.invalidated) return null

    const now = resolvedNow(options.now)
    const rateLimit = activeRateWindow(state, now)
    if (!rateLimit || rateLimit.acceptedMessages >= SANDBOX_RATE_BURST) return null

    const message = parseMessage(input)
    if (!message || message.sessionId !== state.sessionId) return null
    if (message.snapshotVersion < state.snapshotVersion) return null
    if (message.snapshotVersion === state.snapshotVersion && message.sequence <= state.sequence) return null
    return message
  } catch {
    return null
  }
}

/**
 * Returns a detached, deeply frozen state snapshot. A higher snapshot version
 * resets sequence ordering, matching the host preview session reducer.
 */
export function advanceSandboxSequence(
  sessionState: SandboxSessionState,
  input: unknown,
  options: ClockOptions = {},
): SandboxSessionState {
  const now = resolvedNow(options.now)
  const message = validateSandboxMessage(input, sessionState, { now })
  if (!message) return sessionState

  const state = parseState(sessionState)
  if (!state) return sessionState
  const rateLimit = activeRateWindow(state, now)
  if (!rateLimit) return sessionState

  return deepFreeze({
    sessionId: state.sessionId,
    snapshotVersion: message.snapshotVersion,
    sequence: message.sequence,
    invalidated: message.type === "teardown",
    rateLimit: {
      windowStartedAt: rateLimit.windowStartedAt,
      acceptedMessages: rateLimit.acceptedMessages + 1,
    },
  })
}

/** Invalidates a session snapshot. Repeated teardown is idempotent. */
export function invalidateSandboxSession(sessionState: SandboxSessionState): SandboxSessionState {
  const state = parseState(sessionState)
  if (!state) return sessionState
  if (state.invalidated) return sessionState
  return deepFreeze({ ...state, invalidated: true })
}
