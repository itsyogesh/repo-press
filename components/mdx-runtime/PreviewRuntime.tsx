"use client"

import { AlertCircle, Info, Settings } from "lucide-react"
import React, { useEffect, useMemo, useRef, useState } from "react"
import type { RepoPressPreviewAdapter } from "@/lib/repopress/evaluate-adapter"

import { cn } from "@/lib/utils"
import { compileMdx } from "./compileMdx"
import { ErrorBoundary } from "./ErrorBoundary"
import { evaluateMdx } from "./evaluateMdx"

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

      <div className="h-64 w-full bg-muted/50 rounded-lg border border-dashed" />

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

  // Stabilize deps: use content-based keys so the compilation effect only
  // re-fires when the actual content changes, not on referential inequality.
  // Note: frontmatter is intentionally NOT a compile input — it is not read
  // during compilation, so changes to it must not trigger a recompile.
  const adapterRef = useRef(adapter)
  adapterRef.current = adapter

  const adapterKey = useMemo(() => {
    if (!adapter) return "null"
    return JSON.stringify({
      c: Object.keys(adapter.components || {}).sort(),
      s: Object.keys(adapter.scope || {}).sort(),
      i: Object.keys(adapter.allowImports || {}).sort(),
    })
  }, [adapter])
  const compileInputsKey = adapterKey

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
    void compileInputsKey
    // Read latest values from refs (deps use content-based keys for stability)
    const currentAdapter = adapterRef.current

    let active = true
    const timeout = setTimeout(async () => {
      setIsCompiling(true)
      setWarnings([])
      try {
        const allowedConfig = Object.fromEntries(
          Object.entries(currentAdapter?.allowImports || {}).map(([key, val]) => [key, Object.keys(val as object)]),
        ) as Record<string, string[]>

        const { code, error: compileError, imports, diagnostics } = await compileMdx(source, allowedConfig)

        if (!active) return
        if (diagnostics?.length) {
          setWarnings((prev) => Array.from(new Set([...prev, ...diagnostics])))
        }

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
            <div className="my-4 p-6 border rounded-lg bg-card text-left font-sans">{props.children}</div>
          ),
          FileTree: (props) => (
            <div className="my-4 p-4 border rounded-md bg-muted/20 font-mono text-xs text-left">{props.children}</div>
          ),
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
        }

        const adapterComponents: Record<string, React.ComponentType<any>> = {}
        for (const [name, component] of Object.entries(currentAdapter?.components || {})) {
          if (isRenderableComponent(component)) {
            adapterComponents[name] = withAssetResolver(component, resolveAssetUrl)
          }
        }

        const scopeComponents: Record<string, unknown> = {}
        for (const [name, value] of Object.entries(currentAdapter?.scope || {})) {
          if (/^[A-Z]/.test(name) && isRenderableComponent(value)) {
            scopeComponents[name] = withAssetResolver(value, resolveAssetUrl)
          } else {
            scopeComponents[name] = value
          }
        }

        const importBindings: Record<string, unknown> = {}
        for (const imported of imports || []) {
          const exportMap = currentAdapter?.allowImports?.[imported.source]
          if (!exportMap) continue

          if (imported.imported === "*") {
            // Namespace import: bind a shallow copy of the whole allowed export map.
            importBindings[imported.local] = { ...exportMap }
            continue
          }

          const importedValue = exportMap[imported.imported]
          if (importedValue === undefined) continue

          if (/^[A-Z]/.test(imported.local) && isRenderableComponent(importedValue)) {
            importBindings[imported.local] = withAssetResolver(importedValue, resolveAssetUrl)
          } else {
            importBindings[imported.local] = importedValue
          }
        }

        // Studio preview keeps its own Callout fallback because some native
        // adapters depend on site-only CSS variables not present in Studio.
        const STUDIO_PREFERRED_FALLBACKS = new Set(["Callout"])
        const componentsContext: Record<string, React.ComponentType<any>> = {
          ...standardComponents,
          ...Object.fromEntries(
            Object.entries(adapterComponents).filter(([name]) => !STUDIO_PREFERRED_FALLBACKS.has(name)),
          ),
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
      // Reset compiling state on cleanup to prevent stuck "Compiling" indicator
      // when deps change during an in-flight server action (compileMdx).
      // The next effect invocation will set it back to true if needed.
      setIsCompiling(false)
    }
    // compileInputsKey is a stable content-derived trigger; actual values are read from refs
    // to avoid re-compilation on every referential change from parent re-renders.
  }, [source, compileInputsKey, resolveAssetUrl])

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
              <li>Ensure all components used are exposed by the native MDX runtime or optional RepoPress override.</li>
              <li>Verify that runtime and content imports are supported by RepoPress shims.</li>
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
