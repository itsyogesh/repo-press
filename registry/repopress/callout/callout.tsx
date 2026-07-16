import type { ComponentPropsWithoutRef, ReactNode } from "react"

const variantClasses = {
  default: "border-border bg-muted/50",
  accent: "border-primary/30 bg-primary/5",
} as const

type CalloutTitle = { title?: undefined; titleId?: undefined } | { title: string; titleId: string }

export type CalloutProps = Omit<ComponentPropsWithoutRef<"aside">, "title"> &
  CalloutTitle & {
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
  return (
    <aside
      {...asideProps}
      className={mergeClassNames(
        "my-6 rounded-lg border px-4 py-3 text-foreground",
        variantClasses[variant],
        className,
      )}
      aria-labelledby={title ? titleId : ariaLabelledby}
    >
      {title ? (
        <div id={titleId} className="mb-1 text-sm font-medium">
          {title}
        </div>
      ) : null}
      <div className="text-sm leading-relaxed [&>p:last-child]:mb-0">{children}</div>
    </aside>
  )
}
