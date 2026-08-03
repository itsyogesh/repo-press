"use client"

import { Moon, Sun } from "lucide-react"
import { useTheme } from "next-themes"
import { useEffect, useState } from "react"
import { Button } from "@/components/ui/button"
import { DropdownMenuItem } from "@/components/ui/dropdown-menu"

export function StudioPageThemeToggle() {
  const [mounted, setMounted] = useState(false)
  const { theme, setTheme } = useTheme()
  const isDark = mounted && theme === "dark"

  useEffect(() => {
    setMounted(true)
  }, [])

  return (
    <Button
      variant="ghost"
      size="icon"
      className="h-8 w-8"
      onClick={() => setTheme(isDark ? "light" : "dark")}
      disabled={!mounted}
      aria-label="Toggle theme"
      title="Toggle theme"
    >
      {mounted ? (
        isDark ? (
          <Sun className="h-4 w-4" />
        ) : (
          <Moon className="h-4 w-4" />
        )
      ) : (
        <span aria-hidden className="block h-4 w-4" />
      )}
    </Button>
  )
}

export function StudioPageThemeMenuItem() {
  const { resolvedTheme, setTheme } = useTheme()

  return (
    <DropdownMenuItem className="sm:hidden" onSelect={() => setTheme(resolvedTheme === "dark" ? "light" : "dark")}>
      <Moon className="h-4 w-4" />
      Toggle theme
    </DropdownMenuItem>
  )
}
