import { Slot } from "@radix-ui/react-slot"
import { cva, type VariantProps } from "class-variance-authority"
import type * as React from "react"

import { cn } from "@/lib/utils"

const buttonVariants = cva(
  "inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-md border border-transparent text-sm font-medium tracking-[-0.01em] transition-[background-color,color,border-color,box-shadow] duration-150 ease-out disabled:pointer-events-none disabled:opacity-50 [&_svg]:pointer-events-none [&_svg:not([class*='size-'])]:size-4 shrink-0 [&_svg]:shrink-0 outline-none focus-visible:border-ring/50 focus-visible:ring-4 focus-visible:ring-ring/30 aria-invalid:border-destructive aria-invalid:ring-destructive/15 dark:aria-invalid:ring-destructive/25 motion-reduce:transition-none",
  {
    variants: {
      variant: {
        default:
          "bg-primary text-primary-foreground shadow-[var(--shadow-button)] hover:bg-primary/94 hover:shadow-[var(--shadow-button-hover)]",
        destructive:
          "bg-destructive text-white dark:text-white shadow-[var(--shadow-button)] hover:bg-destructive/92 hover:shadow-[var(--shadow-button-hover)] focus-visible:ring-destructive/20 dark:focus-visible:ring-destructive/25",
        outline:
          "border-border/70 bg-background text-foreground shadow-[var(--shadow-button)] hover:border-border hover:bg-secondary/85 hover:shadow-[var(--shadow-button-hover)]",
        secondary:
          "border-border/60 bg-secondary text-secondary-foreground shadow-[var(--shadow-button)] hover:border-border hover:bg-secondary/92 hover:shadow-[var(--shadow-button-hover)]",
        ghost: "text-foreground hover:bg-secondary/80 hover:text-foreground",
        link: "text-primary underline-offset-4 hover:underline",
      },
      size: {
        default: "h-10 px-4 has-[>svg]:px-3.5",
        sm: "h-9 gap-1.5 px-3 text-sm has-[>svg]:px-2.5",
        lg: "h-11 px-5 has-[>svg]:px-4",
        icon: "size-10",
        "icon-sm": "size-9",
        "icon-lg": "size-11",
      },
    },
    defaultVariants: {
      variant: "default",
      size: "default",
    },
  },
)

function Button({
  className,
  variant,
  size,
  asChild = false,
  ...props
}: React.ComponentProps<"button"> &
  VariantProps<typeof buttonVariants> & {
    asChild?: boolean
  }) {
  const Comp = asChild ? Slot : "button"

  return <Comp data-slot="button" className={cn(buttonVariants({ variant, size, className }))} {...props} />
}

export { Button, buttonVariants }
