"use client"

import { ConvexBetterAuthProvider } from "@convex-dev/better-auth/react"
import { ConvexReactClient } from "convex/react"
import { usePathname } from "next/navigation"
import { ThemeProvider } from "next-themes"
import { type ReactNode, useEffect, useRef } from "react"
import { authClient } from "@/lib/auth-client"

const convexUrl = process.env.NEXT_PUBLIC_CONVEX_URL

export function Providers({ children, initialToken }: { children: ReactNode; initialToken?: string | null }) {
  const pathname = usePathname()
  const shouldMountAuthProvider = pathname.startsWith("/dashboard")
  const convexRef = useRef<ConvexReactClient | null>(null)

  if (shouldMountAuthProvider && !convexRef.current && convexUrl) {
    convexRef.current = new ConvexReactClient(convexUrl)
  }

  useEffect(() => {
    return () => {
      convexRef.current?.close()
      convexRef.current = null
    }
  }, [])

  const convex = shouldMountAuthProvider ? convexRef.current : null
  const themedChildren = (
    <ThemeProvider attribute="class" defaultTheme="light" enableSystem={false}>
      {children}
    </ThemeProvider>
  )

  if (!convex) {
    return themedChildren
  }

  return (
    <ConvexBetterAuthProvider client={convex} authClient={authClient} initialToken={initialToken}>
      {themedChildren}
    </ConvexBetterAuthProvider>
  )
}
