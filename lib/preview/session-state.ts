import { z } from "zod"
import {
  type PreviewDiagnostic,
  type PreviewFidelity,
  type PreviewSessionStatus,
  previewDiagnosticSchema,
  previewFidelitySchema,
  previewSessionEventSchema,
  previewSessionStatusSchema,
} from "./contracts"

function isHttpsUrl(value: string): boolean {
  try {
    return new URL(value).protocol === "https:"
  } catch {
    return false
  }
}

const targetSchema = z.discriminatedUnion("kind", [
  z
    .object({
      kind: z.literal("sandboxed-iframe"),
      url: z.string().url().refine(isHttpsUrl),
    })
    .strict(),
  z
    .object({
      kind: z.literal("safe-fallback"),
      renderModel: z
        .object({
          blocks: z.array(z.record(z.string(), z.unknown())),
        })
        .strict(),
    })
    .strict(),
])

export type PreviewTarget = z.infer<typeof targetSchema>

type EventMetadata = {
  sessionId: string
  snapshotVersion: number
  sequence: number
}

export type AppliedPreviewEvent = EventMetadata &
  (
    | { type: "status"; payload: PreviewSessionStatus }
    | { type: "target"; payload: PreviewTarget }
    | { type: "diagnostics"; payload: PreviewDiagnostic[] }
    | { type: "fidelity"; payload: PreviewFidelity }
    | { type: "expired"; payload: null }
  )

export type PreviewSessionState = {
  editorRevision: string
  sessionId: string | null
  snapshotVersion: number
  sequence: number
  status: PreviewSessionStatus
  fidelity: PreviewFidelity
  target?: PreviewTarget
  diagnostics: PreviewDiagnostic[]
  events: AppliedPreviewEvent[]
}

export function createPreviewSessionState(input: { editorRevision: string }): PreviewSessionState {
  return {
    editorRevision: input.editorRevision,
    sessionId: null,
    snapshotVersion: 0,
    sequence: 0,
    status: "queued",
    fidelity: "generic",
    diagnostics: [],
    events: [],
  }
}

function parseAppliedEvent(input: unknown): AppliedPreviewEvent | null {
  const parsed = previewSessionEventSchema.safeParse(input)
  if (!parsed.success) return null

  const { sessionId, snapshotVersion, sequence, type, payload } = parsed.data
  const metadata = { sessionId, snapshotVersion, sequence }

  switch (type) {
    case "status": {
      const status = previewSessionStatusSchema.safeParse(payload)
      return status.success ? { ...metadata, type, payload: status.data } : null
    }
    case "target": {
      const target = targetSchema.safeParse(payload)
      return target.success ? { ...metadata, type, payload: target.data } : null
    }
    case "diagnostics": {
      const diagnostics = z.array(previewDiagnosticSchema).safeParse(payload)
      return diagnostics.success ? { ...metadata, type, payload: diagnostics.data } : null
    }
    case "fidelity": {
      const fidelity = previewFidelitySchema.safeParse(payload)
      return fidelity.success ? { ...metadata, type, payload: fidelity.data } : null
    }
    case "expired":
      return payload === null ? { ...metadata, type, payload: null } : null
  }
}

export function reducePreviewEvent(state: PreviewSessionState, input: unknown): PreviewSessionState {
  if (state.status === "expired") return state

  const event = parseAppliedEvent(input)
  if (!event) return state
  if (state.sessionId !== null && event.sessionId !== state.sessionId) return state
  if (event.snapshotVersion < state.snapshotVersion) return state
  if (event.snapshotVersion === state.snapshotVersion && event.sequence <= state.sequence) {
    return state
  }
  const next: PreviewSessionState = {
    ...state,
    sessionId: event.sessionId,
    snapshotVersion: event.snapshotVersion,
    sequence: event.sequence,
    events: [...state.events, event],
  }

  switch (event.type) {
    case "status":
      return { ...next, status: event.payload }
    case "target":
      return { ...next, target: event.payload }
    case "diagnostics":
      return {
        ...next,
        diagnostics: [...state.diagnostics, ...event.payload],
      }
    case "fidelity":
      return { ...next, fidelity: event.payload }
    case "expired":
      return { ...next, status: "expired" }
  }
}
