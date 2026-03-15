"use client"

import { Package } from "lucide-react"
import Link from "next/link"
import { useParams, useSearchParams } from "next/navigation"
import type * as React from "react"
import { cn } from "@/lib/utils"

const items = [
  {
    title: "Projects",
    id: "projects",
    icon: Package,
    disabled: false,
  },
]

export function SettingsSidebar() {
  const searchParams = useSearchParams()
  const params = useParams()
  const owner = params.owner as string
  const repo = params.repo as string

  const currentTab = searchParams.get("tab") || "projects"

  return (
    <nav className="flex flex-col gap-1">
      {items.map((item) => {
        const isActive = currentTab === item.id
        const href = `/dashboard/${owner}/${repo}/settings?tab=${item.id}`

        return (
          <div key={item.title}>
            <Link
              href={href}
              className={cn(
                "flex items-center gap-3 rounded-md px-3 py-2 text-sm font-medium transition-colors",
                isActive
                  ? "bg-secondary text-secondary-foreground"
                  : "text-muted-foreground hover:bg-muted hover:text-foreground",
              )}
            >
              <item.icon
                className={cn("h-4 w-4", isActive ? "text-foreground" : "text-muted-foreground")}
                aria-hidden="true"
              />
              <span>{item.title}</span>
            </Link>
          </div>
        )
      })}
    </nav>
  )
}
