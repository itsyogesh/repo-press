/**
 * Executable bindings owned by an isolated preview runtime.
 *
 * This module is intentionally framework-neutral: React components, Astro
 * compiler inputs, and other runtime values may all be bindings. Studio must
 * only receive the names projected by `getRenderBindingNames`, never this map.
 */
export type RenderBindings = Readonly<Record<string, unknown>>

export function createRenderBindings<const T extends Record<string, unknown>>(bindings: T): Readonly<T> {
  return Object.freeze({ ...bindings })
}

export function getRenderBindingNames(bindings: RenderBindings): string[] {
  return Object.keys(bindings).sort((a, b) => a.localeCompare(b))
}
