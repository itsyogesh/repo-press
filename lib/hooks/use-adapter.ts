"use client"

import { useMemo, useSyncExternalStore } from "react"
import { fetchAdapterSourceAction } from "@/app/dashboard/[owner]/[repo]/adapter-actions"
import { transpileAdapter } from "@/lib/repopress/esbuild-browser"
import { evaluateAdapter, type RepoPressPreviewAdapter } from "@/lib/repopress/evaluate-adapter"

interface UseAdapterOptions {
  owner: string
  repo: string
  branch: string
  adapterPath: string | null | undefined
}

interface UseAdapterResult {
  adapter: RepoPressPreviewAdapter | null
  loading: boolean
  error: string | null
}

interface AdapterStoreEntry extends UseAdapterResult {
  listeners: Set<() => void>
  promise: Promise<void> | null
}

const EMPTY_RESULT: UseAdapterResult = {
  adapter: null,
  loading: false,
  error: null,
}

const adapterStore = new Map<string, AdapterStoreEntry>()

function getStoreEntry(key: string) {
  let entry = adapterStore.get(key)
  if (!entry) {
    entry = {
      ...EMPTY_RESULT,
      listeners: new Set(),
      promise: null,
    }
    adapterStore.set(key, entry)
  }
  return entry
}

function emit(entry: AdapterStoreEntry) {
  for (const listener of entry.listeners) {
    listener()
  }
}

async function loadAdapterSource(key: string, options: Required<UseAdapterOptions>) {
  const entry = getStoreEntry(key)
  if (entry.promise || entry.loading) return

  entry.loading = true
  entry.error = null
  emit(entry)

  entry.promise = (async () => {
    try {
      const result = await fetchAdapterSourceAction(options.owner, options.repo, options.branch, options.adapterPath)

      if (!result.success || !result.source) {
        entry.adapter = null
        entry.error = result.error ?? "Failed to fetch adapter"
        return
      }

      const transpiled = await transpileAdapter({
        entryPath: result.entryPath || options.adapterPath,
        sources: result.sources || { [options.adapterPath]: result.source },
      })
      entry.adapter = evaluateAdapter(transpiled)
      entry.error = null
    } catch (error: unknown) {
      entry.adapter = null
      entry.error = error instanceof Error ? error.message : "Failed to load adapter"
    } finally {
      entry.loading = false
      entry.promise = null
      emit(entry)
    }
  })()
}

function subscribeAdapter(key: string | null, options: Required<UseAdapterOptions> | null, listener: () => void) {
  if (!key || !options) return () => {}

  const entry = getStoreEntry(key)
  entry.listeners.add(listener)
  void loadAdapterSource(key, options)

  return () => {
    entry.listeners.delete(listener)
  }
}

function getSnapshot(key: string | null) {
  if (!key) return EMPTY_RESULT
  const entry = getStoreEntry(key)
  return {
    adapter: entry.adapter,
    loading: entry.loading,
    error: entry.error,
  }
}

export function useAdapter({ owner, repo, branch, adapterPath }: UseAdapterOptions): UseAdapterResult {
  const key = useMemo(
    () => (adapterPath ? `${owner}/${repo}@${branch}:${adapterPath}` : null),
    [owner, repo, branch, adapterPath],
  )

  return useSyncExternalStore(
    (listener) =>
      subscribeAdapter(
        key,
        adapterPath
          ? {
              owner,
              repo,
              branch,
              adapterPath,
            }
          : null,
        listener,
      ),
    () => getSnapshot(key),
    () => EMPTY_RESULT,
  )
}
