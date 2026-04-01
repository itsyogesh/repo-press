"use client"

import { Loader2, Save } from "lucide-react"
import { useEffect, useState, useTransition } from "react"
import { toast } from "sonner"
import { updateProjectInConfigAction } from "@/app/dashboard/[owner]/[repo]/config-actions"
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

export interface EditableProject {
  _id: string
  name: string
  contentRoot: string
  detectedFramework?: string
  contentType: string
  branch: string
  configProjectId?: string
}

interface EditProjectDialogProps {
  owner: string
  repo: string
  defaultBranch: string
  project: EditableProject | null
  open: boolean
  onOpenChange: (open: boolean) => void
  onSuccess?: () => void
}

export function EditProjectDialog({
  owner,
  repo,
  defaultBranch,
  project,
  open,
  onOpenChange,
  onSuccess,
}: EditProjectDialogProps) {
  const [isPending, startTransition] = useTransition()
  const [name, setName] = useState("")
  const [framework, setFramework] = useState("auto")
  const [contentType, setContentType] = useState("custom")
  const [branch, setBranch] = useState("")
  const [error, setError] = useState<string | null>(null)

  // Sync form state when project changes
  const resetToProject = (p: EditableProject) => {
    setName(p.name)
    setFramework(p.detectedFramework || "auto")
    setContentType(p.contentType)
    setBranch(p.branch === defaultBranch ? "" : p.branch)
    setError(null)
  }

  // Reset form when dialog opens or project identity changes.
  // Radix controlled Dialog does NOT call onOpenChange(true) when the parent
  // sets open=true, so we must use useEffect instead of relying on handleOpenChange.
  useEffect(() => {
    if (open && project) resetToProject(project)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, project?._id])

  const handleOpenChange = (o: boolean) => {
    if (!o) setError(null)
    onOpenChange(o)
  }

  if (!project) return null

  const configProjectId = project.configProjectId
  const isConfigManaged = !!configProjectId

  const handleSubmit = () => {
    if (!name.trim()) {
      setError("Project name is required")
      return
    }
    if (!configProjectId) {
      setError("Only config-managed projects can be edited here")
      return
    }

    setError(null)
    startTransition(async () => {
      // Config file always lives on the default branch — not the project's content branch
      const result = await updateProjectInConfigAction(owner, repo, defaultBranch, configProjectId, {
        name: name.trim(),
        framework,
        contentType: contentType as "blog" | "docs" | "pages" | "changelog" | "custom",
        ...(branch.trim() ? { branch: branch.trim() } : {}),
      })

      if (result.success) {
        toast.success(`Project "${name.trim()}" updated`)
        onOpenChange(false)
        onSuccess?.()
      } else {
        setError(result.error)
        toast.error(result.error)
      }
    })
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent
        className="sm:max-w-lg"
        // Prevent Radix from restoring focus to the dropdown trigger after close.
        // When this dialog is opened via a DropdownMenuItem, the trigger no longer
        // holds meaningful focus context — auto-focus return causes aria-hidden to
        // persist on the page container, freezing the UI.
        onCloseAutoFocus={(e) => e.preventDefault()}
      >
        <DialogHeader>
          <DialogTitle>Edit Project</DialogTitle>
          <DialogDescription>
            {isConfigManaged
              ? "Update project settings. Changes will be committed to the config file on GitHub."
              : "This project is not config-managed. Edit it from the Studio settings instead."}
          </DialogDescription>
        </DialogHeader>

        <div className="grid gap-4 py-4">
          <div className="grid gap-2">
            <Label htmlFor="edit-name">Project Name</Label>
            <Input
              id="edit-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              disabled={isPending || !isConfigManaged}
            />
          </div>

          <div className="grid gap-2">
            <Label>Content Root</Label>
            <Input value={project.contentRoot || "(repo root)"} disabled className="bg-muted" />
            <p className="text-xs text-muted-foreground">
              Content root cannot be changed after creation. To use a different path, remove this project and add a new
              one.
            </p>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="grid gap-2">
              <Label htmlFor="edit-framework">Framework</Label>
              <Select value={framework} onValueChange={setFramework} disabled={isPending || !isConfigManaged}>
                <SelectTrigger id="edit-framework">
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
              <Label htmlFor="edit-content-type">Content Type</Label>
              <Select value={contentType} onValueChange={setContentType} disabled={isPending || !isConfigManaged}>
                <SelectTrigger id="edit-content-type">
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
            <Label htmlFor="edit-branch">Branch (optional)</Label>
            <Input
              id="edit-branch"
              placeholder={`Default: ${defaultBranch}`}
              value={branch}
              onChange={(e) => setBranch(e.target.value)}
              disabled={isPending || !isConfigManaged}
            />
          </div>

          {error && <p className="text-sm text-destructive">{error}</p>}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={isPending}>
            Cancel
          </Button>
          <Button onClick={handleSubmit} disabled={isPending || !isConfigManaged}>
            {isPending ? (
              <>
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                Saving...
              </>
            ) : (
              <>
                <Save className="h-4 w-4 mr-2" />
                Save Changes
              </>
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
