"use client"

import { Box, PanelLeftIcon } from "lucide-react"
import Link from "next/link"
import { UserMenu } from "@/components/dashboard/user-menu"
import { StudioPageThemeToggle } from "@/components/studio/studio-page-theme-toggle"
import { Button } from "@/components/ui/button"
import { useSidebar } from "@/components/ui/sidebar"

export function DashboardHeader() {
  const { toggleSidebar, isMobile } = useSidebar()

  return (
    <header className="sticky top-0 z-30 flex h-14 items-center gap-4 border-b bg-background/95 px-4 backdrop-blur supports-[backdrop-filter]:bg-background/60">
      <Button variant="ghost" size="icon" className="h-8 w-8" onClick={toggleSidebar}>
        <PanelLeftIcon className="h-4 w-4" />
        <span className="sr-only">Toggle sidebar</span>
      </Button>

      {isMobile && (
        <Link href="/dashboard" className="flex items-center gap-2 text-lg">
          <Box className="h-5 w-5" />
          <span className="font-bold">Repo</span>
          <span className="font-normal -ml-1.5">press</span>
        </Link>
      )}

      <div className="ml-auto flex items-center gap-2">
        <StudioPageThemeToggle />
        <UserMenu />
      </div>
    </header>
  )
}
