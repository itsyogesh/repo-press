"use client"

import { ArrowLeft, RefreshCw } from "lucide-react"
import { BrandMark } from "@/components/brand/logo"
import { Button } from "@/components/ui/button"
import { cn } from "@/lib/utils"

interface ErrorRecoveryProps {
  onRetry: () => void
  title?: string
  description?: string
  digest?: string
  className?: string
  ariaLabel?: string
}

export function ErrorRecovery({
  onRetry,
  title = "We couldn't open this workspace",
  description = "Something interrupted this view. Your saved content and files in GitHub are safe.",
  digest,
  className,
  ariaLabel = "Workspace recovery",
}: ErrorRecoveryProps) {
  return (
    <section
      aria-label={ariaLabel}
      className={cn("flex min-h-[60vh] w-full items-center justify-center px-4 py-12 sm:px-6", className)}
    >
      <div className="w-full max-w-xl border-y border-border py-10 sm:rounded-lg sm:border sm:px-10">
        <div className="flex items-center gap-3">
          <BrandMark tile className="size-10" />
          <p className="font-mono text-[0.65rem] uppercase tracking-[0.22em] text-muted-foreground">
            Recovery
          </p>
        </div>

        <div className="mt-8 space-y-3">
          <h1 className="rp-display text-4xl tracking-[-0.025em] text-foreground sm:text-5xl">{title}</h1>
          <p className="max-w-lg text-sm leading-6 text-muted-foreground sm:text-base">{description}</p>
        </div>

        <div className="mt-8 flex flex-col gap-3 sm:flex-row">
          <Button type="button" onClick={onRetry}>
            <RefreshCw />
            Try again
          </Button>
          <Button variant="outline" asChild>
            <a href="/dashboard">
              <ArrowLeft />
              Back to dashboard
            </a>
          </Button>
        </div>

        {digest ? (
          <p className="mt-8 border-t border-border pt-4 font-mono text-xs text-muted-foreground">
            Reference {digest}
          </p>
        ) : null}
      </div>
    </section>
  )
}
