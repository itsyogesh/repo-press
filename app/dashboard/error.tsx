"use client"

import * as Sentry from "@sentry/nextjs"
import { useEffect } from "react"
import { ErrorRecovery } from "@/components/error-recovery"

export default function DashboardError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => {
    Sentry.captureException(error)
  }, [error])

  return <ErrorRecovery onRetry={reset} digest={error.digest} />
}
