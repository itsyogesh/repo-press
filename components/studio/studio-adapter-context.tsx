"use client"

import * as React from "react"
import type { AuthoringCatalog } from "@/lib/studio/authoring-catalog"
import { assertSafeMdxName, isValidatedAuthoringCatalog } from "@/lib/studio/authoring-catalog"

export type StudioAdapterContextValue = {
  authoringCatalog: AuthoringCatalog
  nativeComponentNames: readonly string[]
  detectedFramework?: string
  diagnostics: readonly string[]
}

type StudioAdapterStateInput = Omit<StudioAdapterContextValue, "diagnostics"> & {
  diagnostics?: readonly string[]
}

const ALLOWED_STATE_FIELDS = new Set(["authoringCatalog", "nativeComponentNames", "detectedFramework", "diagnostics"])
const validatedStudioStates = new WeakSet<object>()

function assertJsonValue(value: unknown, active = new WeakSet<object>()): void {
  if (value === null || typeof value === "string" || typeof value === "boolean") return
  if (typeof value === "number" && Number.isFinite(value)) return
  if (typeof value !== "object") throw new TypeError("Studio adapter state must contain only serializable values")
  if (active.has(value)) throw new TypeError("Studio adapter state must not contain cycles")
  active.add(value)
  if (Array.isArray(value)) {
    for (let index = 0; index < value.length; index += 1) {
      if (!Object.hasOwn(value, index)) throw new TypeError("Studio adapter state must not contain sparse arrays")
    }
  } else {
    const prototype = Object.getPrototypeOf(value)
    if (prototype !== Object.prototype && prototype !== null) {
      throw new TypeError("Studio adapter state must contain only arrays and plain objects")
    }
  }
  for (const key of Object.keys(value)) {
    const descriptor = Object.getOwnPropertyDescriptor(value, key)
    if (!descriptor || !("value" in descriptor)) throw new TypeError("Studio adapter state must not contain accessors")
    assertJsonValue(descriptor.value, active)
  }
  active.delete(value)
}

function assertDeepFrozen(value: unknown, seen = new WeakSet<object>()): void {
  if (value === null || typeof value !== "object" || seen.has(value)) return
  if (!Object.isFrozen(value)) throw new TypeError("Studio authoring catalog must be deeply frozen")
  seen.add(value)
  for (const key of Object.keys(value)) assertDeepFrozen(Object.getOwnPropertyDescriptor(value, key)?.value, seen)
}

export function createStudioAdapterState(input: StudioAdapterStateInput): StudioAdapterContextValue {
  if (validatedStudioStates.has(input)) return input as StudioAdapterContextValue
  for (const key of Object.keys(input)) {
    if (!ALLOWED_STATE_FIELDS.has(key)) throw new TypeError(`unknown Studio adapter state field: ${key}`)
  }
  assertJsonValue(input)
  if (!Array.isArray(input.authoringCatalog)) throw new TypeError("authoringCatalog must be an array")
  if (!isValidatedAuthoringCatalog(input.authoringCatalog)) {
    throw new TypeError("authoringCatalog must come from canonical validation")
  }
  assertDeepFrozen(input.authoringCatalog)
  if (
    !Array.isArray(input.nativeComponentNames) ||
    Array.from({ length: input.nativeComponentNames.length }, (_, index) => index).some(
      (index) => !Object.hasOwn(input.nativeComponentNames, index),
    ) ||
    input.nativeComponentNames.some((name) => typeof name !== "string")
  ) {
    throw new TypeError("nativeComponentNames must be a string array")
  }
  input.nativeComponentNames.forEach(assertSafeMdxName)
  if (input.detectedFramework !== undefined && typeof input.detectedFramework !== "string") {
    throw new TypeError("detectedFramework must be a string")
  }
  const diagnostics = input.diagnostics ?? []
  if (
    !Array.isArray(diagnostics) ||
    Array.from({ length: diagnostics.length }, (_, index) => index).some(
      (index) => !Object.hasOwn(diagnostics, index),
    ) ||
    diagnostics.some((item) => typeof item !== "string")
  ) {
    throw new TypeError("diagnostics must be a string array")
  }
  const state = Object.freeze({
    authoringCatalog: input.authoringCatalog,
    nativeComponentNames: Object.freeze([...input.nativeComponentNames]),
    ...(input.detectedFramework !== undefined ? { detectedFramework: input.detectedFramework } : {}),
    diagnostics: Object.freeze([...diagnostics]),
  })
  validatedStudioStates.add(state)
  return state
}

const StudioAdapterContext = React.createContext<StudioAdapterContextValue | null>(null)

export function StudioAdapterProvider({
  children,
  value,
}: {
  children: React.ReactNode
  value: StudioAdapterContextValue
}) {
  const safeValue = React.useMemo(() => createStudioAdapterState(value), [value])
  return <StudioAdapterContext.Provider value={safeValue}>{children}</StudioAdapterContext.Provider>
}

export function useStudioAdapter() {
  const context = React.useContext(StudioAdapterContext)
  if (!context) throw new Error("useStudioAdapter must be used within a StudioAdapterProvider")
  return context
}
