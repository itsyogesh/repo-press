"use client"

import { useEffect, useMemo, useRef, useState } from "react"
import { fetchAdapterSourceAction } from "@/app/dashboard/[owner]/[repo]/adapter-actions"
import { fetchPluginAction } from "@/app/dashboard/[owner]/[repo]/plugin-actions"
import {
  buildAdapterCacheKey,
  getCachedAdapter,
  pruneExpiredAdapterCache,
  setCachedAdapter,
} from "@/lib/repopress/adapter-cache"
import { transpileAdapter } from "@/lib/repopress/esbuild-browser"
import { evaluateAdapter, type RepoPressPreviewAdapter } from "@/lib/repopress/evaluate-adapter"
import { standardComponents } from "@/lib/repopress/standard-library"

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

type AdapterSourceActionResult = Awaited<ReturnType<typeof fetchAdapterSourceAction>>
type PluginSourceActionResult = Awaited<ReturnType<typeof fetchPluginAction>>

const inFlightAdapterRequests = new Map<string, Promise<AdapterSourceActionResult>>()
const inFlightPluginRequests = new Map<string, Promise<PluginSourceActionResult>>()

function dedupedAdapterRequest(owner: string, repo: string, branch: string, adapterPath: string) {
  const key = `${owner}/${repo}@${branch}:${adapterPath}`
  const existing = inFlightAdapterRequests.get(key)
  if (existing) {
    return existing
  }

  const request = fetchAdapterSourceAction(owner, repo, branch, adapterPath).finally(() => {
    inFlightAdapterRequests.delete(key)
  })
  inFlightAdapterRequests.set(key, request)
  return request
}

function dedupedPluginRequest(owner: string, repo: string, branch: string, pluginPath: string) {
  const key = `${owner}/${repo}@${branch}:${pluginPath}`
  const existing = inFlightPluginRequests.get(key)
  if (existing) {
    return existing
  }

  const request = fetchPluginAction(owner, repo, branch, pluginPath).finally(() => {
    inFlightPluginRequests.delete(key)
  })
  inFlightPluginRequests.set(key, request)
  return request
}

function hashSource(source: string) {
  let hash = 0
  for (let i = 0; i < source.length; i += 1) {
    hash = (hash << 5) - hash + source.charCodeAt(i)
    hash |= 0
  }
  return String(hash >>> 0)
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
  const lastAdapterShaRef = useRef<string | null>(null)
  const didPruneCacheRef = useRef(false)

  useEffect(() => {
    let isMounted = true

    async function loadAll() {
      setLoading(true)
      setError(null)
      const newDiagnostics: string[] = []

      try {
        if (!didPruneCacheRef.current) {
          didPruneCacheRef.current = true
          await pruneExpiredAdapterCache()
        }

        // 1. Load Main Adapter
        if (adapterPath) {
          const result = await dedupedAdapterRequest(owner, repo, branch, adapterPath)
          if (isMounted) {
            if (result.success && result.source) {
              if (result.rateLimited) {
                newDiagnostics.push(
                  `Adapter request for ${adapterPath} hit GitHub rate limits and retried ${result.retryCount} time(s).`,
                )
              }
              const sourceSha = result.sha || hashSource(result.source)
              const cacheKey = buildAdapterCacheKey(owner, repo, branch, adapterPath, sourceSha)
              const sourceChanged =
                result.source !== lastAdapterSourceRef.current || sourceSha !== lastAdapterShaRef.current

              if (sourceChanged) {
                try {
                  let transpiled = await getCachedAdapter(cacheKey, sourceSha)
                  if (!transpiled) {
                    transpiled = await transpileAdapter(result.source)
                    await setCachedAdapter({
                      key: cacheKey,
                      sourceSha,
                      transpiledCode: transpiled,
                    })
                  }
                  setAdapter(evaluateAdapter(transpiled))
                  lastAdapterSourceRef.current = result.source
                  lastAdapterShaRef.current = sourceSha
                } catch (e: any) {
                  newDiagnostics.push(`Failed to evaluate adapter at ${adapterPath}: ${e.message}`)
                  setAdapter(null)
                }
              }
            } else if (!result.success) {
              newDiagnostics.push(`Adapter missing or failed at ${adapterPath}: ${result.error}`)
              setAdapter(null)
              lastAdapterShaRef.current = null
            }
          }
        } else {
          setAdapter(null)
          lastAdapterSourceRef.current = null
          lastAdapterShaRef.current = null
        }

        // 2. Load Plugins
        if (enabledPlugins && pluginRegistry) {
          const pluginTasks = enabledPlugins
            .map((id) => ({ id, path: pluginRegistry[id] }))
            .filter((t) => t.path)
            .map(async ({ id, path }) => {
              try {
                const res = await dedupedPluginRequest(owner, repo, branch, path!)
                if (res.success && res.source) {
                  if (res.rateLimited) {
                    newDiagnostics.push(`Plugin "${id}" hit GitHub rate limits and retried ${res.retryCount} time(s).`)
                  }
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

    const debounceTimer = setTimeout(() => {
      loadAll()
    }, 500)

    return () => {
      isMounted = false
      clearTimeout(debounceTimer)
    }
  }, [owner, repo, branch, adapterPath, enabledPlugins, pluginRegistry])

  const mergedContext = useMemo(() => {
    const result: RepoPressPreviewAdapter = {
      components: { ...standardComponents, ...(adapter?.components || {}) },
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
