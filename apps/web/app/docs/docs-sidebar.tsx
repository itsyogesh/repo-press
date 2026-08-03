"use client"

import { BookOpen, GitBranch, Menu, PenTool, Rocket, X } from "lucide-react"
import Link from "next/link"
import { usePathname } from "next/navigation"
import { useState } from "react"
import { cn } from "@/lib/utils"

const docsNav = [
  { href: "/docs/getting-started", label: "Getting Started", icon: Rocket },
  { href: "/docs/how-it-works", label: "How It Works", icon: BookOpen },
  {
    href: "/docs/connecting-a-repo",
    label: "Connecting a Repository",
    icon: GitBranch,
  },
  { href: "/docs/studio-editor", label: "Studio Editor", icon: PenTool },
]

function NavLinks({ pathname, onNavigate }: { pathname: string; onNavigate?: () => void }) {
  return (
    <>
      {docsNav.map((item) => {
        const Icon = item.icon
        const isActive = pathname === item.href
        return (
          <Link
            key={item.href}
            href={item.href}
            onClick={onNavigate}
            className={cn(
              "flex items-center gap-3 rounded-lg px-3 py-2 text-sm transition-colors",
              isActive
                ? "bg-primary/10 font-medium text-primary"
                : "text-muted-foreground hover:bg-muted hover:text-foreground",
            )}
          >
            <Icon className="h-4 w-4" />
            {item.label}
          </Link>
        )
      })}
    </>
  )
}

export function DocsSidebar() {
  const pathname = usePathname()
  const [mobileOpen, setMobileOpen] = useState(false)

  return (
    <>
      {/* Mobile toggle button */}
      <button
        type="button"
        onClick={() => setMobileOpen(true)}
        className="fixed bottom-4 right-4 z-40 flex h-12 w-12 items-center justify-center rounded-full bg-primary text-primary-foreground shadow-lg md:hidden"
        aria-label="Open docs navigation"
      >
        <Menu className="h-5 w-5" />
      </button>

      {/* Mobile overlay */}
      {mobileOpen && (
        <div className="fixed inset-0 z-50 md:hidden">
          {/* Backdrop */}
          <button
            type="button"
            className="absolute inset-0 bg-background/80 backdrop-blur-sm"
            onClick={() => setMobileOpen(false)}
            aria-label="Close docs navigation"
          />
          {/* Sidebar panel */}
          <aside className="absolute inset-y-0 left-0 w-72 border-r border-border bg-background p-6 shadow-lg">
            <div className="mb-6 flex items-center justify-between">
              <h3 className="text-sm font-semibold text-foreground">Documentation</h3>
              <button
                type="button"
                onClick={() => setMobileOpen(false)}
                className="rounded-md p-1 text-muted-foreground hover:text-foreground"
                aria-label="Close navigation"
              >
                <X className="h-5 w-5" />
              </button>
            </div>
            <nav className="space-y-1">
              <NavLinks pathname={pathname} onNavigate={() => setMobileOpen(false)} />
            </nav>
          </aside>
        </div>
      )}

      {/* Desktop sidebar */}
      <aside className="hidden w-64 shrink-0 md:block">
        <nav className="sticky top-20 space-y-1">
          <h3 className="mb-4 text-sm font-semibold text-foreground">Documentation</h3>
          <NavLinks pathname={pathname} />
        </nav>
      </aside>
    </>
  )
}
