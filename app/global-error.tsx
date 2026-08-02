"use client"

import * as Sentry from "@sentry/nextjs"
import { useEffect } from "react"
import { ErrorRecovery } from "@/components/error-recovery"

export default function GlobalError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => {
    Sentry.captureException(error)
  }, [error])

  return (
    <html lang="en" className="bg-background">
      <body className="min-h-svh bg-background font-sans text-foreground antialiased">
        <ErrorRecovery
          onRetry={reset}
          title="We couldn't open RepoPress"
          description="The application hit an unexpected problem. Your saved content and files in GitHub are safe."
          digest={error.digest}
          ariaLabel="Application recovery"
          className="min-h-svh"
        />
      </body>
    </html>
  )
}
