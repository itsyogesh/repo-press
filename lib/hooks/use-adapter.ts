"use client"

import { useState, useEffect, useRef } from "react"
import { fetchAdapterSourceAction } from "@/app/dashboard/[owner]/[repo]/adapter-actions"
import { evaluateAdapter, type RepoPressPreviewAdapter } from "@/lib/repopress/evaluate-adapter"
import { transpileAdapter } from "@/lib/repopress/esbuild-browser"

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

export function useAdapter({ owner, repo, branch, adapterPath }: UseAdapterOptions): UseAdapterResult {
  const [adapter, setAdapter] = useState<RepoPressPreviewAdapter | null>(null)
  const [loading, setLoading] = useState<boolean>(false)
  const [error, setError] = useState<string | null>(null)

  const lastSourceRef = useRef<string | null>(null)

  useEffect(() => {
    if (!adapterPath) {
      setAdapter(null)
      setLoading(false)
      setError(null)
      lastSourceRef.current = null
      return
    }

    let isMounted = true

    async function loadAdapter() {
      setLoading(true)
      setError(null)

      try {
        const result = await fetchAdapterSourceAction(owner, repo, branch, adapterPath!)

        if (!isMounted) return

        if (!result.success || !result.source) {
          setError(result.error ?? "Failed to fetch adapter")
          setAdapter(null)
          lastSourceRef.current = null
          return
        }

        // Only re-transpile and evaluate if source changed
        if (result.source === lastSourceRef.current) {
          setLoading(false)
          return
        }

        const transpiled = await transpileAdapter(result.source)
        if (!isMounted) return

        const evaluatedAdapter = evaluateAdapter(transpiled)
        setAdapter(evaluatedAdapter)
        lastSourceRef.current = result.source
        setError(null)
      } catch (err: unknown) {
        if (!isMounted) return
        const message = err instanceof Error ? err.message : "Failed to load adapter"
        setError(message)
        setAdapter(null)
        lastSourceRef.current = null
      } finally {
        if (isMounted) {
          setLoading(false)
        }
      }
    }

    loadAdapter()

    return () => {
      isMounted = false
    }
  }, [owner, repo, branch, adapterPath])

  return { adapter, loading, error }
}
