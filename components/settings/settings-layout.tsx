"use client"

import { Home } from "lucide-react"
import Link from "next/link"
import { useParams } from "next/navigation"
import type * as React from "react"
import { Suspense } from "react"
import { RepoBreadcrumb } from "@/components/repo-breadcrumb"
import { SettingsSidebar } from "@/components/settings/settings-sidebar"
import { Button } from "@/components/ui/button"
import { Separator } from "@/components/ui/separator"

interface SettingsLayoutProps {
  children: React.ReactNode
}

export function SettingsLayout({ children }: SettingsLayoutProps) {
  const params = useParams()
  const owner = params.owner as string
  const repo = params.repo as string

  return (
    <div className="flex flex-col min-h-screen bg-background">
      {/* Top Navigation Bar - Matching History/Studio */}
      <header className="border-b bg-card sticky top-0 z-30">
        <div className="container mx-auto px-4 h-14 flex items-center">
          <div className="flex items-center gap-2">
            <Button variant="ghost" size="icon" asChild className="h-9 w-9">
              <Link href="/dashboard">
                <Home className="h-4 w-4" />
                <span className="sr-only">Back to dashboard</span>
              </Link>
            </Button>
            <Separator orientation="vertical" className="h-4 mx-2" />
            <RepoBreadcrumb owner={owner || "owner"} repo={repo || "repo"} path={["Settings"]} showDashboard={false} />
          </div>
        </div>
      </header>

      <div className="container mx-auto py-10 px-4">
        <div className="flex flex-col md:flex-row gap-12">
          <aside className="w-full md:w-56 shrink-0">
            <div className="sticky top-24 space-y-6">
              <div>
                <h2 className="text-xs font-bold uppercase tracking-widest text-muted-foreground px-3 mb-3 font-sans opacity-50">
                  Configuration
                </h2>
                <Suspense fallback={<div className="h-10 w-full animate-pulse bg-muted rounded-md" />}>
                  <SettingsSidebar />
                </Suspense>
              </div>
            </div>
          </aside>

          <main className="flex-1 min-w-0">{children}</main>
        </div>
      </div>
    </div>
  )
}
