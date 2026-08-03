"use client"

import { Analytics } from "@vercel/analytics/next"
import { useEffect, useState } from "react"

const CONSENT_KEY = "cookie-consent"

export function AnalyticsWrapper() {
  const [consented, setConsented] = useState(false)

  useEffect(() => {
    setConsented(localStorage.getItem(CONSENT_KEY) === "accepted")

    const onStorage = (e: StorageEvent) => {
      if (e.key === CONSENT_KEY) {
        setConsented(e.newValue === "accepted")
      }
    }

    window.addEventListener("storage", onStorage)
    return () => window.removeEventListener("storage", onStorage)
  }, [])

  if (!consented) return null
  return <Analytics />
}
