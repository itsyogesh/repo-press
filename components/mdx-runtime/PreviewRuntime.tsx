"use client"

import { AlertCircle, Info, Settings } from "lucide-react"
import React, { useEffect, useMemo, useRef, useState } from "react"
import type { RepoPressPreviewAdapter } from "@/lib/repopress/evaluate-adapter"
import { cn } from "@/lib/utils"
import { compileMdx } from "./compileMdx"
import { ErrorBoundary } from "./ErrorBoundary"
import { evaluateMdx } from "./evaluateMdx"
import { FALLBACK_DOCS_SETUP_MEDIA, FALLBACK_FIXIE_IPS, FALLBACK_NAMECHEAP_URLS } from "./fallback-data"

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

function isRenderableComponent(value: unknown): value is React.ElementType {
  if (typeof value === "function" || typeof value === "string") return true
  if (!value || typeof value !== "object") return false
  return "$$typeof" in (value as Record<string, unknown>)
}

function resolveAssetPropValue(value: unknown, resolveAssetUrl?: (path: string) => string) {
  if (!resolveAssetUrl || typeof value !== "string" || !value.trim()) return value
  return resolveAssetUrl(value)
}

function withResolvedMediaProps(props: any, resolveAssetUrl?: (path: string) => string) {
  if (!props || !resolveAssetUrl) return props

  let nextProps = props
  const resolvedSrc = resolveAssetPropValue(props.src, resolveAssetUrl)
  if (resolvedSrc !== props.src) {
    nextProps = { ...nextProps, src: resolvedSrc }
  }

  const resolvedPoster = resolveAssetPropValue(props.poster, resolveAssetUrl)
  if (resolvedPoster !== props.poster) {
    nextProps = { ...nextProps, poster: resolvedPoster }
  }

  return nextProps
}

function withAssetResolver(component: React.ElementType, resolveAssetUrl?: (path: string) => string) {
  return function AssetResolvedComponent(props: any) {
    const resolvedProps = withResolvedMediaProps(props, resolveAssetUrl)

    if (!resolveAssetUrl || typeof resolvedProps?.resolveAssetUrl === "function") {
      return React.createElement(component, resolvedProps)
    }

    return React.createElement(component, {
      ...resolvedProps,
      resolveAssetUrl: (input: string) => resolveAssetUrl(input),
    })
  }
}

function PreviewSkeleton() {
  return (
    <div className="space-y-8 animate-pulse font-sans max-w-2xl mx-auto py-8 px-4 text-left">
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
  frontmatter,
  adapter,
  externalDiagnostics = [],
  resolveAssetUrl,
  onStatusChange,
  onWarningsChange,
}: {
  source: string
  frontmatter?: Record<string, unknown>
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
    return Array.from(new Set([...externalDiagnostics, ...warnings])).sort()
  }, [externalDiagnostics, warnings])

  // Sync state to parent
  const lastWarningsRef = useRef<string>("")
  useEffect(() => {
    const warningsHash = JSON.stringify(allWarnings)
    if (warningsHash !== lastWarningsRef.current) {
      onWarningsChange?.(allWarnings)
      lastWarningsRef.current = warningsHash
    }
  }, [allWarnings, onWarningsChange])

  useEffect(() => {
    onStatusChange?.(isCompiling)
  }, [isCompiling, onStatusChange])

  useEffect(() => {
    let active = true
    const timeout = setTimeout(async () => {
      setIsCompiling(true)
      setWarnings([])
      try {
        // Base set of allowed imports that are always available in RepoPress
        const allowedConfig: Record<string, string[]> = {
          "@/components/docs/doc-media": ["DocsVideo", "DocsImage", "Callout"],
          "@/components/docs/copy-ips-button": ["CopyIpsButton"],
          "@/lib/constants": ["FIXIE_IPS", "NAMECHEAP_URLS"],
          "@/lib/constants/docs": ["DOCS_SETUP_MEDIA"],
          react: ["useState", "useEffect", "useMemo", "useCallback"],
          "lucide-react": ["Info", "AlertTriangle", "CheckCircle", "XCircle", "ChevronRight", "ChevronDown"],
          "@/components/ui/8bit/button": ["Button"],
          "@/components/ui/8bit/badge": ["Badge"],
          "@/components/ui/8bit/card": ["Card"],
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
            <div className="my-4 flex gap-3 rounded-lg border border-studio-accent/20 bg-studio-accent-muted/60 p-4 text-left text-sm text-foreground shadow-sm font-sans">
              <div className="mt-0.5">
                <Info className="h-4 w-4 text-studio-accent" />
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
            <div className="inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-semibold transition-colors focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2 border-transparent bg-secondary text-secondary-foreground hover:bg-secondary/80 mx-1 font-sans">
              {props.children}
            </div>
          ),
          Button: (props) => (
            <button
              type="button"
              className="inline-flex items-center justify-center rounded-md text-sm font-medium ring-offset-background transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50 bg-secondary text-secondary-foreground hover:bg-secondary/80 h-9 px-3 mx-1 font-sans"
            >
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
              <div className="my-6 relative aspect-video overflow-hidden rounded-xl border bg-foreground text-background flex items-center justify-center text-left font-sans shadow-lg">
                {resolvedSrc ? (
                  <iframe
                    src={resolvedSrc}
                    title={props.title || "Documentation Video"}
                    className="w-full h-full border-0"
                    allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
                    allowFullScreen
                  />
                ) : (
                  <div className="flex flex-col items-center gap-2 text-background/60">
                    <div className="size-12 rounded-full border-2 border-background/20 bg-background/5 flex items-center justify-center">
                      <div className="ml-1 size-0 border-t-[8px] border-t-transparent border-l-[12px] border-l-background/70 border-b-[8px] border-b-transparent" />
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
          TickPoint: (props) => (
            <div className="my-4 rounded-lg border border-muted/70 bg-muted/20 p-4 text-left font-sans">
              {props.children}
            </div>
          ),
          DynamicImage: (props) => {
            const fallbackImage = typeof frontmatter?.image === "string" ? frontmatter.image : undefined
            const fallbackSlug = typeof frontmatter?.slug === "string" ? frontmatter.slug : undefined

            let src: string | undefined =
              props.src || props.image || props.path || props.url || props.fileName || fallbackImage

            if (src && fallbackSlug && !src.includes("/")) {
              src = `/images/blog/${fallbackSlug}/${src}`
            }

            const resolvedSrc = src && resolveAssetUrl ? resolveAssetUrl(src) : src
            if (!resolvedSrc) {
              return (
                <div className="my-6 rounded-xl border border-dashed border-muted-foreground/30 bg-muted/10 p-6 text-center text-sm text-muted-foreground">
                  DynamicImage: no source
                </div>
              )
            }

            return (
              <img
                src={resolvedSrc}
                alt={props.alt || (typeof frontmatter?.title === "string" ? frontmatter.title : "")}
                className="my-6 rounded-xl border shadow-sm w-full h-auto object-cover"
                loading="lazy"
              />
            )
          },
          img: (props) => {
            const src = props.src && resolveAssetUrl ? resolveAssetUrl(props.src) : props.src
            return <img {...props} src={src} alt={props.alt || ""} />
          },
          video: (props) => {
            const src = props.src && resolveAssetUrl ? resolveAssetUrl(props.src) : props.src
            const poster = props.poster && resolveAssetUrl ? resolveAssetUrl(props.poster) : props.poster
            return <video {...props} src={src} poster={poster} />
          },
          source: (props) => {
            const src = props.src && resolveAssetUrl ? resolveAssetUrl(props.src) : props.src
            return <source {...props} src={src} />
          },
          audio: (props) => {
            const src = props.src && resolveAssetUrl ? resolveAssetUrl(props.src) : props.src
            return <audio {...props} src={src} />
          },
          CopyIpsButton: (_props) => (
            <button
              type="button"
              className="my-2 inline-flex items-center justify-center rounded-md text-sm font-medium ring-offset-background transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50 border border-input bg-background hover:bg-accent hover:text-accent-foreground h-9 px-3 gap-2 font-sans"
            >
              <Info className="h-3.5 w-3.5" />
              Copy IP Addresses
            </button>
          ),
        }

        // Fix #9: Product-specific fallback data moved to fallback-data.ts
        // and provided via imports above (FALLBACK_DOCS_SETUP_MEDIA, etc.)

        const adapterComponents: Record<string, React.ComponentType<any>> = {}
        for (const [name, component] of Object.entries(adapter?.components || {})) {
          if (isRenderableComponent(component)) {
            adapterComponents[name] = withAssetResolver(component, resolveAssetUrl)
          }
        }

        const scopeComponents: Record<string, unknown> = {}
        for (const [name, value] of Object.entries(adapter?.scope || {})) {
          if (/^[A-Z]/.test(name) && isRenderableComponent(value)) {
            scopeComponents[name] = withAssetResolver(value, resolveAssetUrl)
          } else {
            scopeComponents[name] = value
          }
        }

        const importBindings: Record<string, unknown> = {}
        for (const imported of imports || []) {
          const exportMap = adapter?.allowImports?.[imported.source]
          if (!exportMap) continue

          const importedValue = exportMap[imported.imported]
          if (importedValue === undefined) continue

          if (/^[A-Z]/.test(imported.local) && isRenderableComponent(importedValue)) {
            importBindings[imported.local] = withAssetResolver(importedValue, resolveAssetUrl)
          } else {
            importBindings[imported.local] = importedValue
          }
        }

        const componentsContext: Record<string, React.ComponentType<any>> = {
          ...standardComponents,
          ...adapterComponents,
        }

        const missingRef = new Set<string>()
        let warningFlushQueued = false
        const queueWarningFlush = () => {
          if (warningFlushQueued) return
          warningFlushQueued = true
          queueMicrotask(() => {
            warningFlushQueued = false
            if (!active || missingRef.size === 0) return
            setWarnings((prev) =>
              Array.from(
                new Set([
                  ...prev,
                  ...Array.from(missingRef).map((name) => `Component <${name} /> is missing from adapter.`),
                ]),
              ),
            )
          })
        }
        const noteMissing = (name: string) => {
          if (missingRef.has(name)) return
          missingRef.add(name)
          queueWarningFlush()
        }

        const safeComponents: Record<string, React.ComponentType<any>> = new Proxy(componentsContext as any, {
          get(target, prop) {
            if (typeof prop !== "string") return target[prop]
            if (prop === "$$typeof" || prop === "prototype" || prop === "__esModule") return target[prop]
            const isComponent = /^[A-Z]/.test(prop)
            if (!(prop in target) && isComponent) {
              noteMissing(prop)
              return function MissingComponent(props: any) {
                return (
                  <div className="my-4 rounded-lg border border-muted bg-muted/20 p-4 font-sans not-prose text-left shadow-sm text-foreground">
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
          ...componentsContext,
          ...scopeComponents,
          ...importBindings,
          FIXIE_IPS: FALLBACK_FIXIE_IPS,
          NAMECHEAP_URLS: FALLBACK_NAMECHEAP_URLS,
        }

        // Robust DOCS_SETUP_MEDIA fallback
        const fromAdapter = mergedScope.DOCS_SETUP_MEDIA
        if (!fromAdapter || (typeof fromAdapter === "object" && Object.keys(fromAdapter).length === 0)) {
          mergedScope.DOCS_SETUP_MEDIA = FALLBACK_DOCS_SETUP_MEDIA
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
          "FIXIE_IPS",
          "NAMECHEAP_URLS",
          "CopyIpsButton",
        ]

        for (const key of commonKeys) {
          if (!(key in mergedScope)) {
            Object.defineProperty(mergedScope, key, {
              get: () => {
                if (key === "DOCS_SETUP_MEDIA") return FALLBACK_DOCS_SETUP_MEDIA
                if (key === "FIXIE_IPS") return FALLBACK_FIXIE_IPS
                if (key === "NAMECHEAP_URLS") return FALLBACK_NAMECHEAP_URLS
                return safeComponents[key]
              },
              enumerable: true,
              configurable: true,
            })
          }
        }

        const MdxComponent = evaluateMdx(code, mergedScope, (name) => {
          noteMissing(name)
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
  }, [source, frontmatter, adapter, resolveAssetUrl])

  return (
    <>
      {error ? (
        <div className="m-4 rounded-lg border border-destructive/20 bg-destructive/10 p-6 font-sans text-destructive shadow-sm">
          <div className="mb-4 flex items-center gap-2 text-destructive">
            <AlertCircle className="h-5 w-5" />
            <h3 className="font-bold text-lg">MDX Preview Failure</h3>
          </div>
          <div className="mb-4 max-h-[300px] overflow-auto break-all rounded-md bg-destructive px-4 py-4 font-mono text-sm whitespace-pre-wrap text-destructive-foreground shadow-inner">
            {error}
          </div>
          <div className="space-y-3 text-left">
            <h4 className="font-semibold text-sm uppercase tracking-wider text-destructive font-sans">
              Potential Fixes:
            </h4>
            <ul className="text-sm space-y-2 list-disc pl-5 text-destructive/90 font-sans">
              <li>Check for syntax errors in your MDX content.</li>
              <li>Ensure all components used are defined in your mdx-preview.tsx adapter.</li>
              <li>Verify that all imports are allowed in your repopress.config.json.</li>
            </ul>
          </div>
        </div>
      ) : (
        <div className={cn("transition-opacity duration-300 text-left", isCompiling ? "opacity-50" : "opacity-100")}>
          <ErrorBoundary key={hashSource(source)}>
            {RenderedComponent ? <RenderedComponent {...({} as any)} /> : <PreviewSkeleton />}
          </ErrorBoundary>
        </div>
      )}
    </>
  )
}
