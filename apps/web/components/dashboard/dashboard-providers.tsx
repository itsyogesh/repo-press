"use client"

import { ConvexBetterAuthProvider } from "@convex-dev/better-auth/react"
import { ConvexReactClient } from "convex/react"
import { type ReactNode, useEffect, useRef } from "react"
import { authClient } from "@/lib/auth-client"

const convexUrl = process.env.NEXT_PUBLIC_CONVEX_URL

type ClosableClient = {
  close(): void
}

export function createDashboardConvexClient<TClient>(url: string | undefined, createClient: (url: string) => TClient) {
  return url ? createClient(url) : null
}

export function closeDashboardConvexClient<TClient extends ClosableClient>(client: TClient | null) {
  client?.close()
  return null
}

export function DashboardProviders({ children, initialToken }: { children: ReactNode; initialToken?: string | null }) {
  const convexRef = useRef<ConvexReactClient | null>(null)

  if (convexRef.current === null) {
    convexRef.current = createDashboardConvexClient(convexUrl, (url) => new ConvexReactClient(url))
  }

  useEffect(() => {
    return () => {
      convexRef.current = closeDashboardConvexClient(convexRef.current)
    }
  }, [])

  if (!convexRef.current) {
    return <>{children}</>
  }

  return (
    <ConvexBetterAuthProvider client={convexRef.current} authClient={authClient} initialToken={initialToken}>
      {children}
    </ConvexBetterAuthProvider>
  )
}
