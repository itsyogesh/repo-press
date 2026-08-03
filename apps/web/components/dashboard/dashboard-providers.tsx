"use client"

import { ConvexBetterAuthProvider, type AuthClient as ConvexProviderAuthClient } from "@convex-dev/better-auth/react"
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

  // @convex-dev/better-auth@0.12.5's provider type is incompatible with the
  // named ReactAuthClient type introduced in better-auth >=1.6.22. The runtime
  // contract is unchanged and this client follows the package's documented
  // convexClient() setup. Remove this bridge when github.com/get-convex/better-auth/issues/420 lands.
  const providerAuthClient = authClient as unknown as ConvexProviderAuthClient

  return (
    <ConvexBetterAuthProvider client={convexRef.current} authClient={providerAuthClient} initialToken={initialToken}>
      {children}
    </ConvexBetterAuthProvider>
  )
}
