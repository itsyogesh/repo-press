"use client"

import { useMemo, useSyncExternalStore } from "react"
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
import { buildMergedContext } from "@/lib/repopress/preview-context"

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

interface PreviewStoreEntry {
  adapter: RepoPressPreviewAdapter | null
  plugins: Record<string, RepoPressPreviewAdapter>
  loading: boolean
  error: string | null
  diagnostics: string[]
  listeners: Set<() => void>
  promise: Promise<void> | null
  cachedSnapshot: UsePreviewContextResult | null
}

type AdapterSourceActionResult = Awaited<ReturnType<typeof fetchAdapterSourceAction>>
type PluginSourceActionResult = Awaited<ReturnType<typeof fetchPluginAction>>

const previewStore = new Map<string, PreviewStoreEntry>()
const inFlightAdapterRequests = new Map<string, Promise<AdapterSourceActionResult>>()
const inFlightPluginRequests = new Map<string, Promise<PluginSourceActionResult>>()

let didPruneAdapterCache = false

const EMPTY_RESULT: UsePreviewContextResult = {
  context: buildMergedContext(null, {}),
  loading: false,
  error: null,
  diagnostics: [],
}

function getStoreEntry(key: string) {
  let entry = previewStore.get(key)
  if (!entry) {
    entry = {
      adapter: null,
      plugins: {},
      loading: false,
      error: null,
      diagnostics: [],
      listeners: new Set(),
      promise: null,
      cachedSnapshot: null,
    }
    previewStore.set(key, entry)
  }
  return entry
}

function emit(entry: PreviewStoreEntry) {
  entry.cachedSnapshot = null
  for (const listener of entry.listeners) {
    listener()
  }
}

function dedupedAdapterRequest(owner: string, repo: string, branch: string, adapterPath: string) {
  const key = `${owner}/${repo}@${branch}:${adapterPath}`
  const existing = inFlightAdapterRequests.get(key)
  if (existing) return existing

  const request = fetchAdapterSourceAction(owner, repo, branch, adapterPath).finally(() => {
    inFlightAdapterRequests.delete(key)
  })
  inFlightAdapterRequests.set(key, request)
  return request
}

function dedupedPluginRequest(owner: string, repo: string, branch: string, pluginPath: string) {
  const key = `${owner}/${repo}@${branch}:${pluginPath}`
  const existing = inFlightPluginRequests.get(key)
  if (existing) return existing

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

async function loadPreviewContext(key: string, options: Required<UsePreviewContextOptions>) {
  const entry = getStoreEntry(key)
  if (entry.promise || entry.loading) return

  entry.loading = true
  entry.error = null
  emit(entry)

  entry.promise = (async () => {
    const diagnostics: string[] = []

    try {
      if (!didPruneAdapterCache) {
        didPruneAdapterCache = true
        await pruneExpiredAdapterCache()
      }

      if (options.adapterPath) {
        const result = await dedupedAdapterRequest(options.owner, options.repo, options.branch, options.adapterPath)
        if (result.success && "source" in result && result.source) {
          if ("rateLimited" in result && result.rateLimited) {
            diagnostics.push(
              `Adapter request for ${options.adapterPath} hit GitHub rate limits and retried ${result.retryCount} time(s).`,
            )
          }

          const sourceSha = ("sha" in result ? result.sha : null) || hashSource(result.source)
          const cacheKey = buildAdapterCacheKey(
            options.owner,
            options.repo,
            options.branch,
            options.adapterPath,
            sourceSha,
          )
          let transpiled = await getCachedAdapter(cacheKey, sourceSha)
          if (!transpiled) {
            const entryPath = ("entryPath" in result ? result.entryPath : null) || options.adapterPath
            transpiled = await transpileAdapter({
              entryPath,
              sources: ("sources" in result ? result.sources : null) || {
                [options.adapterPath]: result.source,
              },
            })
            await setCachedAdapter({
              key: cacheKey,
              sourceSha,
              transpiledCode: transpiled,
            })
          }
          entry.adapter = evaluateAdapter(transpiled)
        } else {
          diagnostics.push(`Adapter missing or failed at ${options.adapterPath}: ${result.error}`)
          entry.adapter = null
        }
      } else {
        entry.adapter = null
      }

      const nextPlugins: Record<string, RepoPressPreviewAdapter> = {}
      const enabledPlugins = options.enabledPlugins ?? []
      const pluginRegistry = options.pluginRegistry ?? {}
      if (enabledPlugins.length > 0) {
        const pluginTasks = enabledPlugins
          .map((id) => ({ id, path: pluginRegistry[id] }))
          .filter((plugin) => Boolean(plugin.path))
          .map(async ({ id, path }) => {
            try {
              const result = await dedupedPluginRequest(options.owner, options.repo, options.branch, path!)
              if (result.success && "source" in result && result.source) {
                if ("rateLimited" in result && result.rateLimited) {
                  diagnostics.push(`Plugin "${id}" hit GitHub rate limits and retried ${result.retryCount} time(s).`)
                }
                const pluginEntryPath = ("entryPath" in result ? result.entryPath : null) || path!
                const transpiled = await transpileAdapter({
                  entryPath: pluginEntryPath,
                  sources: ("sources" in result ? result.sources : null) || { [path!]: result.source },
                })
                return { id, adapter: evaluateAdapter(transpiled) }
              }
              return { id, error: result.error || "Unknown error" }
            } catch (error: unknown) {
              return {
                id,
                error: error instanceof Error ? error.message : "Unknown error",
              }
            }
          })

        const results = await Promise.all(pluginTasks)
        for (const result of results) {
          if ("adapter" in result && result.adapter) {
            nextPlugins[result.id] = result.adapter
          } else {
            diagnostics.push(`Plugin "${result.id}" failed to load: ${result.error}`)
          }
        }
      }

      entry.plugins = nextPlugins
      entry.diagnostics = diagnostics
      entry.error = null
    } catch (error: unknown) {
      entry.adapter = null
      entry.plugins = {}
      entry.error = error instanceof Error ? error.message : "Failed to load preview context"
      entry.diagnostics = diagnostics
    } finally {
      entry.loading = false
      entry.promise = null
      emit(entry)
    }
  })()
}

function subscribePreviewContext(
  key: string | null,
  options: Required<UsePreviewContextOptions> | null,
  listener: () => void,
) {
  if (!key || !options) return () => {}

  const entry = getStoreEntry(key)
  entry.listeners.add(listener)
  void loadPreviewContext(key, options)

  return () => {
    entry.listeners.delete(listener)
  }
}

function getSnapshot(key: string | null): UsePreviewContextResult {
  if (!key) return EMPTY_RESULT
  const entry = getStoreEntry(key)
  if (entry.cachedSnapshot) return entry.cachedSnapshot
  const snapshot: UsePreviewContextResult = {
    context: buildMergedContext(entry.adapter, entry.plugins),
    loading: entry.loading,
    error: entry.error,
    diagnostics: entry.diagnostics,
  }
  entry.cachedSnapshot = snapshot
  return snapshot
}

export function usePreviewContext({
  owner,
  repo,
  branch,
  adapterPath,
  enabledPlugins,
  pluginRegistry,
}: UsePreviewContextOptions): UsePreviewContextResult {
  const normalizedPlugins = useMemo(() => [...(enabledPlugins || [])].sort(), [enabledPlugins])
  const normalizedRegistry = useMemo(() => pluginRegistry || {}, [pluginRegistry])
  const key = useMemo(
    () =>
      JSON.stringify({
        owner,
        repo,
        branch,
        adapterPath: adapterPath || null,
        enabledPlugins: normalizedPlugins,
        pluginRegistry: normalizedRegistry,
      }),
    [owner, repo, branch, adapterPath, normalizedPlugins, normalizedRegistry],
  )

  return useSyncExternalStore(
    (listener) =>
      subscribePreviewContext(
        key,
        {
          owner,
          repo,
          branch,
          adapterPath: adapterPath || null,
          enabledPlugins: normalizedPlugins,
          pluginRegistry: normalizedRegistry,
        },
        listener,
      ),
    () => getSnapshot(key),
    () => EMPTY_RESULT,
  )
}
