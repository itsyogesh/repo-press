"use client"

import { useState, useEffect, useRef, useMemo } from "react"
import { fetchAdapterSourceAction } from "@/app/dashboard/[owner]/[repo]/adapter-actions"
import { fetchPluginAction } from "@/app/dashboard/[owner]/[repo]/plugin-actions"
import { evaluateAdapter, type RepoPressPreviewAdapter } from "@/lib/repopress/evaluate-adapter"
import { transpileAdapter } from "@/lib/repopress/esbuild-browser"

interface UsePreviewContextOptions {
  owner: string
  repo: string
  branch: string
  adapterPath?: string | null
  enabledPlugins?: string[] | null
  pluginRegistry?: Record<string, string> | null
}

interface UsePreviewContextResult {
  context: RepoPressPreviewAdapter | null
  loading: boolean
  error: string | null
  diagnostics: string[]
}

export function usePreviewContext({
  owner,
  repo,
  branch,
  adapterPath,
  enabledPlugins,
  pluginRegistry,
}: UsePreviewContextOptions): UsePreviewContextResult {
  const [adapter, setAdapter] = useState<RepoPressPreviewAdapter | null>(null)
  const [plugins, setPlugins] = useState<Record<string, RepoPressPreviewAdapter>>({})
  const [loading, setLoading] = useState<boolean>(false)
  const [error, setError] = useState<string | null>(null)
  const [diagnostics, setDiagnostics] = useState<string[]>([])

  const lastAdapterSourceRef = useRef<string | null>(null)

  useEffect(() => {
    let isMounted = true

    async function loadAll() {
      setLoading(true)
      setError(null)
      const newDiagnostics: string[] = []

      try {
        // 1. Load Main Adapter
        let resolvedAdapter = adapter
        if (adapterPath) {
          const result = await fetchAdapterSourceAction(owner, repo, branch, adapterPath)
          if (isMounted) {
            if (result.success && result.source) {
              if (result.source !== lastAdapterSourceRef.current) {
                try {
                  const transpiled = await transpileAdapter(result.source)
                  resolvedAdapter = evaluateAdapter(transpiled)
                  setAdapter(resolvedAdapter)
                  lastAdapterSourceRef.current = result.source
                } catch (e: any) {
                  newDiagnostics.push(`Failed to evaluate adapter at ${adapterPath}: ${e.message}`)
                  setAdapter(null)
                }
              }
            } else if (!result.success) {
              newDiagnostics.push(`Adapter missing or failed at ${adapterPath}: ${result.error}`)
              setAdapter(null)
            }
          }
        } else {
          setAdapter(null)
          lastAdapterSourceRef.current = null
        }

        // 2. Load Plugins
        if (enabledPlugins && pluginRegistry) {
          const pluginTasks = enabledPlugins
            .map((id) => ({ id, path: pluginRegistry[id] }))
            .filter((t) => t.path)
            .map(async ({ id, path }) => {
              try {
                const res = await fetchPluginAction(owner, repo, branch, path!)
                if (res.success && res.source) {
                  const transpiled = await transpileAdapter(res.source)
                  const evaluated = evaluateAdapter(transpiled)
                  return { id, adapter: evaluated }
                } else {
                  return { id, error: res.error || "Unknown error" }
                }
              } catch (e: any) {
                return { id, error: e.message }
              }
            })

          const results = await Promise.all(pluginTasks)
          if (isMounted) {
            const newPlugins: Record<string, RepoPressPreviewAdapter> = {}
            results.forEach((r) => {
              if (r && "adapter" in r && r.adapter) {
                newPlugins[r.id] = r.adapter
              } else if (r && "error" in r) {
                newDiagnostics.push(`Plugin "${r.id}" failed to load: ${r.error}`)
              }
            })
            setPlugins(newPlugins)
          }
        } else {
          setPlugins({})
        }

        if (isMounted) {
          setDiagnostics(newDiagnostics)
        }
      } catch (err: any) {
        if (isMounted) {
          setError(err.message || "Failed to load preview context")
        }
      } finally {
        if (isMounted) {
          setLoading(false)
        }
      }
    }

    loadAll()

    return () => {
      isMounted = false
    }
  }, [owner, repo, branch, adapterPath, JSON.stringify(enabledPlugins), JSON.stringify(pluginRegistry)])

  const mergedContext = useMemo(() => {
    const result: RepoPressPreviewAdapter = {
      components: { ...(adapter?.components || {}) },
      scope: { ...(adapter?.scope || {}) },
      allowImports: { ...(adapter?.allowImports || {}) },
    }

    // Merge plugins
    Object.values(plugins).forEach((p) => {
      if (p.components) {
        result.components = { ...result.components, ...p.components }
      }
      if (p.scope) {
        result.scope = { ...result.scope, ...p.scope }
      }
      if (p.allowImports) {
        // Deep merge allowImports
        for (const [module, exports] of Object.entries(p.allowImports)) {
          result.allowImports![module] = {
            ...(result.allowImports![module] || {}),
            ...(exports as object),
          }
        }
      }
      if (p.resolveAssetUrl) {
        result.resolveAssetUrl = p.resolveAssetUrl // Last one wins for now
      }
    })

    return result
  }, [adapter, plugins])

  return {
    context: mergedContext,
    loading,
    error,
    diagnostics,
  }
}
