"use client"

import React, { useState, useEffect, useMemo, useRef } from "react"
import { compileMdx } from "./compileMdx"
import { evaluateMdx } from "./evaluateMdx"
import { ErrorBoundary } from "./ErrorBoundary"
import { AlertCircle, AlertTriangle, Info, Settings, CheckCircle2, Loader2 } from "lucide-react"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
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
          CopyIpsButton: (props) => (
            <button
              type="button"
              className="my-2 inline-flex items-center justify-center rounded-md text-sm font-medium ring-offset-background transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50 border border-input bg-background hover:bg-accent hover:text-accent-foreground h-9 px-3 gap-2 font-sans"
            >
              <Info className="h-3.5 w-3.5" />
              Copy IP Addresses
            </button>
          ),
        }

        const DOCS_BLOB_BASE = "https://7azoq5njibf6vkft.public.blob.vercel-storage.com"
        const REAL_DOCS_SETUP_MEDIA: any = {
          cloudflare: {
            videoUrl: "https://youtu.be/WwCFLfigqpg?si=T90pqRb-zkW4fMuz",
            images: {
              "step-2-api-tokens-nav": `${DOCS_BLOB_BASE}/docs/setup/cloudflare/step-2-api-tokens-nav.webp`,
              "step-2-create-custom-token": `${DOCS_BLOB_BASE}/docs/setup/cloudflare/step-2-create-custom-token.webp`,
              "step-2-create-test-custom-token": `${DOCS_BLOB_BASE}/docs/setup/cloudflare/step-2-create-test-custom-token.webp`,
              "step-2-token-display": `${DOCS_BLOB_BASE}/docs/setup/cloudflare/step-2-token-display.webp`,
              "step-2-token-permissions": `${DOCS_BLOB_BASE}/docs/setup/cloudflare/step-2-token-permissions.webp`,
              "step-3-integration-form": `${DOCS_BLOB_BASE}/docs/setup/cloudflare/step-3-integration-form.webp`,
            },
          },
          gandi: {
            images: {
              "step-1-create-token": `${DOCS_BLOB_BASE}/docs/setup/gandi/step-1-create-token.webp`,
              "step-1-pat-section": `${DOCS_BLOB_BASE}/docs/setup/gandi/step-1-pat-section.webp`,
              "step-1-user-settings": `${DOCS_BLOB_BASE}/docs/setup/gandi/step-1-user-settings.webp`,
              "step-2-token-form": `${DOCS_BLOB_BASE}/docs/setup/gandi/step-2-token-form.webp`,
              "step-3-permissions": `${DOCS_BLOB_BASE}/docs/setup/gandi/step-3-permissions.webp`,
              "step-4-create-token": `${DOCS_BLOB_BASE}/docs/setup/gandi/step-4-create-token.webp`,
              "step-4-token-display": `${DOCS_BLOB_BASE}/docs/setup/gandi/step-4-token-display.webp`,
              "step-5-integration-form": `${DOCS_BLOB_BASE}/docs/setup/gandi/step-5-integration-form.webp`,
            },
          },
          godaddy: {
            videoUrl: "https://youtu.be/3WCzfVL-bRk?si=ncMNDQSc7RiedP1d",
            images: {
              "step-2-create-api-key": `${DOCS_BLOB_BASE}/docs/setup/godaddy/step-2-create-api-key.webp`,
              "step-3-environment-selection": `${DOCS_BLOB_BASE}/docs/setup/godaddy/step-3-environment-selection.webp`,
              "step-4-api-key-secret": `${DOCS_BLOB_BASE}/docs/setup/godaddy/step-4-api-key-secret.webp`,
              "step-6-integration-form": `${DOCS_BLOB_BASE}/docs/setup/godaddy/step-6-integration-form.webp`,
            },
          },
          namecheap: {
            videoUrl: "https://youtu.be/snbECrsUdp4?si=pAxyo0mEzTYBxmQR",
            images: {
              "step-1-api-access-nav": `${DOCS_BLOB_BASE}/docs/setup/namecheap/step-1-api-access-nav.webp`,
              "step-3-whitelist-ips": `${DOCS_BLOB_BASE}/docs/setup/namecheap/step-3-whitelist-ips.webp`,
              "step-5-integration-form": `${DOCS_BLOB_BASE}/docs/setup/namecheap/step-5-integration-form.webp`,
            },
          },
          namecom: {
            images: {
              "step-1-generate-token": `${DOCS_BLOB_BASE}/docs/setup/namecom/step-1-generate-token.webp`,
              "step-2-username-token": `${DOCS_BLOB_BASE}/docs/setup/namecom/step-2-username-token.webp`,
              "step-3-integration-form": `${DOCS_BLOB_BASE}/docs/setup/namecom/step-3-integration-form.webp`,
            },
          },
          porkbun: {
            videoUrl: "https://youtu.be/jLVBwxk4V6w?si=eZPfJwhKTiqwyTQI",
            images: {
              "step-1-api-access-nav": `${DOCS_BLOB_BASE}/docs/setup/porkbun/step-1-api-access-nav.webp`,
              "step-1-create-api-key": `${DOCS_BLOB_BASE}/docs/setup/porkbun/step-1-create-api-key.webp`,
              "step-1-api-credentials": `${DOCS_BLOB_BASE}/docs/setup/porkbun/step-1-api-credentials.webp`,
              "step-2-integration-form": `${DOCS_BLOB_BASE}/docs/setup/porkbun/step-2-integration-form.webp`,
            },
          },
          hostinger: {
            images: {
              "step-1-profile-nav": `${DOCS_BLOB_BASE}/docs/setup/hostinger/step-1-profile-nav.webp`,
              "step-2-api-access": `${DOCS_BLOB_BASE}/docs/setup/hostinger/step-2-api-access.webp`,
              "step-3-create-token": `${DOCS_BLOB_BASE}/docs/setup/hostinger/step-3-create-token.webp`,
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
          ...(adapter?.scope || {}),
          FIXIE_IPS: {
            PRIMARY: "52.5.155.132",
            SECONDARY: "52.87.82.133",
          },
          NAMECHEAP_URLS: {
            API_SETTINGS: "https://ap.www.namecheap.com/settings/tools/",
            API_WHITELIST: "https://ap.www.namecheap.com/settings/tools/apiaccess/",
          },
        }

        // Robust DOCS_SETUP_MEDIA fallback
        const fromAdapter = mergedScope["DOCS_SETUP_MEDIA"]
        if (!fromAdapter || (typeof fromAdapter === "object" && Object.keys(fromAdapter).length === 0)) {
          mergedScope["DOCS_SETUP_MEDIA"] = REAL_DOCS_SETUP_MEDIA
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
                if (key === "DOCS_SETUP_MEDIA") return REAL_DOCS_SETUP_MEDIA
                if (key === "FIXIE_IPS") return { PRIMARY: "52.5.155.132", SECONDARY: "52.87.82.133" }
                if (key === "NAMECHEAP_URLS")
                  return {
                    API_SETTINGS: "https://ap.www.namecheap.com/settings/tools/",
                    API_WHITELIST: "https://ap.www.namecheap.com/settings/tools/apiaccess/",
                  }
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
      <div className="absolute top-2 right-2 flex items-center gap-2 z-10 font-sans">
        <Popover>
          <PopoverTrigger asChild>
            <Button
              variant="outline"
              size="sm"
              className={cn(
                "h-7 gap-1.5 px-2 rounded-full text-[10px] uppercase tracking-wider font-bold shadow-sm transition-colors",
                isCompiling
                  ? "border-blue-200 bg-blue-50 text-blue-700 hover:bg-blue-100"
                  : allWarnings.length > 0
                    ? "border-amber-200 bg-amber-50 text-amber-700 hover:bg-amber-100"
                    : "border-green-200 bg-green-50 text-green-700 hover:bg-green-100",
              )}
            >
              {isCompiling ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
              ) : allWarnings.length > 0 ? (
                <AlertTriangle className="h-3.5 w-3.5" />
              ) : (
                <CheckCircle2 className="h-3.5 w-3.5" />
              )}
              {isCompiling ? "Compiling" : allWarnings.length > 0 ? `${allWarnings.length} Issues` : "All Systems Go"}
            </Button>
          </PopoverTrigger>
          <PopoverContent className="w-80 p-0" align="end">
            <div
              className={cn(
                "border-b p-3 flex items-center justify-between",
                allWarnings.length > 0 ? "bg-amber-50 border-amber-100" : "bg-green-50 border-green-100",
              )}
            >
              <div
                className={cn(
                  "flex items-center gap-2 font-bold text-xs uppercase tracking-wider",
                  allWarnings.length > 0 ? "text-amber-800" : "text-green-800",
                )}
              >
                {allWarnings.length > 0 ? <AlertTriangle className="h-4 w-4" /> : <CheckCircle2 className="h-4 w-4" />}
                MDX Diagnostics
              </div>
              <Badge
                variant="outline"
                className={cn(
                  "h-5 px-1.5 text-[10px]",
                  allWarnings.length > 0
                    ? "bg-amber-100 border-amber-200 text-amber-800"
                    : "bg-green-100 border-green-200 text-green-800",
                )}
              >
                {allWarnings.length}
              </Badge>
            </div>
            <div className="p-2 max-h-[300px] overflow-auto">
              {allWarnings.length > 0 ? (
                <ul className="space-y-1">
                  {allWarnings.map((w) => (
                    <li
                      key={w}
                      className="text-xs p-2 rounded bg-muted/50 border border-transparent hover:border-amber-200 hover:bg-amber-50/50 transition-colors flex gap-2 text-left"
                    >
                      <div className="mt-0.5 size-1.5 rounded-full bg-amber-400 shrink-0" />
                      {w}
                    </li>
                  ))}
                </ul>
              ) : (
                <div className="p-4 text-center space-y-2">
                  <div className="text-2xl">🎉</div>
                  <p className="text-xs font-medium text-muted-foreground">
                    Everything looks perfect! No issues detected in your MDX or adapter.
                  </p>
                </div>
              )}
            </div>
            <div className="p-3 bg-muted/30 border-t text-[10px] text-muted-foreground italic text-left">
              {allWarnings.length > 0
                ? "Issues can usually be resolved in your repopress.config.json or mdx-preview.tsx."
                : "Your repository is fully optimized for RepoPress MDX editing."}
            </div>
          </PopoverContent>
        </Popover>
      </div>

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
        <div className={cn("transition-opacity duration-300 text-left", isCompiling ? "opacity-50" : "opacity-100")}>
          <ErrorBoundary key={hashSource(source)}>
            {RenderedComponent ? <RenderedComponent {...({} as any)} /> : <PreviewSkeleton />}
          </ErrorBoundary>
        </div>
      )}
    </>
  )
}
