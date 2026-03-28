"use client"

import { Loader2, Plus } from "lucide-react"
import { useState, useTransition } from "react"
import { toast } from "sonner"
import { addProjectToConfigAction } from "@/app/dashboard/[owner]/[repo]/config-actions"
import { Button } from "./ui/button"
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "./ui/dialog"
import { Input } from "./ui/input"
import { Label } from "./ui/label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "./ui/select"

const FRAMEWORK_OPTIONS = [
  { value: "auto", label: "Auto-detect" },
  { value: "fumadocs", label: "Fumadocs" },
  { value: "nextra", label: "Nextra" },
  { value: "astro", label: "Astro" },
  { value: "hugo", label: "Hugo" },
  { value: "docusaurus", label: "Docusaurus" },
  { value: "jekyll", label: "Jekyll" },
  { value: "contentlayer", label: "Content Layer" },
  { value: "next-mdx", label: "Next.js MDX" },
  { value: "custom", label: "Custom" },
] as const

const CONTENT_TYPE_OPTIONS = [
  { value: "docs", label: "Documentation" },
  { value: "blog", label: "Blog" },
  { value: "pages", label: "Pages" },
  { value: "changelog", label: "Changelog" },
  { value: "custom", label: "Custom" },
] as const

interface AddProjectDialogProps {
  owner: string
  repo: string
  defaultBranch: string
  open: boolean
  onOpenChange: (open: boolean) => void
  onSuccess?: () => void
}

function slugify(str: string): string {
  return str
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
}

export function AddProjectDialog({ owner, repo, defaultBranch, open, onOpenChange, onSuccess }: AddProjectDialogProps) {
  const [isPending, startTransition] = useTransition()
  const [name, setName] = useState("")
  const [contentRoot, setContentRoot] = useState("")
  const [framework, setFramework] = useState("auto")
  const [contentType, setContentType] = useState("custom")
  const [branch, setBranch] = useState("")
  const [error, setError] = useState<string | null>(null)

  const projectId = slugify(name)
  const effectiveBranch = branch || defaultBranch

  const resetForm = () => {
    setName("")
    setContentRoot("")
    setFramework("auto")
    setContentType("custom")
    setBranch("")
    setError(null)
  }

  const handleSubmit = () => {
    if (!name.trim()) {
      setError("Project name is required")
      return
    }
    if (!projectId) {
      setError("Project name must contain at least one alphanumeric character")
      return
    }

    setError(null)
    startTransition(async () => {
      const result = await addProjectToConfigAction(owner, repo, effectiveBranch, {
        id: projectId,
        name: name.trim(),
        contentRoot: contentRoot.trim(),
        framework,
        contentType: contentType as "blog" | "docs" | "pages" | "changelog" | "custom",
        ...(branch.trim() ? { branch: branch.trim() } : {}),
      })

      if (result.success) {
        toast.success(`Project "${name.trim()}" added`)
        resetForm()
        onOpenChange(false)
        onSuccess?.()
      } else {
        setError(result.error)
        toast.error(result.error)
      }
    })
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(o) => {
        if (!o) resetForm()
        onOpenChange(o)
      }}
    >
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Add Project</DialogTitle>
          <DialogDescription>
            Add a new content project to {owner}/{repo}. This will update the config file on GitHub.
          </DialogDescription>
        </DialogHeader>

        <div className="grid gap-4 py-4">
          <div className="grid gap-2">
            <Label htmlFor="project-name">Project Name</Label>
            <Input
              id="project-name"
              placeholder="e.g. Blog, Documentation"
              value={name}
              onChange={(e) => setName(e.target.value)}
              disabled={isPending}
            />
            {projectId && (
              <p className="text-xs text-muted-foreground">
                ID: <code className="bg-muted px-1 rounded">{projectId}</code>
              </p>
            )}
          </div>

          <div className="grid gap-2">
            <Label htmlFor="content-root">Content Root</Label>
            <Input
              id="content-root"
              placeholder="e.g. content/blog (empty = repo root)"
              value={contentRoot}
              onChange={(e) => setContentRoot(e.target.value)}
              disabled={isPending}
            />
            <p className="text-xs text-muted-foreground">Relative path to the content folder in your repository.</p>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="grid gap-2">
              <Label htmlFor="framework">Framework</Label>
              <Select value={framework} onValueChange={setFramework} disabled={isPending}>
                <SelectTrigger id="framework">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {FRAMEWORK_OPTIONS.map((opt) => (
                    <SelectItem key={opt.value} value={opt.value}>
                      {opt.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="grid gap-2">
              <Label htmlFor="content-type">Content Type</Label>
              <Select value={contentType} onValueChange={setContentType} disabled={isPending}>
                <SelectTrigger id="content-type">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {CONTENT_TYPE_OPTIONS.map((opt) => (
                    <SelectItem key={opt.value} value={opt.value}>
                      {opt.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="grid gap-2">
            <Label htmlFor="branch">Branch (optional)</Label>
            <Input
              id="branch"
              placeholder={`Default: ${defaultBranch}`}
              value={branch}
              onChange={(e) => setBranch(e.target.value)}
              disabled={isPending}
            />
          </div>

          {error && <p className="text-sm text-destructive">{error}</p>}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={isPending}>
            Cancel
          </Button>
          <Button onClick={handleSubmit} disabled={isPending}>
            {isPending ? (
              <>
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                Adding...
              </>
            ) : (
              <>
                <Plus className="h-4 w-4 mr-2" />
                Add Project
              </>
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
