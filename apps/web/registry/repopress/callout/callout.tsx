"use client"

import { type ComponentPropsWithoutRef, type ReactNode, useId } from "react"

const variantClasses = {
  default: "border-border bg-muted/50",
  accent: "border-primary/30 bg-primary/5",
} as const

export interface CalloutProps extends Omit<ComponentPropsWithoutRef<"aside">, "title"> {
  title?: string
  titleId?: string
  variant?: "default" | "accent"
  children: ReactNode
}

function mergeClassNames(...classes: Array<string | undefined>): string {
  return classes.filter(Boolean).join(" ")
}

export function Callout({
  title,
  titleId,
  variant = "default",
  children,
  className,
  "aria-labelledby": ariaLabelledby,
  ...asideProps
}: CalloutProps) {
  const generatedTitleId = useId()
  const resolvedTitleId = title ? (titleId ?? generatedTitleId) : undefined

  return (
    <aside
      {...asideProps}
      className={mergeClassNames(
        "my-6 rounded-lg border px-4 py-3 text-foreground",
        variantClasses[variant],
        className,
      )}
      aria-labelledby={resolvedTitleId ?? ariaLabelledby}
    >
      {title ? (
        <div id={resolvedTitleId} className="mb-1 text-sm font-medium">
          {title}
        </div>
      ) : null}
      <div className="text-sm leading-relaxed [&>p:last-child]:mb-0">{children}</div>
    </aside>
  )
}
