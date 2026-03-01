"use client"

import React, { useState, useEffect, useMemo } from "react"
import { compileMdx } from "./compileMdx"
import { evaluateMdx } from "./evaluateMdx"
import { ErrorBoundary } from "./ErrorBoundary"
import { AlertCircle, AlertTriangle, Info, Settings } from "lucide-react"
import { cn } from "@/lib/utils"
import type { RepoPressPreviewAdapter } from "@/lib/repopress/evaluate-adapter"

// Function to generate a simple hash of the source string to debounce/memoize
function hashSource(str: string) {
  let hash = 0
  for (let i = 0; i < str.length; i++) {
    const char = str.charCodeAt(i)
    hash = (hash << 5) - hash + char
    hash &= hash // Convert to 32bit integer
  }
  return hash.toString()
}

function PreviewSkeleton() {
  return (
    <div className="space-y-8 animate-pulse font-sans max-w-2xl mx-auto py-8 px-4">
      <div className="space-y-3">
        <div className="h-10 w-3/4 bg-muted rounded-lg" />
        <div className="h-4 w-1/2 bg-muted rounded-md" />
      </div>

      <div className="space-y-4">
        <div className="h-4 w-full bg-muted rounded-md opacity-70" />
        <div className="h-4 w-full bg-muted rounded-md opacity-70" />
        <div className="h-4 w-5/6 bg-muted rounded-md opacity-70" />
      </div>

      <div className="h-64 w-full bg-muted/50 rounded-xl border border-dashed" />

      <div className="space-y-4">
        <div className="h-4 w-full bg-muted rounded-md opacity-70" />
        <div className="h-4 w-3/4 bg-muted rounded-md opacity-70" />
      </div>
    </div>
  )
}

export function PreviewRuntime({
  source,
  adapter,
  externalDiagnostics = [],
  resolveAssetUrl,
  onStatusChange,
  onWarningsChange,
}: {
  source: string
  adapter?: RepoPressPreviewAdapter
  externalDiagnostics?: string[]
  resolveAssetUrl?: (path: string) => string
  onStatusChange?: (isCompiling: boolean) => void
  onWarningsChange?: (warnings: string[]) => void
}) {
  const [RenderedComponent, setRenderedComponent] = useState<React.ComponentType<any> | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [isCompiling, setIsCompiling] = useState(false)
  const [warnings, setWarnings] = useState<string[]>([])

  const allWarnings = useMemo(() => {
    return Array.from(new Set([...externalDiagnostics, ...warnings]))
  }, [externalDiagnostics, warnings])

  // Sync state to parent
  useEffect(() => {
    onStatusChange?.(isCompiling)
  }, [isCompiling, onStatusChange])

  useEffect(() => {
    onWarningsChange?.(allWarnings)
  }, [allWarnings, onWarningsChange])

  useEffect(() => {
    let active = true
    const timeout = setTimeout(async () => {
      setIsCompiling(true)
      setWarnings([])
      try {
        // Base set of allowed imports that are always available in RepoPress
        const allowedConfig: Record<string, string[]> = {
          "@/components/docs/doc-media": ["DocsVideo", "DocsImage", "Callout"],
          "@/lib/constants/docs": ["DOCS_SETUP_MEDIA"],
          react: ["useState", "useEffect", "useMemo", "useCallback"],
          "lucide-react": ["Info", "AlertTriangle", "CheckCircle", "XCircle", "ChevronRight", "ChevronDown"],
        }

        const allowImports = adapter?.allowImports || {}
        for (const [key, val] of Object.entries(allowImports)) {
          if (!allowedConfig[key]) {
            allowedConfig[key] = Object.keys(val as object)
          } else {
            // Merge keys if already exists
            allowedConfig[key] = Array.from(new Set([...allowedConfig[key], ...Object.keys(val as object)]))
          }
        }

        const { code, error: compileError, imports } = await compileMdx(source, allowedConfig)

        if (!active) return

        if (compileError || !code) {
          setError(compileError || "Unknown compilation error")
          setRenderedComponent(null)
          return
        }

        setError(null)

        const standardComponents: Record<string, React.ComponentType<any>> = {
          Callout: (props) => (
            <div className="my-4 flex gap-3 rounded-lg border border-blue-200 bg-blue-50/50 p-4 text-sm text-blue-900 shadow-sm text-left font-sans">
              <div className="mt-0.5">
                <Info className="h-4 w-4 text-blue-600" />
              </div>
              <div className="flex-1">{props.children}</div>
            </div>
          ),
          Steps: (props) => (
            <div className="space-y-4 my-6 border-l-2 border-muted pl-6 text-left font-sans">{props.children}</div>
          ),
          Step: (props) => (
            <div className="relative text-left font-sans">
              <div className="absolute -left-[33px] top-0 size-4 rounded-full bg-background border-2 border-muted flex items-center justify-center text-[10px] font-bold" />
              {props.children}
            </div>
          ),
          Tabs: (props) => (
            <div className="my-4 border rounded-md p-1 bg-muted/30 text-left font-sans">{props.children}</div>
          ),
          Tab: (props) => (
            <div className="p-4 bg-background rounded border shadow-sm text-left font-sans">{props.children}</div>
          ),
          Badge: (props) => (
            <div className="inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-semibold transition-colors focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2 border-transparent bg-secondary text-secondary-foreground hover:bg-secondary/80 mx-1">
              {props.children}
            </div>
          ),
          Button: (props) => (
            <button className="inline-flex items-center justify-center rounded-md text-sm font-medium ring-offset-background transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50 bg-secondary text-secondary-foreground hover:bg-secondary/80 h-9 px-3 mx-1">
              {props.children}
            </button>
          ),
          Card: (props) => (
            <div className="my-4 p-6 border rounded-xl bg-card shadow-sm text-left font-sans">{props.children}</div>
          ),
          FileTree: (props) => (
            <div className="my-4 p-4 border rounded-md bg-muted/20 font-mono text-xs text-left">{props.children}</div>
          ),
          DocsImage: (props) => {
            const [isLoading, setIsLoading] = React.useState(true)
            const resolvedSrc = props.src && resolveAssetUrl ? resolveAssetUrl(props.src) : props.src
            return (
              <div className="my-6 overflow-hidden rounded-xl border bg-muted/30 flex flex-col group relative text-left font-sans shadow-sm">
                {resolvedSrc ? (
                  <div className="relative">
                    <img
                      src={resolvedSrc}
                      alt={props.alt || ""}
                      className={cn(
                        "w-full h-auto block transition-opacity duration-300",
                        isLoading ? "opacity-0" : "opacity-100",
                      )}
                      onLoad={() => setIsLoading(false)}
                    />
                    {isLoading && (
                      <div className="absolute inset-0 flex items-center justify-center bg-muted/20 animate-pulse">
                        <Info className="h-6 w-6 text-muted-foreground/30" />
                      </div>
                    )}
                  </div>
                ) : (
                  <div className="aspect-video flex items-center justify-center">
                    <div className="text-muted-foreground flex flex-col items-center gap-2">
                      <Info className="h-8 w-8 opacity-20" />
                      <span className="text-[10px] uppercase font-bold tracking-widest opacity-50">No Source</span>
                    </div>
                  </div>
                )}
                {props.caption && (
                  <div className="p-3 bg-muted/20 border-t text-[11px] text-muted-foreground text-center italic">
                    {props.caption}
                  </div>
                )}
              </div>
            )
          },
          DocsVideo: (props) => {
            let resolvedSrc = props.src && resolveAssetUrl ? resolveAssetUrl(props.src) : props.src
            if (resolvedSrc?.includes("youtu.be/")) {
              const id = resolvedSrc.split("youtu.be/")[1]?.split("?")[0]
              if (id) resolvedSrc = `https://www.youtube.com/embed/${id}`
            }
            return (
              <div className="my-6 overflow-hidden rounded-xl border bg-slate-950 aspect-video flex items-center justify-center relative text-left font-sans shadow-lg">
                {resolvedSrc ? (
                  <iframe
                    src={resolvedSrc}
                    title={props.title || "Documentation Video"}
                    className="w-full h-full border-0"
                    allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
                    allowFullScreen
                  />
                ) : (
                  <div className="text-white/50 flex flex-col items-center gap-2">
                    <div className="size-12 rounded-full border-2 border-white/20 flex items-center justify-center bg-white/5">
                      <div className="size-0 border-t-[8px] border-t-transparent border-l-[12px] border-l-white/60 border-b-[8px] border-b-transparent ml-1" />
                    </div>
                    <span className="text-[10px] uppercase font-bold tracking-widest opacity-50">
                      Video: {props.title || "No Source"}
                    </span>
                  </div>
                )}
              </div>
            )
          },
          Image: (props) => {
            const src = props.src && resolveAssetUrl ? resolveAssetUrl(props.src) : props.src
            return <img {...props} src={src} className="rounded-lg border shadow-sm max-w-full" alt={props.alt || ""} />
          },
          Video: (props) => {
            const src = props.src && resolveAssetUrl ? resolveAssetUrl(props.src) : props.src
            return <video {...props} src={src} className="rounded-lg border shadow-sm max-w-full" controls />
          },
        }

        const REAL_DOCS_SETUP_MEDIA: any = {
          cloudflare: {
            videoUrl: "https://youtu.be/WwCFLfigqpg?si=T90pqRb-zkW4fMuz",
            images: {
              "step-2-api-tokens-nav":
                "https://7azoq5njibf6vkft.public.blob.vercel-storage.com/docs/setup/cloudflare/step-2-api-tokens-nav.webp",
            },
          },
          porkbun: {
            videoUrl: "https://youtu.be/jLVBwxk4V6w?si=eZPfJwhKTiqwyTQI",
            images: {
              "step-1-api-access-nav":
                "https://7azoq5njibf6vkft.public.blob.vercel-storage.com/docs/setup/porkbun/step-1-api-access-nav.webp",
            },
          },
        }

        const componentsContext: Record<string, React.ComponentType<any>> = {
          ...standardComponents,
          ...(adapter?.components || {}),
        }

        const missingRef = new Set<string>()

        const safeComponents: Record<string, React.ComponentType<any>> = new Proxy(componentsContext as any, {
          get(target, prop) {
            if (typeof prop !== "string") return target[prop]
            if (prop === "$$typeof" || prop === "prototype" || prop === "__esModule") return target[prop]
            const isComponent = /^[A-Z]/.test(prop)
            if (!(prop in target) && isComponent) {
              if (!missingRef.has(prop)) {
                missingRef.add(prop)
                setWarnings((prev) => Array.from(new Set([...prev, `Component <${prop} /> is missing from adapter.`])))
              }
              return function MissingComponent(props: any) {
                return (
                  <div className="my-4 rounded-lg border border-muted bg-muted/20 p-4 font-sans not-prose text-left shadow-sm">
                    <div className="mb-2 flex items-center gap-2 text-muted-foreground">
                      <Settings className="h-3.5 w-3.5" />
                      <span className="font-mono text-[10px] font-bold uppercase tracking-widest opacity-70">
                        Dev Placeholder
                      </span>
                    </div>
                    <div className="mb-1">
                      <span className="rounded bg-muted-foreground/10 px-2 py-1 font-mono text-xs text-foreground">
                        {"<"}
                        {prop}
                        {Object.keys(props).filter((k) => k !== "children" && k !== "node").length > 0 ? " ..." : ""}
                        {props.children ? ">" : " />"}
                      </span>
                    </div>
                    {props.children && (
                      <div className="mt-3 pt-3 border-t border-muted text-sm text-foreground/80">{props.children}</div>
                    )}
                  </div>
                )
              }
            }
            return target[prop]
          },
          has(target, prop) {
            if (typeof prop === "string" && /^[A-Z]/.test(prop)) return true
            return prop in target
          },
          getOwnPropertyDescriptor(target, prop): PropertyDescriptor | undefined {
            if (typeof prop === "string" && /^[A-Z]/.test(prop)) {
              return {
                enumerable: true,
                configurable: true,
                writable: false,
                value: safeComponents[prop as string],
              }
            }
            return Object.getOwnPropertyDescriptor(target, prop)
          },
        }) as any

        const mergedScope: Record<string, any> = {
          ...(adapter?.scope || {}),
          ...componentsContext,
        }
        const commonKeys = [
          "DocsVideo",
          "DocsImage",
          "Callout",
          "Image",
          "Video",
          "Button",
          "Card",
          "Badge",
          "Steps",
          "Step",
          "FileTree",
          "Tab",
          "Tabs",
          "DOCS_SETUP_MEDIA",
        ]
        for (const key of commonKeys) {
          if (!(key in mergedScope)) {
            Object.defineProperty(mergedScope, key, {
              get: () => {
                if (key === "DOCS_SETUP_MEDIA")
                  return (adapter?.scope as any)?.DOCS_SETUP_MEDIA || REAL_DOCS_SETUP_MEDIA
                return safeComponents[key]
              },
              enumerable: true,
              configurable: true,
            })
          }
        }

        const MdxComponent = evaluateMdx(code, mergedScope, (name) => {
          if (!missingRef.has(name)) {
            missingRef.add(name)
            setWarnings((prev) => Array.from(new Set([...prev, `Component <${name} /> is missing from adapter.`])))
          }
        })
        setRenderedComponent(() => (props: any) => <MdxComponent {...props} components={safeComponents as any} />)
      } catch (err: any) {
        if (!active) return
        setError(err.message || "Failed to evaluate MDX")
        setRenderedComponent(null)
      } finally {
        if (active) setIsCompiling(false)
      }
    }, 300)
    return () => {
      active = false
      clearTimeout(timeout)
    }
  }, [hashSource(source), adapter, resolveAssetUrl, onStatusChange, onWarningsChange])

  return (
    <>
      {error ? (
        <div className="p-6 bg-red-50/50 text-red-900 border border-red-200 rounded-lg font-sans shadow-sm m-4">
          <div className="flex items-center gap-2 mb-4 text-red-700">
            <AlertCircle className="h-5 w-5" />
            <h3 className="font-bold text-lg">MDX Preview Failure</h3>
          </div>
          <div className="bg-red-900 text-red-50 p-4 rounded-md font-mono text-sm mb-4 break-all whitespace-pre-wrap shadow-inner overflow-auto max-h-[300px]">
            {error}
          </div>
          <div className="space-y-3 text-left">
            <h4 className="font-semibold text-sm text-red-800 uppercase tracking-wider font-sans">Potential Fixes:</h4>
            <ul className="text-sm space-y-2 list-disc pl-5 text-red-700 font-sans">
              <li>Check for syntax errors in your MDX content.</li>
              <li>Ensure all components used are defined in your mdx-preview.tsx adapter.</li>
              <li>Verify that all imports are allowed in your repopress.config.json.</li>
            </ul>
          </div>
        </div>
      ) : (
        <div className={cn("transition-opacity duration-300", isCompiling ? "opacity-50" : "opacity-100")}>
          <ErrorBoundary key={hashSource(source)}>
            {RenderedComponent ? <RenderedComponent {...({} as any)} /> : <PreviewSkeleton />}
          </ErrorBoundary>
        </div>
      )}
    </>
  )
}
