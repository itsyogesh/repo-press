"use client"

import * as SwitchPrimitive from "@radix-ui/react-switch"
import type * as React from "react"

import { cn } from "@/lib/utils"

function Switch({ className, ...props }: React.ComponentProps<typeof SwitchPrimitive.Root>) {
  return (
    <SwitchPrimitive.Root
      data-slot="switch"
      className={cn(
        "peer inline-flex h-[22px] w-[38px] shrink-0 items-center rounded-full border border-border bg-muted outline-none transition-colors focus-visible:ring-[3px] focus-visible:ring-ring/50 disabled:cursor-not-allowed disabled:opacity-50 data-[state=checked]:border-primary data-[state=checked]:bg-primary",
        className,
      )}
      {...props}
    >
      <SwitchPrimitive.Thumb
        data-slot="switch-thumb"
        className={cn(
          "pointer-events-none block size-4 rounded-full bg-background shadow-[0_1px_2px_oklch(0_0_0/0.25)] ring-0 transition-transform",
          "data-[state=unchecked]:translate-x-[2px] data-[state=checked]:translate-x-[18px] data-[state=checked]:bg-white",
        )}
      />
    </SwitchPrimitive.Root>
  )
}

export { Switch }
