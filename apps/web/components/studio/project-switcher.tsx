"use client"

import { useQuery } from "convex/react"
import { FolderGit2, Plus } from "lucide-react"
import { useRouter } from "next/navigation"
import {
  DropdownMenuItem,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
} from "@/components/ui/dropdown-menu"
import { Select, SelectContent, SelectItem, SelectSeparator, SelectTrigger, SelectValue } from "@/components/ui/select"
import { api } from "@/convex/_generated/api"
import { useStudio } from "./studio-context"

interface ProjectSwitcherProps {
  currentProjectId: string
  owner: string
  repo: string
  branch: string
  variant?: "select" | "menu"
}

export function ProjectSwitcher({ currentProjectId, owner, repo, branch, variant = "select" }: ProjectSwitcherProps) {
  const router = useRouter()
  const { projectAccessToken } = useStudio()

  // Repo-scoped: returns all projects for this repo the user can access.
  // Passes projectAccessToken so PAT users (no OAuth session) can also query.
  const projects = useQuery(api.projects.listProjectsForRepo, {
    repoOwner: owner,
    repoName: repo,
    projectAccessToken: projectAccessToken || undefined,
  })

  // Don't render if there are no sibling projects (or still loading)
  if (!projects || projects.length <= 1) return null

  const handleChange = (projectId: string) => {
    if (projectId === "new") {
      router.push(`/dashboard/${owner}/${repo}/setup`)
      return
    }
    if (projectId === currentProjectId) return
    const params = new URLSearchParams()
    params.set("branch", branch)
    params.set("projectId", projectId)
    router.push(`/dashboard/${owner}/${repo}/studio?${params.toString()}`)
  }

  if (variant === "menu") {
    return (
      <DropdownMenuSub>
        <DropdownMenuSubTrigger className="md:hidden">
          <FolderGit2 className="h-4 w-4" />
          Switch project
        </DropdownMenuSubTrigger>
        <DropdownMenuSubContent>
          <DropdownMenuRadioGroup value={currentProjectId} onValueChange={handleChange}>
            {projects.map((project) => (
              <DropdownMenuRadioItem key={project._id} value={project._id}>
                <span className="font-medium">{project.contentRoot || "/"}</span>
                {project.detectedFramework && (
                  <span className="text-muted-foreground">({project.detectedFramework})</span>
                )}
              </DropdownMenuRadioItem>
            ))}
          </DropdownMenuRadioGroup>
          <DropdownMenuSeparator />
          <DropdownMenuItem onSelect={() => handleChange("new")}>
            <Plus className="h-3 w-3" />
            New project...
          </DropdownMenuItem>
        </DropdownMenuSubContent>
      </DropdownMenuSub>
    )
  }

  return (
    <Select value={currentProjectId} onValueChange={handleChange}>
      <SelectTrigger className="h-7 text-xs w-auto min-w-[160px] bg-muted/50">
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        {projects.map((p) => (
          <SelectItem key={p._id} value={p._id} className="text-xs">
            <span className="font-medium">{p.contentRoot || "/"}</span>
            {p.detectedFramework && <span className="ml-2 text-muted-foreground">({p.detectedFramework})</span>}
          </SelectItem>
        ))}
        <SelectSeparator />
        <SelectItem value="new" className="text-xs">
          <span className="flex items-center gap-1">
            <Plus className="h-3 w-3" />
            New project...
          </span>
        </SelectItem>
      </SelectContent>
    </Select>
  )
}
