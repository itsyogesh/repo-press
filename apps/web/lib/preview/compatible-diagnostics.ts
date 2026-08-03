export const COMPATIBLE_FIDELITY_LOSS_MAX_REASONS = 32

export const COMPATIBLE_FIDELITY_LOSS_CODES = [
  "STATIC_INERT_EFFECT",
  "STATIC_INERT_LAYOUT_EFFECT",
  "STATIC_INERT_INSERTION_EFFECT",
  "STATIC_INERT_STATE",
  "STATIC_INERT_REDUCER",
  "STATIC_INERT_REF",
  "STATIC_INERT_EVENT",
  "STATIC_INERT_LINK",
  "STATIC_INERT_MEDIA",
  "STATIC_INERT_FRAME",
  "STATIC_INERT_FORM",
  "STATIC_INERT_NAVIGATION",
  "STATIC_INERT_NETWORK_ELEMENT",
  "STATIC_INERT_ACTIVE_CONTENT",
  "STATIC_INERT_STYLE",
  "STATIC_INERT_CLASS",
  "STATIC_INERT_PROP",
  "STATIC_INERT_UNSUPPORTED_ELEMENT",
  "STATIC_INERT_UNSUPPORTED_HOOK",
  "STATIC_INERT_UNSUPPORTED_COMPONENT",
  "STATIC_INERT_MISSING_REFERENCE",
] as const

export type CompatibleFidelityLossCode = (typeof COMPATIBLE_FIDELITY_LOSS_CODES)[number]

export const COMPATIBLE_FIDELITY_LOSS_MESSAGES: Readonly<Record<CompatibleFidelityLossCode, string>> = Object.freeze({
  STATIC_INERT_EFFECT: "Effects are unavailable in static-inert-v1.",
  STATIC_INERT_LAYOUT_EFFECT: "Layout effects are unavailable in static-inert-v1.",
  STATIC_INERT_INSERTION_EFFECT: "Insertion effects are unavailable in static-inert-v1.",
  STATIC_INERT_STATE: "State updates are unavailable in static-inert-v1.",
  STATIC_INERT_REDUCER: "Reducer dispatch is unavailable in static-inert-v1.",
  STATIC_INERT_REF: "Element refs are unavailable in static-inert-v1.",
  STATIC_INERT_EVENT: "Event handlers are unavailable in static-inert-v1.",
  STATIC_INERT_LINK: "Links are unavailable in static-inert-v1.",
  STATIC_INERT_MEDIA: "Media elements are unavailable in static-inert-v1.",
  STATIC_INERT_FRAME: "Embedded frames are unavailable in static-inert-v1.",
  STATIC_INERT_FORM: "Form behavior is unavailable in static-inert-v1.",
  STATIC_INERT_NAVIGATION: "Navigation behavior is unavailable in static-inert-v1.",
  STATIC_INERT_NETWORK_ELEMENT: "Network-bearing elements are unavailable in static-inert-v1.",
  STATIC_INERT_ACTIVE_CONTENT: "Active content is unavailable in static-inert-v1.",
  STATIC_INERT_STYLE: "Inline styles are unavailable in static-inert-v1.",
  STATIC_INERT_CLASS: "An unsupported class value was removed by static-inert-v1.",
  STATIC_INERT_PROP: "An unsupported element property was removed by static-inert-v1.",
  STATIC_INERT_UNSUPPORTED_ELEMENT: "An unsupported element was flattened by static-inert-v1.",
  STATIC_INERT_UNSUPPORTED_HOOK: "A hook uses semantics unavailable in static-inert-v1.",
  STATIC_INERT_UNSUPPORTED_COMPONENT: "A component uses behavior unavailable in static-inert-v1.",
  STATIC_INERT_MISSING_REFERENCE: "A missing component reference was replaced in static-inert-v1.",
})

const COMPATIBLE_FIDELITY_LOSS_CODE_SET = new Set<string>(COMPATIBLE_FIDELITY_LOSS_CODES)

export function isCompatibleFidelityLossCode(input: unknown): input is CompatibleFidelityLossCode {
  return typeof input === "string" && COMPATIBLE_FIDELITY_LOSS_CODE_SET.has(input)
}

export const COMPATIBLE_FAILURE_MESSAGES = Object.freeze({
  SANDBOX_ARTIFACT_REJECTED: "The signed compatible artifact was rejected.",
  COMPATIBLE_COMPILE_FAILED: "The artifact could not be compiled for static-inert-v1.",
  COMPATIBLE_WORKER_TIMEOUT: "The static-inert-v1 renderer timed out.",
  COMPATIBLE_WORKER_PROTOCOL_FAILED: "The static-inert-v1 renderer returned an invalid response.",
  COMPATIBLE_EXECUTION_FAILED: "The artifact could not execute in static-inert-v1.",
  COMPATIBLE_RENDER_FAILED: "The artifact could not render in static-inert-v1.",
  COMPATIBLE_INERT_TREE_INVALID: "The static-inert-v1 renderer returned an invalid inert tree.",
  COMPATIBLE_HOST_RENDER_FAILED: "The static-inert-v1 inert tree could not be displayed.",
  COMPATIBLE_FRAME_RELOADED: "The isolated compatible frame navigated unexpectedly.",
})

export type CompatibleFailureCode = keyof typeof COMPATIBLE_FAILURE_MESSAGES

export function isCompatibleFailureCode(input: unknown): input is CompatibleFailureCode {
  return typeof input === "string" && Object.hasOwn(COMPATIBLE_FAILURE_MESSAGES, input)
}

export function parseCompatibleFidelityLosses(input: unknown): readonly CompatibleFidelityLossCode[] | null {
  if (!Array.isArray(input) || input.length > COMPATIBLE_FIDELITY_LOSS_MAX_REASONS) return null
  const losses = new Set<CompatibleFidelityLossCode>()
  for (const value of input) {
    if (
      typeof value !== "string" ||
      !COMPATIBLE_FIDELITY_LOSS_CODE_SET.has(value) ||
      losses.has(value as CompatibleFidelityLossCode)
    ) {
      return null
    }
    losses.add(value as CompatibleFidelityLossCode)
  }
  return Object.freeze([...losses].sort())
}

export function mergeCompatibleFidelityLosses(
  ...batches: readonly (readonly CompatibleFidelityLossCode[])[]
): readonly CompatibleFidelityLossCode[] {
  const merged = new Set<CompatibleFidelityLossCode>()
  for (const batch of batches) {
    for (const code of batch) {
      if (merged.size >= COMPATIBLE_FIDELITY_LOSS_MAX_REASONS) break
      merged.add(code)
    }
  }
  return Object.freeze([...merged].sort())
}
