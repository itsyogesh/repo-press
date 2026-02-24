"use client"

import { useQuery } from "convex/react"
import { Plus } from "lucide-react"
import { useRouter } from "next/navigation"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectSeparator,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { api } from "@/convex/_generated/api"

interface ProjectSwitcherProps {
  currentProjectId: string
  owner: string
  repo: string
  branch: string
}

export function ProjectSwitcher({ currentProjectId, owner, repo, branch }: ProjectSwitcherProps) {
  const router = useRouter()
  const user = useQuery(api.auth.getCurrentUser)
  const userId = user?._id as string | undefined

  const projects = useQuery(
    api.projects.getByRepo,
    userId ? { userId, repoOwner: owner, repoName: repo } : "skip",
  )

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

  return (
    <Select value={currentProjectId} onValueChange={handleChange}>
      <SelectTrigger className="h-7 text-xs w-auto min-w-[160px] bg-muted/50">
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        {projects.map((p) => (
          <SelectItem key={p._id} value={p._id} className="text-xs">
            <span className="font-medium">{p.contentRoot || "/"}</span>
            {p.detectedFramework && (
              <span className="ml-2 text-muted-foreground">({p.detectedFramework})</span>
            )}
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
