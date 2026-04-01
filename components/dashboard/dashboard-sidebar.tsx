"use client"

import { useQuery } from "convex/react"
import { Box, Folder, Home, LayoutDashboard } from "lucide-react"
import Link from "next/link"
import { usePathname } from "next/navigation"
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

export function DashboardSidebar() {
  const pathname = usePathname()
  const projects = useQuery(api.projects.listAccessibleProjects)

  const recentProjects = projects ? [...projects].sort((a, b) => b.updatedAt - a.updatedAt).slice(0, 5) : undefined

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

      <SidebarRail />
    </Sidebar>
  )
}
