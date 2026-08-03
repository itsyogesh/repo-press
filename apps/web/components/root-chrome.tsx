"use client"

import { usePathname } from "next/navigation"
import type { ReactNode } from "react"
import { AnalyticsWrapper } from "@/components/analytics-wrapper"
import { CookieConsent } from "@/components/cookie-consent"
import { Providers } from "@/components/providers"
import { Toaster } from "@/components/ui/sonner"

const SANDBOX_PATHNAME = "/preview/sandbox"

export function RootChrome({ children }: { children: ReactNode }) {
  const pathname = usePathname()

  if (pathname === SANDBOX_PATHNAME) return children

  return (
    <Providers>
      {children}
      <Toaster />
      <CookieConsent />
      <AnalyticsWrapper />
    </Providers>
  )
}
