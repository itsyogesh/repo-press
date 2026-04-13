"use client"

import { useQuery } from "convex/react"
import { Box, Clock, Folder, Home, LayoutDashboard, Pencil, Settings } from "lucide-react"
import Link from "next/link"
import { usePathname, useSearchParams } from "next/navigation"
import { DashboardSidebarFooter } from "@/components/dashboard/sidebar-footer"
import {
  Sidebar,
  SidebarContent,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarMenuSkeleton,
  SidebarRail,
} from "@/components/ui/sidebar"
import { api } from "@/convex/_generated/api"
import { cn } from "@/lib/utils"

const NAV_ITEMS = [
  { title: "Home", href: "/dashboard", icon: Home },
  { title: "Repositories", href: "/dashboard#repositories", icon: LayoutDashboard },
] as const

/** Parse /dashboard/:owner/:repo from pathname, returning null if not a repo route */
function parseRepoFromPath(pathname: string): { owner: string; repo: string } | null {
  const match = pathname.match(/^\/dashboard\/([^/]+)\/([^/]+)/)
  if (!match) return null
  return { owner: match[1], repo: match[2] }
}

export function DashboardSidebar() {
  const pathname = usePathname()
  const searchParams = useSearchParams()
  const projects = useQuery(api.projects.listAccessibleProjects)

  const recentProjects = projects ? [...projects].sort((a, b) => b.updatedAt - a.updatedAt).slice(0, 5) : undefined

  const repoContext = parseRepoFromPath(pathname)
  const isStudio = /\/studio(\/|$)/.test(pathname)

  // Projects belonging to the currently viewed repo (undefined while loading)
  const repoProjects =
    projects && repoContext
      ? projects.filter((p) => p.repoOwner === repoContext.owner && p.repoName === repoContext.repo)
      : undefined

  // Context carry-through: read projectId+branch from the current URL so that
  // navigating History↔Studio within a multi-project repo keeps the same project.
  const urlProjectId = searchParams.get("projectId")
  const urlBranch = searchParams.get("branch")

  // Resolution priority:
  // 1. URL has a projectId that matches a project in this repo → carry it forward
  // 2. Exactly 1 project in this repo → link directly into it
  // 3. Multi-project with no URL context → send to hub for disambiguation
  const urlProject =
    urlProjectId && repoProjects?.length ? (repoProjects.find((p) => p._id === urlProjectId) ?? null) : null
  const singleProject = !urlProject && repoProjects?.length === 1 ? repoProjects[0] : null
  const navProject = urlProject ?? singleProject

  // Build nav links. While projects are still loading, if the URL already carries
  // projectId+branch, use them directly so links don't flicker from hub → direct.
  function buildProjectLink(page: "studio" | "history"): string {
    if (!repoContext) return "/dashboard"
    const hub = `/dashboard/${repoContext.owner}/${repoContext.repo}`
    if (navProject) {
      return `${hub}/${page}?branch=${navProject.branch}&projectId=${navProject._id}`
    }
    if (repoProjects === undefined && urlProjectId && urlBranch) {
      return `${hub}/${page}?branch=${urlBranch}&projectId=${urlProjectId}`
    }
    return hub
  }

  const studioLink = buildProjectLink("studio")
  const historyLink = buildProjectLink("history")
  const hasProjectContext = Boolean(navProject) || (repoProjects === undefined && Boolean(urlProjectId))

  return (
    <Sidebar collapsible="icon" variant="sidebar">
      <SidebarHeader>
        <SidebarMenu>
          <SidebarMenuItem>
            <SidebarMenuButton asChild tooltip="RepoPress">
              <Link href="/dashboard">
                {/* In collapsed (icon) mode only the svg is visible; in expanded mode the branded wrapper shows */}
                <Box className="size-4 shrink-0 group-data-[collapsible=icon]:block hidden" />
                <div className="flex items-center gap-2 group-data-[collapsible=icon]:hidden">
                  <div className="flex aspect-square size-6 shrink-0 items-center justify-center rounded-md bg-primary text-primary-foreground">
                    <Box className="size-3.5" />
                  </div>
                  <div className="grid flex-1 text-left text-sm leading-tight">
                    <span className="truncate font-semibold">RepoPress</span>
                    <span className="truncate text-xs text-muted-foreground">Content Management</span>
                  </div>
                </div>
              </Link>
            </SidebarMenuButton>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarHeader>

      <SidebarContent>
        <SidebarGroup>
          <SidebarGroupLabel>Navigation</SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>
              {NAV_ITEMS.map((item) => (
                <SidebarMenuItem key={item.title}>
                  <SidebarMenuButton
                    asChild
                    isActive={item.href === "/dashboard" ? pathname === "/dashboard" : false}
                    tooltip={item.title}
                  >
                    <Link href={item.href}>
                      <item.icon className="size-4" />
                      <span>{item.title}</span>
                    </Link>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              ))}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>

        {/* Contextual repo sub-nav (visible when inside a repo route, except studio) */}
        {repoContext && !isStudio && (
          <SidebarGroup>
            <SidebarGroupLabel className="truncate">
              {repoContext.owner}/{repoContext.repo}
            </SidebarGroupLabel>
            <SidebarGroupContent>
              <SidebarMenu>
                <SidebarMenuItem>
                  <SidebarMenuButton
                    asChild
                    isActive={pathname.endsWith("/studio") || pathname.includes("/studio/")}
                    tooltip={hasProjectContext ? "Studio" : "Studio - select project"}
                  >
                    <Link href={studioLink}>
                      <Pencil className="size-4" />
                      <span>Studio</span>
                    </Link>
                  </SidebarMenuButton>
                </SidebarMenuItem>
                <SidebarMenuItem>
                  <SidebarMenuButton
                    asChild
                    isActive={pathname.includes("/history")}
                    tooltip={hasProjectContext ? "History" : "History - select project"}
                  >
                    <Link href={historyLink}>
                      <Clock className="size-4" />
                      <span>History</span>
                    </Link>
                  </SidebarMenuButton>
                </SidebarMenuItem>
                <SidebarMenuItem>
                  <SidebarMenuButton
                    asChild
                    isActive={pathname.endsWith("/settings") && pathname.includes(`/${repoContext.repo}/`)}
                    tooltip="Settings"
                  >
                    <Link href={`/dashboard/${repoContext.owner}/${repoContext.repo}/settings`}>
                      <Settings className="size-4" />
                      <span>Settings</span>
                    </Link>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              </SidebarMenu>
            </SidebarGroupContent>
          </SidebarGroup>
        )}

        <SidebarGroup>
          <SidebarGroupLabel>Recent Projects</SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>
              {recentProjects === undefined ? (
                (() => {
                  const skeletonWidths = ["68%", "74%", "81%"]
                  return Array.from({ length: 3 }).map((_, i) => (
                    // biome-ignore lint/suspicious/noArrayIndexKey: static skeleton placeholders
                    <SidebarMenuItem key={`skeleton-${i}`}>
                      <SidebarMenuSkeleton showIcon width={skeletonWidths[i % skeletonWidths.length]} />
                    </SidebarMenuItem>
                  ))
                })()
              ) : recentProjects.length === 0 ? (
                <p className="px-2 py-3 text-xs text-muted-foreground">No projects yet</p>
              ) : (
                recentProjects.map((project) => {
                  const studioUrl = `/dashboard/${project.repoOwner}/${project.repoName}/studio?branch=${project.branch}&projectId=${project._id}`
                  return (
                    <SidebarMenuItem key={project._id}>
                      <SidebarMenuButton
                        asChild
                        isActive={pathname.startsWith(`/dashboard/${project.repoOwner}/${project.repoName}`)}
                        tooltip={project.name}
                      >
                        <Link href={studioUrl}>
                          <Folder className={cn("size-4", "shrink-0")} />
                          <span className="truncate">{project.name}</span>
                        </Link>
                      </SidebarMenuButton>
                    </SidebarMenuItem>
                  )
                })
              )}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
      </SidebarContent>

      <DashboardSidebarFooter />
      <SidebarRail />
    </Sidebar>
  )
}
