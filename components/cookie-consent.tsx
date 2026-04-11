"use client"

import { useEffect, useState } from "react"
import { Button } from "@/components/ui/button"

const CONSENT_KEY = "cookie-consent"

export function CookieConsent() {
  const [visible, setVisible] = useState(false)

  useEffect(() => {
    const consent = localStorage.getItem(CONSENT_KEY)
    if (consent !== "accepted" && consent !== "declined") {
      setVisible(true)
    }
  }, [])

  if (!visible) return null

  const handleAccept = () => {
    localStorage.setItem(CONSENT_KEY, "accepted")
    window.dispatchEvent(new StorageEvent("storage", { key: CONSENT_KEY, newValue: "accepted" }))
    setVisible(false)
  }

  const handleDecline = () => {
    localStorage.setItem(CONSENT_KEY, "declined")
    window.dispatchEvent(new StorageEvent("storage", { key: CONSENT_KEY, newValue: "declined" }))
    setVisible(false)
  }

  return (
    <div className="fixed bottom-0 left-0 right-0 z-50 border-t border-border bg-background/95 backdrop-blur p-4">
      <div className="mx-auto flex max-w-screen-xl flex-col items-center gap-3 sm:flex-row sm:justify-between">
        <p className="text-sm text-muted-foreground text-center sm:text-left">
          We use analytics cookies to understand how you use our site and improve your experience.
        </p>
        <div className="flex shrink-0 gap-2">
          <Button variant="outline" size="sm" className="rounded-lg" onClick={handleDecline}>
            Decline
          </Button>
          <Button variant="default" size="sm" className="rounded-lg" onClick={handleAccept}>
            Accept
          </Button>
        </div>
      </div>
    </div>
  )
}
