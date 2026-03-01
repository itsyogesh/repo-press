"use client"

import React, { useState, useEffect } from "react"
import { compileMdx } from "./compileMdx"
import { evaluateMdx } from "./evaluateMdx"
import { adapter } from "./adapter"
import { ErrorBoundary } from "./ErrorBoundary"

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

export function PreviewRuntime({ source }: { source: string }) {
  const [Component, setComponent] = useState<React.ComponentType<any> | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [isCompiling, setIsCompiling] = useState(false)

  useEffect(() => {
    let active = true
    const timeout = setTimeout(async () => {
      setIsCompiling(true)
      try {
        const allowedConfig: Record<string, string[]> = {}
        for (const [key, val] of Object.entries(adapter.allowImports)) {
          allowedConfig[key] = Object.keys(val as object)
        }

        const { code, error: compileError, imports } = await compileMdx(source, allowedConfig)

        if (!active) return

        if (compileError || !code) {
          setError(compileError || "Unknown compilation error")
          setComponent(null)
          return
        }

        setError(null)

        // The adapter defines components and scope variables
        const mergedScope: Record<string, unknown> = {
          ...adapter.scope,
        }

        // Add components to the scope so they can be referenced directly or passed to MDXContent
        const componentsContext: Record<string, React.ComponentType<any>> = {
          ...adapter.components,
        }

        if (imports) {
          for (const imp of imports) {
            const allowedModule = adapter.allowImports[imp.source as keyof typeof adapter.allowImports]
            if (allowedModule) {
              const val = (allowedModule as any)[imp.imported]
              if (val) {
                mergedScope[imp.local] = val
              }
            }
          }
        }

        // Provide a fallback for missing components natively via MDX components prop
        // We'll just define DocsVideo explicitly for now to prevent the crash,
        // since the proxy approach might fail due to destructuring checks.

        const MdxComponent = evaluateMdx(code, mergedScope)

        // Instead of a Proxy which might fail `in` checks during destructuring,
        // let's create a wrapper that catches missing components if we can,
        // or simply provide the known ones.
        // Actually, we can just use a Proxy but we also need to implement `has` trap for destructuring `in` checks.
        const proxiedComponents = new Proxy(componentsContext, {
          get(target, prop) {
            // MDX sometimes asks for internal symbols, allow them to pass through
            if (typeof prop !== "string") {
              return target[prop as any]
            }

            // If the component genuinely doesn't exist, return a generic placeholder
            if (!(prop in target)) {
              return function MissingComponent(props: any) {
                const propsDisplay = Object.entries(props)
                  .filter(([k]) => k !== "node" && k !== "children")
                  .map(([k, v]) => {
                    if (typeof v === "string" || typeof v === "number" || typeof v === "boolean") {
                      return `${k}=${JSON.stringify(v)}`
                    }
                    return `${k}={...}`
                  })
                  .join(" ")

                return (
                  <div className="my-4 rounded-lg border border-dashed border-red-500/30 bg-red-500/10 p-4">
                    <div className="mb-1 flex items-center gap-2">
                      <span className="rounded bg-red-500/20 px-1.5 py-0.5 font-mono text-xs text-red-600 dark:text-red-400">
                        {"<"}
                        {prop}
                        {propsDisplay ? ` ${propsDisplay}` : ""}
                        {props.children ? ">" : " />"}
                      </span>
                    </div>
                    {props.children && <div className="mt-2 text-sm">{props.children}</div>}
                  </div>
                )
              }
            }
            return target[prop as any]
          },
          has(target, prop) {
            return true
          },
        })

        setComponent(() => (props: any) => <MdxComponent {...props} components={proxiedComponents as any} />)
      } catch (err: any) {
        if (!active) return
        setError(err.message || "Failed to evaluate MDX")
        setComponent(null)
      } finally {
        if (active) {
          setIsCompiling(false)
        }
      }
    }, 300)

    return () => {
      active = false
      clearTimeout(timeout)
    }
  }, [hashSource(source)])

  return (
    <div className="relative w-full h-full min-h-[200px] border rounded-lg bg-card p-4 overflow-auto">
      {isCompiling && (
        <div className="absolute top-2 right-2 flex items-center gap-2 text-xs text-muted-foreground bg-background/80 px-2 py-1 rounded">
          <div className="size-2 rounded-full bg-blue-500 animate-pulse" />
          Compiling...
        </div>
      )}

      {error ? (
        <div className="p-4 bg-red-50 text-red-900 border border-red-200 rounded-md font-mono text-sm break-all whitespace-pre-wrap">
          <div className="font-bold mb-2">Compile Error</div>
          {error}
        </div>
      ) : (
        <ErrorBoundary key={hashSource(source)}>
          {Component ? (
            <Component />
          ) : (
            <div className="text-muted-foreground animate-pulse">Initializing runtime...</div>
          )}
        </ErrorBoundary>
      )}
    </div>
  )
}
