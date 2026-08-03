import type { LookupAddress } from "node:dns"
import { lookup } from "node:dns/promises"
import { BlockList, isIP } from "node:net"
import { Agent } from "undici"

const MAX_REDIRECTS = 5
const BLOCKED_IPV4_RANGES = new BlockList()
const BLOCKED_IPV6_RANGES = new BlockList()

for (const [address, prefix] of [
  ["0.0.0.0", 8],
  ["10.0.0.0", 8],
  ["100.64.0.0", 10],
  ["127.0.0.0", 8],
  ["169.254.0.0", 16],
  ["172.16.0.0", 12],
  ["192.0.0.0", 24],
  ["192.0.2.0", 24],
  ["192.88.99.0", 24],
  ["192.168.0.0", 16],
  ["198.18.0.0", 15],
  ["198.51.100.0", 24],
  ["203.0.113.0", 24],
  ["224.0.0.0", 4],
  ["240.0.0.0", 4],
] as const) {
  BLOCKED_IPV4_RANGES.addSubnet(address, prefix, "ipv4")
}

for (const [address, prefix] of [
  ["::ffff:0:0", 96],
  ["64:ff9b::", 96],
  ["64:ff9b:1::", 48],
  ["100::", 64],
  ["2001::", 23],
  ["2001:db8::", 32],
  ["2002::", 16],
  ["fc00::", 7],
  ["fe80::", 10],
  ["ff00::", 8],
] as const) {
  BLOCKED_IPV6_RANGES.addSubnet(address, prefix, "ipv6")
}
BLOCKED_IPV6_RANGES.addAddress("::", "ipv6")
BLOCKED_IPV6_RANGES.addAddress("::1", "ipv6")

export type ExternalImageErrorCode =
  | "redirect-limit"
  | "timeout"
  | "too-large"
  | "unsafe-url"
  | "unsupported-media"
  | "upstream"

export class ExternalImageError extends Error {
  constructor(
    readonly code: ExternalImageErrorCode,
    message = "External image request failed",
  ) {
    super(message)
    this.name = "ExternalImageError"
  }
}

function normalizedHostname(hostname: string) {
  const normalized = hostname.trim().toLowerCase().replace(/\.$/u, "")
  return normalized.startsWith("[") && normalized.endsWith("]") ? normalized.slice(1, -1) : normalized
}

function isBlockedAddress(address: string) {
  const normalized = normalizedHostname(address)
  const family = isIP(normalized)
  if (family === 4) return BLOCKED_IPV4_RANGES.check(normalized, "ipv4")
  if (family === 6) return BLOCKED_IPV6_RANGES.check(normalized, "ipv6")
  return true
}

function parseExternalTarget(value: string) {
  let target: URL
  try {
    target = new URL(value)
  } catch {
    throw new ExternalImageError("unsafe-url")
  }
  if (
    (target.protocol !== "https:" && target.protocol !== "http:") ||
    target.username ||
    target.password ||
    !target.hostname ||
    target.hash
  ) {
    throw new ExternalImageError("unsafe-url")
  }
  const hostname = normalizedHostname(target.hostname)
  if (!hostname || hostname === "localhost" || hostname.endsWith(".localhost") || hostname.endsWith(".local")) {
    throw new ExternalImageError("unsafe-url")
  }
  if (isIP(hostname) && isBlockedAddress(hostname)) throw new ExternalImageError("unsafe-url")
  return { target, hostname }
}

function awaitWithAbort<T>(promise: Promise<T>, signal: AbortSignal): Promise<T> {
  if (signal.aborted) return Promise.reject(new ExternalImageError("timeout"))
  return new Promise<T>((resolve, reject) => {
    const abort = () => reject(new ExternalImageError("timeout"))
    signal.addEventListener("abort", abort, { once: true })
    promise.then(
      (value) => {
        signal.removeEventListener("abort", abort)
        resolve(value)
      },
      (error) => {
        signal.removeEventListener("abort", abort)
        reject(error)
      },
    )
  })
}

async function resolvePublicAddresses(hostname: string, signal: AbortSignal): Promise<readonly LookupAddress[]> {
  const family = isIP(hostname)
  if (family) return [{ address: hostname, family }]
  let answers: LookupAddress[]
  try {
    answers = await awaitWithAbort(lookup(hostname, { all: true, verbatim: true }), signal)
  } catch (error) {
    if (error instanceof ExternalImageError) throw error
    throw new ExternalImageError("unsafe-url")
  }
  if (answers.length === 0 || answers.some((answer) => isBlockedAddress(answer.address))) {
    throw new ExternalImageError("unsafe-url")
  }
  return answers
}

function createPinnedDispatcher(addresses: readonly LookupAddress[]) {
  return new Agent({
    connect: {
      // Node may otherwise ask lookup({ all: true }) and select a different
      // address after validation. One pinned answer closes that rebinding gap.
      autoSelectFamily: false,
      lookup: (_hostname, options, callback) => {
        const requestedFamily = typeof options === "object" ? options.family : undefined
        const selected =
          addresses.find((answer) => !requestedFamily || requestedFamily === 0 || answer.family === requestedFamily) ??
          addresses[0]
        if (!selected) {
          callback(new Error("No validated address"), "", 0)
          return
        }
        callback(null, selected.address, selected.family)
      },
    },
  })
}

function canonicalContentType(value: string | null) {
  return value?.split(";", 1)[0]?.trim().toLowerCase() ?? ""
}

function begins(bytes: Uint8Array, signature: readonly number[]) {
  return signature.every((value, index) => bytes[index] === value)
}

function ascii(bytes: Uint8Array, start: number, end: number) {
  return String.fromCharCode(...bytes.subarray(start, end))
}

export function detectImageMimeType(bytes: Uint8Array): string | null {
  if (begins(bytes, [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])) return "image/png"
  if (begins(bytes, [0xff, 0xd8, 0xff])) return "image/jpeg"
  if (bytes.byteLength >= 6 && (ascii(bytes, 0, 6) === "GIF87a" || ascii(bytes, 0, 6) === "GIF89a")) {
    return "image/gif"
  }
  if (bytes.byteLength >= 12 && ascii(bytes, 0, 4) === "RIFF" && ascii(bytes, 8, 12) === "WEBP") {
    return "image/webp"
  }
  if (bytes.byteLength >= 16 && ascii(bytes, 4, 8) === "ftyp") {
    const boxSize = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength).getUint32(0)
    const end = Math.min(bytes.byteLength, boxSize, 64)
    for (let offset = 8; offset + 4 <= end; offset += offset === 8 ? 8 : 4) {
      const brand = ascii(bytes, offset, offset + 4)
      if (brand === "avif" || brand === "avis") return "image/avif"
    }
  }
  const prefix = new TextDecoder().decode(bytes.subarray(0, Math.min(bytes.byteLength, 1_024))).trimStart()
  if (/^(?:<\?xml[^>]*>\s*)?<svg(?:\s|>)/iu.test(prefix)) return "image/svg+xml"
  return null
}

async function readBoundedBody(response: Response, maxBytes: number) {
  const declaredLength = response.headers.get("content-length")
  if (declaredLength) {
    if (!/^\d+$/u.test(declaredLength) || Number(declaredLength) > maxBytes) {
      await response.body?.cancel().catch(() => undefined)
      throw new ExternalImageError("too-large")
    }
  }
  const reader = response.body?.getReader()
  if (!reader) return new Uint8Array()
  const chunks: Uint8Array[] = []
  let total = 0
  while (true) {
    const { done, value } = await reader.read()
    if (done) break
    total += value.byteLength
    if (total > maxBytes) {
      await reader.cancel().catch(() => undefined)
      throw new ExternalImageError("too-large")
    }
    chunks.push(value)
  }
  const bytes = new Uint8Array(total)
  let offset = 0
  for (const chunk of chunks) {
    bytes.set(chunk, offset)
    offset += chunk.byteLength
  }
  return bytes
}

export async function fetchBoundedExternalImage(input: {
  url: string
  maxBytes: number
  timeoutMs: number
  allowedMimeTypes: ReadonlySet<string>
}): Promise<{ bytes: Uint8Array; mimeType: string }> {
  if (
    !Number.isSafeInteger(input.maxBytes) ||
    input.maxBytes <= 0 ||
    !Number.isSafeInteger(input.timeoutMs) ||
    input.timeoutMs <= 0
  ) {
    throw new ExternalImageError("upstream")
  }
  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), input.timeoutMs)
  let currentUrl = input.url
  try {
    for (let redirects = 0; redirects <= MAX_REDIRECTS; redirects += 1) {
      const { target, hostname } = parseExternalTarget(currentUrl)
      const addresses = await resolvePublicAddresses(hostname, controller.signal)
      const dispatcher = createPinnedDispatcher(addresses)
      let response: Response
      try {
        response = await fetch(target.toString(), {
          redirect: "manual",
          signal: controller.signal,
          dispatcher,
        } as RequestInit & { dispatcher: Agent })
      } catch (error) {
        await dispatcher.close().catch(() => undefined)
        if (controller.signal.aborted) throw new ExternalImageError("timeout")
        throw new ExternalImageError("upstream", error instanceof Error ? error.message : undefined)
      }

      if (response.status >= 300 && response.status < 400) {
        await response.body?.cancel().catch(() => undefined)
        await dispatcher.close().catch(() => undefined)
        if (redirects === MAX_REDIRECTS) throw new ExternalImageError("redirect-limit")
        const location = response.headers.get("location")
        if (!location) throw new ExternalImageError("upstream")
        try {
          const redirectTarget = new URL(location, target)
          if (target.protocol === "https:" && redirectTarget.protocol !== "https:") {
            throw new ExternalImageError("unsafe-url")
          }
          currentUrl = redirectTarget.toString()
        } catch (error) {
          if (error instanceof ExternalImageError) throw error
          throw new ExternalImageError("unsafe-url")
        }
        continue
      }

      if (!response.ok) {
        await response.body?.cancel().catch(() => undefined)
        await dispatcher.close().catch(() => undefined)
        throw new ExternalImageError("upstream")
      }

      try {
        const declaredMimeType = canonicalContentType(response.headers.get("content-type"))
        if (!input.allowedMimeTypes.has(declaredMimeType)) throw new ExternalImageError("unsupported-media")
        const bytes = await readBoundedBody(response, input.maxBytes)
        const detectedMimeType = detectImageMimeType(bytes)
        if (detectedMimeType !== declaredMimeType) throw new ExternalImageError("unsupported-media")
        return { bytes, mimeType: detectedMimeType }
      } finally {
        await dispatcher.close().catch(() => undefined)
      }
    }
    throw new ExternalImageError("redirect-limit")
  } catch (error) {
    if (!(error instanceof ExternalImageError) && controller.signal.aborted) {
      throw new ExternalImageError("timeout")
    }
    throw error
  } finally {
    clearTimeout(timeout)
  }
}
