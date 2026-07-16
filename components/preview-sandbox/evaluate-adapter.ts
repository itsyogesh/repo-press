import React from "react"
import * as jsxRuntime from "react/jsx-runtime"
import { Callout, DocsImage, DocsVideo } from "@/components/docs/doc-media"
import { withEvalGuard, withFunctionConstructorGuard } from "./execution-guard"

export interface RepoPressPreviewAdapter {
  components?: Record<string, React.ComponentType<any>>
  /**
   * Context-aware component map keyed by contentRoot.
   * When the Studio is editing a document under a specific contentRoot,
   * the matching entry overrides `components` for the insert picker.
   *
   * Example (in .repopress/mdx-preview.tsx):
   * ```ts
   * componentsByContext: {
   *   "content/blog": { Callout },
   *   "content/docs": { DocsImage, DocsVideo, Callout },
   * }
   * ```
   *
   * Rendering (WYSIWYG parser, live preview) always uses the full `components`
   * set so existing content with any component continues to display correctly.
   * Only the insert picker is filtered.
   */
  componentsByContext?: Record<string, Record<string, React.ComponentType<any>>>
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
    DocsImage,
    DocsVideo,
    Callout,
  },
  "@components/docs/doc-media": {
    DocsImage,
    DocsVideo,
    Callout,
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

  // Defense in depth inside the opaque sandbox. This shadowing is not the
  // security boundary; the separate origin, CSP, signed source approval, and
  // authenticated channel provide that boundary.
  const blockedGlobals = [
    "window",
    "self",
    "globalThis",
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
  const blockedValues = blockedGlobals.map(() => undefined)

  try {
    withEvalGuard(() =>
      withFunctionConstructorGuard(() => {
        const fn = new Function("exports", "module", "require", "React", ...blockedGlobals, code)
        fn(exports, module, require, React, ...blockedValues)
      }),
    )
  } catch (err: any) {
    console.error("Adapter evaluation failed", err)
    throw new Error(`Failed to evaluate adapter: ${err.message}`)
  }

  const moduleExports = (module.exports as Record<string, any> | undefined) || exports

  // Support both named export `adapter` and default export
  if (moduleExports.adapter) return moduleExports.adapter
  if (moduleExports.default) return moduleExports.default

  // If no explicit adapter object, maybe the file exports parts directly
  return {
    components: moduleExports.components,
    scope: moduleExports.scope,
    allowImports: moduleExports.allowImports,
  }
}
