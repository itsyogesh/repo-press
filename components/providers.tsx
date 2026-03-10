"use client"

import { ConvexBetterAuthProvider } from "@convex-dev/better-auth/react"
import { ConvexReactClient } from "convex/react"
import { ThemeProvider } from "next-themes"
import { type ReactNode, useMemo } from "react"
import { authClient } from "@/lib/auth-client"

const convexUrl = process.env.NEXT_PUBLIC_CONVEX_URL

export function Providers({ children, initialToken }: { children: ReactNode; initialToken?: string | null }) {
  const convex = useMemo(() => (convexUrl ? new ConvexReactClient(convexUrl) : null), [])

  if (!convex) {
    return (
      <ThemeProvider attribute="class" defaultTheme="light" enableSystem={false}>
        {children}
      </ThemeProvider>
    )
  }

  return (
    <ConvexBetterAuthProvider client={convex} authClient={authClient} initialToken={initialToken}>
      <ThemeProvider attribute="class" defaultTheme="light" enableSystem={false}>
        {children}
      </ThemeProvider>
    </ConvexBetterAuthProvider>
  )
}
