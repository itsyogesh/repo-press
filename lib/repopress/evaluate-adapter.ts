import React from "react"
import * as jsxRuntime from "react/jsx-runtime"

export interface RepoPressPreviewAdapter {
  components?: Record<string, React.ComponentType<any>>
  scope?: Record<string, unknown>
  allowImports?: Record<string, Record<string, unknown>>
  resolveAssetUrl?: (input: string, ctx: { owner: string; repo: string; branch: string; filePath: string }) => string
  onPreviewError?: (error: Error, ctx: { filePath: string }) => React.ReactNode
}

export function evaluateAdapter(code: string): RepoPressPreviewAdapter {
  const exports: Record<string, any> = {}
  const module = { exports }
  const require = (name: string) => {
    if (name === "react") return React
    if (name === "react/jsx-runtime") return jsxRuntime

    // Provide shims for standard RepoPress paths used in default adapters
    if (name === "@/components/docs/doc-media" || name === "@components/docs/doc-media") {
      return {
        DocsImage: (props: any) => null,
        DocsVideo: (props: any) => null,
        Callout: (props: any) => null,
      }
    }

    if (name === "@/lib/constants/docs" || name === "@lib/constants/docs") {
      return {
        DOCS_SETUP_MEDIA: {},
      }
    }

    throw new Error(`Module ${name} is not available in the sandbox.`)
  }

  const fn = new Function("exports", "module", "require", "React", code)

  try {
    fn(exports, module, require, React)
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
