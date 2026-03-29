"use client"

import { usePathname } from "next/navigation"
import type { ReactNode } from "react"
import { DashboardHeader } from "@/components/dashboard/dashboard-header"
import { DashboardSidebar } from "@/components/dashboard/dashboard-sidebar"
import { SidebarInset, SidebarProvider } from "@/components/ui/sidebar"

export function DashboardShell({ children }: { children: ReactNode }) {
  const pathname = usePathname()
  // Studio has its own full-screen chrome; skip the dashboard shell entirely.
  const isStudio = /\/studio(\/|$)/.test(pathname)

  if (isStudio) {
    return <>{children}</>
  }

  return (
    <SidebarProvider>
      <DashboardSidebar />
      <SidebarInset>
        <DashboardHeader />
        <div className="flex-1 min-h-0 overflow-auto">{children}</div>
      </SidebarInset>
    </SidebarProvider>
  )
}
