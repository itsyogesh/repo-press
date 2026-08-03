"use client"

import { AnimatePresence, motion } from "framer-motion"
import React, { useMemo } from "react"
import { cn } from "@/lib/utils"

export interface AnimatedListProps {
  children: React.ReactNode
  className?: string
}

/**
 * A simple staggered entry list for UI polish.
 * Optimized to prevent infinite animation loops.
 */
export const AnimatedList = React.memo(({ children, className }: AnimatedListProps) => {
  const childrenArray = useMemo(() => React.Children.toArray(children), [children])

  return (
    <div className={cn("flex flex-col gap-2", className)}>
      <AnimatePresence mode="popLayout">
        {childrenArray.map((item, idx) => (
          <motion.div
            key={(item as React.ReactElement).key || idx}
            initial={{ opacity: 0, y: 5 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{
              duration: 0.2,
              delay: Math.min(idx * 0.03, 0.3), // Cap delay for long lists
              ease: "easeOut",
            }}
            layout
            className="w-full"
          >
            {item}
          </motion.div>
        ))}
      </AnimatePresence>
    </div>
  )
})

AnimatedList.displayName = "AnimatedList"
