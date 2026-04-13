"use client"

import { useQuery } from "convex/react"
import { Box, Clock, Folder, Home, LayoutDashboard, Pencil, Settings } from "lucide-react"
import Link from "next/link"
import { usePathname } from "next/navigation"
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
  const projects = useQuery(api.projects.listAccessibleProjects)

  const recentProjects = projects ? [...projects].sort((a, b) => b.updatedAt - a.updatedAt).slice(0, 5) : undefined

  const repoContext = parseRepoFromPath(pathname)
  const isStudio = /\/studio(\/|$)/.test(pathname)

  // Projects belonging to the currently viewed repo (undefined while loading)
  const repoProjects =
    projects && repoContext
      ? projects.filter((p) => p.repoOwner === repoContext.owner && p.repoName === repoContext.repo)
      : undefined

  // When exactly one project exists, link directly into it.
  // When multiple (or still loading), send to the repo hub for disambiguation.
  const singleProject = repoProjects?.length === 1 ? repoProjects[0] : null
  const studioLink = repoContext
    ? singleProject
      ? `/dashboard/${repoContext.owner}/${repoContext.repo}/studio?branch=${singleProject.branch}&projectId=${singleProject._id}`
      : `/dashboard/${repoContext.owner}/${repoContext.repo}`
    : "/dashboard"
  const historyLink = repoContext
    ? singleProject
      ? `/dashboard/${repoContext.owner}/${repoContext.repo}/history?branch=${singleProject.branch}&projectId=${singleProject._id}`
      : `/dashboard/${repoContext.owner}/${repoContext.repo}`
    : "/dashboard"

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
                    tooltip={singleProject ? "Studio" : "Studio — select project"}
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
                    tooltip={singleProject ? "History" : "History — select project"}
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
