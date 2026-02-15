"use client"

import { ConvexReactClient } from "convex/react"
import { ConvexBetterAuthProvider } from "@convex-dev/better-auth/react"
import { authClient } from "@/lib/auth-client"
import { useMemo, type ReactNode } from "react"

const convexUrl = process.env.NEXT_PUBLIC_CONVEX_URL

export function Providers({
  children,
  initialToken,
}: {
  children: ReactNode
  initialToken?: string | null
}) {
  const convex = useMemo(
    () => (convexUrl ? new ConvexReactClient(convexUrl) : null),
    [],
  )

  if (!convex) {
    return <>{children}</>
  }

  return (
    <ConvexBetterAuthProvider
      client={convex}
      authClient={authClient}
      initialToken={initialToken}
    >
      {children}
    </ConvexBetterAuthProvider>
  )
}
