"use client"

import * as React from "react"
import {
  COMPATIBLE_COMMAND_RATE_BURST,
  COMPATIBLE_RENDERER_PROFILE,
  decodeCompatibleArtifactChunk,
  parseAssembledCompatibleResolution,
  parseCompatibleTransferCommand,
  type SignedCompatiblePreviewResolution,
  sha256Hex,
  verifyCompatibleExecutableDigest,
} from "@/lib/preview/compatible-artifact"
import {
  COMPATIBLE_FAILURE_MESSAGES,
  COMPATIBLE_FIDELITY_LOSS_MESSAGES,
  type CompatibleFailureCode,
} from "@/lib/preview/compatible-diagnostics"
import type { PreviewDiagnostic } from "@/lib/preview/contracts"
import { serializeSandboxMessage } from "@/lib/preview/sandbox-protocol"
import { type CompatibleRenderTree, CompatibleRenderTreeView } from "./compatible-render-tree"
import {
  CompatibleWorkerPipelineError,
  createCompatibleWorkerRenderer,
  prepareCompatibleWorkerJob,
} from "./compatible-worker"

const BOOTSTRAP_PROTOCOL_VERSION = 1 as const
const BOOTSTRAP_WIRE_LIMIT = 2_048
const CAPABILITY_PATTERN = /^[A-Za-z0-9_-]{43}$/

function compatibleFailure(
  error: unknown,
  phase: "compile" | "worker",
): {
  code: CompatibleFailureCode
  message: string
  recoverable: true
} {
  const code: CompatibleFailureCode =
    error instanceof CompatibleWorkerPipelineError
      ? error.code
      : phase === "compile"
        ? "COMPATIBLE_COMPILE_FAILED"
        : "COMPATIBLE_EXECUTION_FAILED"
  return { code, message: COMPATIBLE_FAILURE_MESSAGES[code], recoverable: true }
}

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
  reportStatus(status: "loading" | "rendering" | "ready", rendererProfile?: typeof COMPATIBLE_RENDERER_PROFILE): void
  reportDiagnostics(diagnostics: readonly PreviewDiagnostic[]): void
  reportRendered(): void
  reportError(error: { code: string; message: string; recoverable: boolean }): void
  dispose(): void
}>

export function createSandboxRuntimeBridge(options: {
  sandboxWindow: SandboxWindow
  parentWindow: ParentWindow
  onResolution?: (resolution: SignedCompatiblePreviewResolution) => void
}): SandboxRuntimeBridge {
  let offer: BootstrapOffer | null = null
  let port: MessagePort | null = null
  let sequence = 0
  let commandSequence = 0
  let commandAttempts = 0
  let assembly: {
    transferId: string
    totalBytes: number
    totalChunks: number
    digest: string
    chunks: Uint8Array[]
    receivedBytes: number
  } | null = null
  let started = false
  let disposed = false

  const send = (
    type: "ready" | "status" | "diagnostics" | "rendered" | "error" | "teardown",
    payload: Record<string, unknown> = {},
  ) => {
    if (!port || !offer) return
    const nextSequence = sequence + 1
    try {
      const wire = serializeSandboxMessage({
        protocolVersion: BOOTSTRAP_PROTOCOL_VERSION,
        type,
        sessionId: offer.sessionId,
        snapshotVersion: offer.snapshotVersion,
        sequence: nextSequence,
        payload,
      })
      sequence = nextSequence
      port.postMessage(wire)
    } catch {
      // Reporting must never widen the authenticated transport contract.
    }
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
    port.onmessage = (messageEvent) => {
      if (!offer || disposed) return
      commandAttempts += 1
      if (commandAttempts > COMPATIBLE_COMMAND_RATE_BURST) {
        assembly = null
        port?.close()
        port = null
        disposed = true
        if (started) options.sandboxWindow.removeEventListener("message", listener)
        return
      }
      const command = parseCompatibleTransferCommand(messageEvent.data)
      if (
        !command ||
        command.sessionId !== offer.sessionId ||
        command.snapshotVersion !== offer.snapshotVersion ||
        command.sequence !== commandSequence + 1
      ) {
        assembly = null
        return
      }
      commandSequence = command.sequence

      if (command.type === "repopress:artifact-start") {
        if (assembly !== null) {
          assembly = null
          return
        }
        assembly = { ...command.payload, chunks: [], receivedBytes: 0 }
        return
      }
      if (!assembly || command.payload.transferId !== assembly.transferId) {
        assembly = null
        return
      }
      if (command.type === "repopress:artifact-chunk") {
        const chunk = decodeCompatibleArtifactChunk(command.payload.data)
        if (
          !chunk ||
          command.payload.index !== assembly.chunks.length ||
          assembly.chunks.length >= assembly.totalChunks ||
          assembly.receivedBytes + chunk.length > assembly.totalBytes
        ) {
          assembly = null
          return
        }
        assembly.chunks.push(chunk)
        assembly.receivedBytes += chunk.length
        return
      }

      const completed = assembly
      assembly = null
      if (completed.chunks.length !== completed.totalChunks || completed.receivedBytes !== completed.totalBytes) return
      const bytes = new Uint8Array(completed.totalBytes)
      let offset = 0
      for (const chunk of completed.chunks) {
        bytes.set(chunk, offset)
        offset += chunk.length
      }
      void Promise.all([sha256Hex(bytes), Promise.resolve(parseAssembledCompatibleResolution(bytes))])
        .then(async ([transportDigest, parsed]) => {
          if (disposed) return
          if (transportDigest !== completed.digest || !parsed) {
            send("error", {
              code: "SANDBOX_ARTIFACT_REJECTED",
              message: COMPATIBLE_FAILURE_MESSAGES.SANDBOX_ARTIFACT_REJECTED,
              recoverable: true,
            })
            return
          }
          const verified = await verifyCompatibleExecutableDigest(parsed)
          if (
            !disposed &&
            verified &&
            verified.authority.sessionId === offer?.sessionId &&
            verified.authority.snapshotVersion === offer.snapshotVersion
          ) {
            options.onResolution?.(verified)
          } else if (!disposed) {
            send("error", {
              code: "SANDBOX_ARTIFACT_REJECTED",
              message: COMPATIBLE_FAILURE_MESSAGES.SANDBOX_ARTIFACT_REJECTED,
              recoverable: true,
            })
          }
        })
        .catch(() => {
          send("error", {
            code: "SANDBOX_ARTIFACT_REJECTED",
            message: COMPATIBLE_FAILURE_MESSAGES.SANDBOX_ARTIFACT_REJECTED,
            recoverable: true,
          })
        })
    }
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
    reportStatus(status, rendererProfile) {
      send("status", rendererProfile ? { status, rendererProfile } : { status })
    },
    reportDiagnostics(diagnostics) {
      send("diagnostics", { diagnostics })
    },
    reportRendered() {
      send("rendered")
    },
    reportError(error) {
      send("error", error)
    },
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
      assembly = null
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

class CompatibleRenderErrorBoundary extends React.Component<
  { children: React.ReactNode; onError: () => void },
  { failed: boolean }
> {
  state = { failed: false }

  static getDerivedStateFromError() {
    return { failed: true }
  }

  componentDidCatch() {
    this.props.onError()
  }

  render() {
    return this.state.failed ? null : this.props.children
  }
}

export function SandboxRuntime() {
  const [renderTree, setRenderTree] = React.useState<CompatibleRenderTree | null>(null)
  const [renderError, setRenderError] = React.useState<string | null>(null)
  const bridgeRef = React.useRef<SandboxRuntimeBridge | null>(null)
  const reportHostRenderFailure = React.useCallback(() => {
    const code = "COMPATIBLE_HOST_RENDER_FAILED"
    setRenderTree(null)
    setRenderError(COMPATIBLE_FAILURE_MESSAGES[code])
    bridgeRef.current?.reportError({ code, message: COMPATIBLE_FAILURE_MESSAGES[code], recoverable: true })
  }, [])

  React.useEffect(() => {
    if (window.parent === window) return
    let active = true
    let workerRenderer: ReturnType<typeof createCompatibleWorkerRenderer> | null = null
    let bridge: SandboxRuntimeBridge
    bridge = createSandboxRuntimeBridge({
      sandboxWindow: window,
      parentWindow: window.parent,
      onResolution: (resolution) => {
        bridge.reportStatus("loading", COMPATIBLE_RENDERER_PROFILE)
        let phase: "compile" | "worker" = "compile"
        void prepareCompatibleWorkerJob(resolution.artifact)
          .then(async (job) => {
            if (!active) return null
            phase = "worker"
            workerRenderer = createCompatibleWorkerRenderer()
            return await workerRenderer.render(job)
          })
          .then((result) => {
            if (!result) return
            if (!active) return
            if (result.fidelityLosses.length > 0) {
              const diagnostics = result.fidelityLosses.map(
                (code): PreviewDiagnostic => ({
                  stage: "render",
                  severity: "warning",
                  code,
                  message: COMPATIBLE_FIDELITY_LOSS_MESSAGES[code],
                  recoverable: true,
                  fidelityImpact: "compatible",
                }),
              )
              setRenderTree(null)
              setRenderError("This artifact requires Generic preview because static-inert-v1 would lose fidelity.")
              bridge.reportDiagnostics(diagnostics)
              return
            }
            bridge.reportStatus("rendering", COMPATIBLE_RENDERER_PROFILE)
            setRenderError(null)
            setRenderTree(result.tree)
            bridge.reportStatus("ready", COMPATIBLE_RENDERER_PROFILE)
            bridge.reportRendered()
          })
          .catch((error: unknown) => {
            if (!active) return
            const failure = compatibleFailure(error, phase)
            setRenderTree(null)
            setRenderError(failure.message)
            bridge.reportError(failure)
          })
      },
    })
    bridgeRef.current = bridge
    bridge.start()
    return () => {
      active = false
      workerRenderer?.dispose()
      bridge.dispose()
      bridgeRef.current = null
    }
  }, [])

  return (
    <main className="min-h-screen bg-background p-6 text-foreground">
      {renderTree ? (
        <CompatibleRenderErrorBoundary onError={reportHostRenderFailure}>
          <CompatibleRenderTreeView tree={renderTree} />
        </CompatibleRenderErrorBoundary>
      ) : (
        <div
          data-repopress-sandbox-shell="inert"
          className="rounded-lg border border-border bg-card p-4 text-sm text-muted-foreground"
        >
          {renderError ?? "Compatible preview sandbox ready."}
        </div>
      )}
    </main>
  )
}
