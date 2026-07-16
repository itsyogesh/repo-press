"use client"

import * as React from "react"
import { serializeSandboxMessage } from "@/lib/preview/sandbox-protocol"

const BOOTSTRAP_PROTOCOL_VERSION = 1 as const
const BOOTSTRAP_WIRE_LIMIT = 2_048
const CAPABILITY_PATTERN = /^[A-Za-z0-9_-]{43}$/

type SandboxWindow = Readonly<{
  addEventListener(type: "message", listener: (event: MessageEvent) => void): void
  removeEventListener(type: "message", listener: (event: MessageEvent) => void): void
}>

type ParentWindow = Readonly<{
  postMessage(message: string, targetOrigin: string): void
}>

type SandboxBootstrapEvent = Readonly<{
  data: unknown
  source: unknown
  origin?: unknown
  ports: readonly MessagePort[]
}>

type BootstrapOffer = Readonly<{
  protocolVersion: typeof BOOTSTRAP_PROTOCOL_VERSION
  type: "repopress:bootstrap-offer"
  sessionId: string
  snapshotVersion: number
  capability: string
}>

type BootstrapPort = Readonly<{
  protocolVersion: typeof BOOTSTRAP_PROTOCOL_VERSION
  type: "repopress:bootstrap-port"
  sessionId: string
}>

export type SandboxRuntimeBridge = Readonly<{
  start(): void
  receiveWindowMessage(event: SandboxBootstrapEvent): boolean
  dispose(): void
}>

export function createSandboxRuntimeBridge(options: {
  sandboxWindow: SandboxWindow
  parentWindow: ParentWindow
}): SandboxRuntimeBridge {
  let offer: BootstrapOffer | null = null
  let port: MessagePort | null = null
  let sequence = 0
  let started = false
  let disposed = false

  const send = (type: "ready" | "teardown") => {
    if (!port || !offer) return
    sequence += 1
    port.postMessage(
      serializeSandboxMessage({
        protocolVersion: BOOTSTRAP_PROTOCOL_VERSION,
        type,
        sessionId: offer.sessionId,
        snapshotVersion: offer.snapshotVersion,
        sequence,
        payload: {},
      }),
    )
  }

  const receiveWindowMessage = (event: SandboxBootstrapEvent): boolean => {
    if (!started || disposed || event.source !== options.parentWindow) return false

    const incomingOffer = parseBootstrapOffer(event.data)
    if (incomingOffer) {
      if (offer !== null || port !== null) return false
      offer = incomingOffer
      options.parentWindow.postMessage(JSON.stringify({ ...incomingOffer, type: "repopress:bootstrap-accept" }), "*")
      return true
    }

    const incomingPort = parseBootstrapPort(event.data)
    const transferredPort = event.ports[0]
    if (!incomingPort || !offer || port !== null || !transferredPort || incomingPort.sessionId !== offer.sessionId) {
      return false
    }
    port = transferredPort
    port.start()
    send("ready")
    return true
  }

  const listener = (event: MessageEvent) => {
    receiveWindowMessage({
      data: event.data,
      source: event.source,
      origin: event.origin,
      ports: event.ports,
    })
  }

  return Object.freeze({
    start() {
      if (started || disposed) return
      started = true
      options.sandboxWindow.addEventListener("message", listener)
    },
    receiveWindowMessage,
    dispose() {
      if (disposed) return
      disposed = true
      if (started) options.sandboxWindow.removeEventListener("message", listener)
      if (port) {
        send("teardown")
        port.onmessage = null
        port.close()
        port = null
      }
      offer = null
    },
  })
}

function parseBootstrapOffer(input: unknown): BootstrapOffer | null {
  const value = parseBootstrapWire(input)
  if (
    !value ||
    Object.keys(value).length !== 5 ||
    value.type !== "repopress:bootstrap-offer" ||
    typeof value.capability !== "string" ||
    !CAPABILITY_PATTERN.test(value.capability) ||
    !Number.isSafeInteger(value.snapshotVersion) ||
    (value.snapshotVersion as number) <= 0
  ) {
    return null
  }
  return value as BootstrapOffer
}

function parseBootstrapPort(input: unknown): BootstrapPort | null {
  const value = parseBootstrapWire(input)
  if (value && Object.keys(value).length === 3 && value.type === "repopress:bootstrap-port") {
    return value as BootstrapPort
  }
  return null
}

function parseBootstrapWire(input: unknown): Record<string, unknown> | null {
  if (typeof input !== "string" || input.length > BOOTSTRAP_WIRE_LIMIT) return null
  let value: unknown
  try {
    value = JSON.parse(input)
  } catch {
    return null
  }
  if (
    typeof value !== "object" ||
    value === null ||
    Array.isArray(value) ||
    (value as Record<string, unknown>).protocolVersion !== BOOTSTRAP_PROTOCOL_VERSION ||
    typeof (value as Record<string, unknown>).sessionId !== "string" ||
    (value as Record<string, unknown>).sessionId === "" ||
    (value as Record<string, unknown>).sessionId!.toString().length > 256
  ) {
    return null
  }
  return value as Record<string, unknown>
}

export function SandboxRuntime() {
  React.useEffect(() => {
    if (window.parent === window) return
    const bridge = createSandboxRuntimeBridge({ sandboxWindow: window, parentWindow: window.parent })
    bridge.start()
    return () => bridge.dispose()
  }, [])

  return (
    <main className="min-h-screen bg-background p-6 text-foreground">
      <div
        data-repopress-sandbox-shell="inert"
        className="rounded-lg border border-border bg-card p-4 text-sm text-muted-foreground"
      >
        Compatible preview sandbox ready.
      </div>
    </main>
  )
}
