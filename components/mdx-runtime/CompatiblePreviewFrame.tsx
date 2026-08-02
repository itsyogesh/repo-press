"use client"

import * as React from "react"
import {
  type CompatiblePreviewAuthorityContext,
  serializeCompatibleArtifactTransfer,
  type VerifiedCompatiblePreviewResolution,
} from "@/lib/preview/compatible-artifact"
import {
  acceptBootstrap,
  advanceSandboxSequence,
  createBootstrapCapability,
  createSandboxSessionState,
  invalidateBootstrapCapability,
  invalidateSandboxSession,
  type SandboxMessage,
  type SandboxRefusalCode,
  type SandboxSessionState,
  validateSandboxMessage,
} from "@/lib/preview/sandbox-protocol"
import { cn } from "@/lib/utils"

const BOOTSTRAP_PROTOCOL_VERSION = 1 as const
const BOOTSTRAP_WIRE_LIMIT = 2_048
const CAPABILITY_PATTERN = /^[A-Za-z0-9_-]{43}$/
const BOOTSTRAP_RETRY_DELAYS_MS = Object.freeze([250, 750, 1_500] as const)
const TERMINAL_SANDBOX_REFUSALS = new Set<SandboxRefusalCode>([
  "RATE_LIMIT",
  "MESSAGE_TOO_LARGE",
  "MESSAGE_TOO_COMPLEX",
  "INVALID_TRANSPORT",
])

type RuntimeEnvironment = "development" | "production" | "test"

export type CompatiblePreviewOriginResult =
  | Readonly<{ ok: true; origin: string }>
  | Readonly<{
      ok: false
      code:
        | "PREVIEW_ORIGIN_MISSING"
        | "PREVIEW_ORIGIN_INVALID"
        | "PREVIEW_ORIGIN_INSECURE"
        | "PREVIEW_ORIGIN_NOT_ISOLATED"
        | "STUDIO_ORIGIN_MISSING"
        | "STUDIO_ORIGIN_INVALID"
        | "STUDIO_ORIGIN_INSECURE"
        | "STUDIO_ORIGIN_MISMATCH"
    }>

export function resolveCompatiblePreviewOrigin(input: {
  configuredOrigin: string | undefined
  configuredStudioOrigin?: string
  studioOrigin: string
  environment: RuntimeEnvironment
}): CompatiblePreviewOriginResult {
  const configured = input.configuredOrigin?.trim()
  if (!configured) {
    if (input.environment === "production") return { ok: false, code: "PREVIEW_ORIGIN_MISSING" }
    return normalizeOrigin(input.studioOrigin, input.environment)
  }

  const result = normalizeOrigin(configured, input.environment)
  if (!result.ok) return result

  if (input.environment === "production") {
    const configuredStudio = input.configuredStudioOrigin?.trim()
    if (!configuredStudio) return { ok: false, code: "STUDIO_ORIGIN_MISSING" }

    const studioConfiguration = parseStrictOrigin(configuredStudio)
    if (!studioConfiguration) return { ok: false, code: "STUDIO_ORIGIN_INVALID" }
    if (studioConfiguration.protocol !== "https:") return { ok: false, code: "STUDIO_ORIGIN_INSECURE" }

    const liveStudio = parseStrictOrigin(input.studioOrigin)
    if (!liveStudio || liveStudio.protocol !== "https:" || liveStudio.origin !== studioConfiguration.origin) {
      return { ok: false, code: "STUDIO_ORIGIN_MISMATCH" }
    }
    if (result.origin === studioConfiguration.origin) {
      return { ok: false, code: "PREVIEW_ORIGIN_NOT_ISOLATED" }
    }
  }
  return result
}

function normalizeOrigin(value: string, environment: RuntimeEnvironment): CompatiblePreviewOriginResult {
  const parsed = parseStrictOrigin(value)
  if (!parsed) return { ok: false, code: "PREVIEW_ORIGIN_INVALID" }
  if (environment === "production" && parsed.protocol !== "https:") {
    return { ok: false, code: "PREVIEW_ORIGIN_INSECURE" }
  }
  return { ok: true, origin: parsed.origin }
}

function parseStrictOrigin(value: string): { origin: string; protocol: "http:" | "https:" } | null {
  try {
    const trimmed = value.trim()
    const url = new URL(trimmed)
    const normalizedInput = trimmed.endsWith("/") ? trimmed.slice(0, -1) : trimmed
    if (
      (url.protocol !== "https:" && url.protocol !== "http:") ||
      url.origin === "null" ||
      url.username ||
      url.password ||
      url.search ||
      url.hash ||
      (url.pathname !== "/" && url.pathname !== "") ||
      normalizedInput !== url.origin
    ) {
      return null
    }
    return { origin: url.origin, protocol: url.protocol }
  } catch {
    return null
  }
}

type BootstrapOffer = Readonly<{
  protocolVersion: typeof BOOTSTRAP_PROTOCOL_VERSION
  type: "repopress:bootstrap-offer"
  sessionId: string
  snapshotVersion: number
  capability: string
}>

type BootstrapAcceptance = Readonly<{
  protocolVersion: typeof BOOTSTRAP_PROTOCOL_VERSION
  type: "repopress:bootstrap-accept"
  sessionId: string
  snapshotVersion: number
  capability: string
}>

type FrameWindow = Readonly<{
  postMessage(message: string, targetOrigin: string, transfer?: Transferable[]): void
}>

type HostWindow = Readonly<{
  addEventListener(type: "message", listener: (event: MessageEvent) => void): void
  removeEventListener(type: "message", listener: (event: MessageEvent) => void): void
}>

type BootstrapEvent = Readonly<{
  data: unknown
  source: unknown
  origin?: unknown
}>

export type CompatiblePreviewHost = Readonly<{
  start(): void
  retryBootstrap(): void
  receiveWindowMessage(event: BootstrapEvent): boolean
  dispose(): void
  getSessionState(): SandboxSessionState
}>

export function createCompatiblePreviewHost(options: {
  hostWindow: HostWindow
  iframeWindow: FrameWindow
  authorityContext: CompatiblePreviewAuthorityContext
  resolution?: VerifiedCompatiblePreviewResolution
  createMessageChannel?: () => MessageChannel
  onMessage?: (message: SandboxMessage) => void
}): CompatiblePreviewHost {
  let state = createSandboxSessionState({
    sessionId: options.authorityContext.sessionId,
    snapshotVersion: options.authorityContext.snapshotVersion,
  })
  let capability: string | null = null
  let offer: BootstrapOffer | null = null
  let port: MessagePort | null = null
  let started = false
  let disposed = false

  const closePort = () => {
    if (!port) return
    port.onmessage = null
    port.close()
    port = null
  }

  const listener = (event: MessageEvent) => {
    receiveWindowMessage(event)
  }

  const terminate = () => {
    if (disposed) return
    disposed = true
    if (started) options.hostWindow.removeEventListener("message", listener)
    if (capability !== null) invalidateBootstrapCapability(capability)
    capability = null
    offer = null
    closePort()
    state = invalidateSandboxSession(state)
  }

  const sendBootstrapOffer = () => {
    if (disposed || capability === null || offer === null || port !== null) return
    try {
      // `"*"` is required because `sandbox="allow-scripts"` gives the child
      // an opaque origin. Window identity and the capability authenticate it.
      options.iframeWindow.postMessage(JSON.stringify(offer), "*")
    } catch {
      terminate()
    }
  }

  function receiveWindowMessage(event: BootstrapEvent): boolean {
    if (!started || disposed || port !== null || event.source !== options.iframeWindow) return false
    const acceptance = parseBootstrapAcceptance(event.data)
    if (
      !acceptance ||
      acceptance.sessionId !== state.sessionId ||
      acceptance.snapshotVersion !== state.snapshotVersion ||
      capability === null
    ) {
      return false
    }
    if (
      !acceptBootstrap({
        expectedWindow: options.iframeWindow,
        eventSource: event.source,
        capability: acceptance.capability,
        sessionId: acceptance.sessionId,
        // An opaque sandbox normally reports "null". It is metadata only.
        origin: event.origin,
      })
    ) {
      return false
    }

    capability = null
    offer = null
    let channel: MessageChannel
    try {
      channel = (options.createMessageChannel ?? (() => new MessageChannel()))()
    } catch {
      terminate()
      return false
    }
    port = channel.port1
    port.onmessage = (messageEvent) => {
      const validation = validateSandboxMessage(messageEvent.data, state)
      state = advanceSandboxSequence(validation)
      if (!validation.accepted) {
        if (TERMINAL_SANDBOX_REFUSALS.has(validation.code)) terminate()
        return
      }
      if (validation.message.type === "teardown") terminate()
      try {
        options.onMessage?.(validation.message)
      } catch {
        // Consumer callbacks cannot break the authenticated transport boundary.
      }
    }
    port.start()

    if (options.resolution) {
      const authenticatedPort = port
      void serializeCompatibleArtifactTransfer({
        resolution: options.resolution,
        expectedAuthority: options.authorityContext,
      })
        .then((wires) => {
          if (disposed || port !== authenticatedPort) return
          for (const wire of wires) authenticatedPort.postMessage(wire)
        })
        .catch(() => terminate())
    }

    try {
      options.iframeWindow.postMessage(
        JSON.stringify({
          protocolVersion: BOOTSTRAP_PROTOCOL_VERSION,
          type: "repopress:bootstrap-port",
          sessionId: state.sessionId,
        }),
        "*",
        [channel.port2],
      )
    } catch {
      terminate()
      return false
    }
    return true
  }

  return Object.freeze({
    start() {
      if (started || disposed) return
      started = true
      options.hostWindow.addEventListener("message", listener)
      try {
        capability = createBootstrapCapability({
          expectedWindow: options.iframeWindow,
          sessionId: state.sessionId,
        })
      } catch {
        terminate()
        return
      }
      offer = {
        protocolVersion: BOOTSTRAP_PROTOCOL_VERSION,
        type: "repopress:bootstrap-offer",
        sessionId: state.sessionId,
        snapshotVersion: state.snapshotVersion,
        capability,
      }
      sendBootstrapOffer()
    },
    retryBootstrap() {
      sendBootstrapOffer()
    },
    receiveWindowMessage,
    dispose() {
      terminate()
    },
    getSessionState() {
      return state
    },
  })
}

function parseBootstrapAcceptance(input: unknown): BootstrapAcceptance | null {
  if (typeof input !== "string" || input.length > BOOTSTRAP_WIRE_LIMIT) return null
  let value: unknown
  try {
    value = JSON.parse(input)
  } catch {
    return null
  }
  if (!isRecord(value)) return null
  const keys = Object.keys(value)
  if (
    keys.length !== 5 ||
    !keys.every((key) => ["protocolVersion", "type", "sessionId", "snapshotVersion", "capability"].includes(key)) ||
    value.protocolVersion !== BOOTSTRAP_PROTOCOL_VERSION ||
    value.type !== "repopress:bootstrap-accept" ||
    typeof value.sessionId !== "string" ||
    value.sessionId.length === 0 ||
    value.sessionId.length > 256 ||
    !Number.isSafeInteger(value.snapshotVersion) ||
    (value.snapshotVersion as number) <= 0 ||
    typeof value.capability !== "string" ||
    !CAPABILITY_PATTERN.test(value.capability)
  ) {
    return null
  }
  return value as BootstrapAcceptance
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value)
}

export interface CompatiblePreviewFrameProps {
  resolution: VerifiedCompatiblePreviewResolution
  authorityContext: CompatiblePreviewAuthorityContext
  className?: string
  title?: string
  onMessage?: (message: SandboxMessage) => void
  onUnavailable?: () => void
}

export function CompatiblePreviewFrame({
  resolution,
  authorityContext,
  className,
  title = "Compatible component preview",
  onMessage,
  onUnavailable,
}: CompatiblePreviewFrameProps) {
  const iframeRef = React.useRef<HTMLIFrameElement>(null)
  const hostRef = React.useRef<CompatiblePreviewHost | null>(null)
  const hasLoadedRef = React.useRef(false)
  const bootstrapRetryTimersRef = React.useRef<number[]>([])
  const [frameKilled, setFrameKilled] = React.useState(false)
  const sessionId = authorityContext.sessionId
  const snapshotVersion = authorityContext.snapshotVersion
  const onMessageRef = React.useRef(onMessage)
  const onUnavailableRef = React.useRef(onUnavailable)
  const [studioOrigin, setStudioOrigin] = React.useState<string | null>(null)

  React.useEffect(() => {
    setStudioOrigin(window.location.origin)
  }, [])

  React.useLayoutEffect(() => {
    onMessageRef.current = onMessage
    onUnavailableRef.current = onUnavailable
  }, [onMessage, onUnavailable])

  // biome-ignore lint/correctness/useExhaustiveDependencies: authority changes must synchronously dispose the prior channel.
  React.useLayoutEffect(() => {
    for (const timer of bootstrapRetryTimersRef.current) window.clearTimeout(timer)
    bootstrapRetryTimersRef.current = []
    hasLoadedRef.current = false
    setFrameKilled(false)
    return () => {
      for (const timer of bootstrapRetryTimersRef.current) window.clearTimeout(timer)
      bootstrapRetryTimersRef.current = []
      hostRef.current?.dispose()
      hostRef.current = null
    }
  }, [sessionId, snapshotVersion])

  const environment = process.env.NODE_ENV as RuntimeEnvironment
  const origin = studioOrigin
    ? resolveCompatiblePreviewOrigin({
        configuredOrigin: process.env.NEXT_PUBLIC_PREVIEW_ORIGIN,
        configuredStudioOrigin: process.env.NEXT_PUBLIC_APP_URL,
        studioOrigin,
        environment,
      })
    : null

  const handleLoad = React.useCallback(() => {
    for (const timer of bootstrapRetryTimersRef.current) window.clearTimeout(timer)
    bootstrapRetryTimersRef.current = []
    if (hasLoadedRef.current) {
      hostRef.current?.dispose()
      hostRef.current = null
      setFrameKilled(true)
      onUnavailableRef.current?.()
      return
    }
    hasLoadedRef.current = true
    const iframeWindow = iframeRef.current?.contentWindow
    if (!iframeWindow || !origin?.ok) return
    hostRef.current?.dispose()
    const host = createCompatiblePreviewHost({
      hostWindow: window,
      iframeWindow,
      authorityContext,
      resolution,
      onMessage: (message) => onMessageRef.current?.(message),
    })
    hostRef.current = host
    host.start()
    bootstrapRetryTimersRef.current = BOOTSTRAP_RETRY_DELAYS_MS.map((delay) =>
      window.setTimeout(() => host.retryBootstrap(), delay),
    )
  }, [authorityContext, origin, resolution])

  if (frameKilled) {
    return (
      <output
        data-preview-unavailable="FRAME_RELOADED"
        className={cn("rounded-lg border border-border bg-muted p-4 text-sm text-muted-foreground", className)}
      >
        Compatible preview stopped because its isolated frame navigated.
      </output>
    )
  }

  if (origin !== null && !origin.ok) {
    return (
      <output
        data-preview-unavailable={origin.code}
        className={cn("rounded-lg border border-border bg-muted p-4 text-sm text-muted-foreground", className)}
      >
        Compatible preview is unavailable because its isolated origin is not configured.
      </output>
    )
  }

  if (!origin) {
    return (
      <output className={cn("rounded-lg border border-border bg-muted p-4 text-sm text-muted-foreground", className)}>
        Preparing isolated preview…
      </output>
    )
  }

  return (
    <iframe
      key={`${sessionId}:${snapshotVersion}`}
      ref={iframeRef}
      title={title}
      src={`${origin.origin}/preview/sandbox`}
      sandbox="allow-scripts"
      referrerPolicy="no-referrer"
      onLoad={handleLoad}
      className={cn("h-full min-h-80 w-full rounded-lg border border-border bg-background", className)}
    />
  )
}
