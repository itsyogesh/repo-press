"use client"

import { ConvexBetterAuthProvider } from "@convex-dev/better-auth/react"
import { ConvexReactClient } from "convex/react"
import { usePathname } from "next/navigation"
import { ThemeProvider } from "next-themes"
import { type ReactNode, useEffect, useRef } from "react"
import { authClient } from "@/lib/auth-client"

const convexUrl = process.env.NEXT_PUBLIC_CONVEX_URL

type ClosableClient = {
  close(): void
}

export function getOrCreateConvexClient<TClient extends ClosableClient>(
  currentClient: TClient | null,
  shouldMountAuthProvider: boolean,
  url: string | undefined,
  createClient: (url: string) => TClient,
) {
  if (!shouldMountAuthProvider || !url) {
    return currentClient
  }

  return currentClient ?? createClient(url)
}

export function closeConvexClient<TClient extends ClosableClient>(client: TClient | null) {
  client?.close()
  return null
}

export function Providers({ children, initialToken }: { children: ReactNode; initialToken?: string | null }) {
  const pathname = usePathname()
  const shouldMountAuthProvider = pathname.startsWith("/dashboard")
  const convexRef = useRef<ConvexReactClient | null>(null)

  convexRef.current = getOrCreateConvexClient(
    convexRef.current,
    shouldMountAuthProvider,
    convexUrl,
    (url) => new ConvexReactClient(url),
  )

  useEffect(() => {
    if (shouldMountAuthProvider) {
      return
    }

    convexRef.current = closeConvexClient(convexRef.current)
  }, [shouldMountAuthProvider])

  useEffect(() => {
    return () => {
      convexRef.current = closeConvexClient(convexRef.current)
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
