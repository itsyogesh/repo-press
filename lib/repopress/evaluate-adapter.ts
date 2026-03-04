import React from "react"
import * as jsxRuntime from "react/jsx-runtime"

export interface RepoPressPreviewAdapter {
  components?: Record<string, React.ComponentType<any>>
  scope?: Record<string, unknown>
  allowImports?: Record<string, Record<string, unknown>>
  resolveAssetUrl?: (input: string, ctx: { owner: string; repo: string; branch: string; filePath: string }) => string
  onPreviewError?: (error: Error, ctx: { filePath: string }) => React.ReactNode
}

/**
 * Fix #2: Allowlist of modules the adapter `require()` shim will resolve.
 * Anything not listed here throws, preventing arbitrary module access.
 */
const ALLOWED_ADAPTER_MODULES: Record<string, unknown> = {
  react: React,
  "react/jsx-runtime": jsxRuntime,
}

// Standard RepoPress adapter shim modules
const SHIM_MODULES: Record<string, Record<string, unknown>> = {
  "@/components/docs/doc-media": {
    DocsImage: (_props: any) => null,
    DocsVideo: (_props: any) => null,
    Callout: (_props: any) => null,
  },
  "@components/docs/doc-media": {
    DocsImage: (_props: any) => null,
    DocsVideo: (_props: any) => null,
    Callout: (_props: any) => null,
  },
  "@/lib/constants/docs": { DOCS_SETUP_MEDIA: {} },
  "@lib/constants/docs": { DOCS_SETUP_MEDIA: {} },
}

export function evaluateAdapter(code: string): RepoPressPreviewAdapter {
  const exports: Record<string, any> = {}
  const module = { exports }
  const require = (name: string) => {
    if (name in ALLOWED_ADAPTER_MODULES) return ALLOWED_ADAPTER_MODULES[name]
    if (name in SHIM_MODULES) return SHIM_MODULES[name]

    throw new Error(`Module ${name} is not available in the adapter sandbox.`)
  }

  // Fix #2: Shadow dangerous globals in adapter evaluation.
  // Adapter code comes from the user's GitHub repo — a compromised repo could
  // exfiltrate session tokens via fetch/XMLHttpRequest/etc.
  // SECURITY: This is defence-in-depth. Task 4 will replace `new Function()`.
  const blockedGlobals = [
    "fetch",
    "XMLHttpRequest",
    "WebSocket",
    "EventSource",
    "localStorage",
    "sessionStorage",
    "indexedDB",
    "document",
    "navigator",
    "location",
    "history",
    "crypto",
    "opener",
    "parent",
    "top",
    "frames",
    "postMessage",
    "importScripts",
    "eval",
    "Function",
  ]
  const blockedParams = blockedGlobals.join(",")
  const blockedValues = blockedGlobals.map(() => undefined)

  const fn = new Function("exports", "module", "require", "React", ...blockedGlobals, code)

  try {
    fn(exports, module, require, React, ...blockedValues)
  } catch (err: any) {
    console.error("Adapter evaluation failed", err)
    throw new Error(`Failed to evaluate adapter: ${err.message}`)
  }

  // Support both named export `adapter` and default export
  if (exports.adapter) return exports.adapter
  if (exports.default) return exports.default

  // If no explicit adapter object, maybe the file exports parts directly
  return {
    components: exports.components,
    scope: exports.scope,
    allowImports: exports.allowImports,
  }
}
