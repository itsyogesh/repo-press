"use client"

import { useMutation, useQuery } from "convex/react"
import {
  AlertCircle,
  CheckCircle2,
  Folder,
  GitBranch,
  Loader2,

  RefreshCw,
  Settings,
  Sparkles,
} from "lucide-react"
import { useRouter } from "next/navigation"
import type React from "react"
import { useState, useTransition } from "react"
import { toast } from "sonner"
import { initRepoPressAction } from "@/app/dashboard/[owner]/[repo]/init-actions"
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { api } from "@/convex/_generated/api"
import type { RepoPressConfig } from "@/lib/config-schema"
import type { ConfigErrorType } from "@/lib/repopress/config"
import { retrySyncAction } from "@/lib/sync-projects"
import { getFrameworkConfig, getRegisteredAdapters } from "@/lib/framework-adapters"

interface RepoSetupFormProps {
  owner: string
  repo: string
  branches: any[]
  defaultBranch: string
  /** True when the default branch was inferred heuristically, not from GitHub API */
  defaultBranchInferred?: boolean
  frameworkConfig: {
    framework: string
    contentType: string
    suggestedContentRoots: string[]
    frontmatterFields: any[]
    metaFilePattern: string | null
    contentArchitecture?: { architectureNote?: string }
  }
  repoConfig?: RepoPressConfig | null
  configErrorType?: ConfigErrorType | null
  configError?: string | null
  isWriter?: boolean
}

export function RepoSetupForm({
  owner,
  repo,
  branches,
  defaultBranch,
  defaultBranchInferred,
  frameworkConfig,
  repoConfig,
  configErrorType,
  configError,
  isWriter = true,
}: RepoSetupFormProps) {
  const router = useRouter()
  const user = useQuery(api.auth.getCurrentUser)
  const getOrCreateProject = useMutation(api.projects.getOrCreate)

  const [selectedBranch, setSelectedBranch] = useState(defaultBranch)
  const [selectedFramework, setSelectedFramework] = useState(frameworkConfig.framework)
  const [contentPath, setContentPath] = useState(frameworkConfig.suggestedContentRoots[0] || "")
  const [contentType, setContentType] = useState<string>(frameworkConfig.contentType)
  const [currentFields, setCurrentFields] = useState(frameworkConfig.frontmatterFields)
  const [architectureNote, setArchitectureNote] = useState(
    frameworkConfig.contentArchitecture?.architectureNote || "",
  )
  const [isLoading, setIsLoading] = useState(false)
  const [isInitializing, setIsInitializing] = useState(false)
  const [showAdvanced, setShowAdvanced] = useState(false)
  const [isSyncPending, startSyncTransition] = useTransition()

  const registeredAdapters = getRegisteredAdapters()

  const handleFrameworkChange = (newFramework: string) => {
    setSelectedFramework(newFramework)
    const config = getFrameworkConfig(newFramework)
    setContentType(config.contentType)
    setContentPath(config.suggestedContentRoots[0] || "")
    setCurrentFields(config.frontmatterFields)
    setArchitectureNote(config.contentArchitecture?.architectureNote || "")
  }

  const handleRetrySync = () => {
    startSyncTransition(async () => {
      try {
        await retrySyncAction(owner, repo, selectedBranch)
        toast.success("Projects synced successfully!")
        router.push(`/dashboard/${owner}/${repo}`)
      } catch (err: any) {
        toast.error(err.message || "Failed to sync")
      }
    })
  }

  const handleInitRepoPress = async () => {
    setIsInitializing(true)
    try {
      const res = await initRepoPressAction(owner, repo, selectedBranch, {
        id: "main",
        name: `${repo} Content`,
        contentRoot: contentPath,
        framework: selectedFramework,
        contentType: contentType,
      })

      if (res.success) {
        toast.success("RepoPress initialized successfully! Syncing projects...")
        // Wait for GitHub to surface the config commit before syncing
        await new Promise((resolve) => setTimeout(resolve, 2000))
        handleRetrySync()
      } else {
        toast.error(res.error || "Failed to initialize RepoPress")
      }
    } catch (err: any) {
      toast.error(err.message)
    } finally {
      setIsInitializing(false)
    }
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()

    if (!user?._id) {
      toast.error("Not authenticated. Please sign in again.")
      return
    }

    setIsLoading(true)

    try {
      const projectId = await getOrCreateProject({
        userId: user._id as string,
        name: `${owner}/${repo}`,
        repoOwner: owner,
        repoName: repo,
        branch: selectedBranch,
        contentRoot: contentPath,
        detectedFramework: selectedFramework,
        contentType: contentType as "blog" | "docs" | "pages" | "changelog" | "custom",
        frontmatterSchema: currentFields,
      })

      toast.success("Project created successfully!")
      router.push(`/dashboard/${owner}/${repo}/studio?branch=${selectedBranch}&projectId=${projectId}`)
    } catch (error) {
      console.error("Error creating project:", error)
      toast.error("Failed to create project. Please try again.")
    } finally {
      setIsLoading(false)
    }
  }

  // Config exists but sync failed (shouldn't reach here due to auto-redirect, but handle gracefully)
  if (repoConfig) {
    return (
      <Card className="w-full max-w-md mx-auto">
        <CardHeader>
          <div className="flex items-center justify-between mb-2">
            <CardTitle>Configure Repository</CardTitle>
            <div className="flex items-center gap-1 rounded-full border border-studio-success/20 bg-studio-success-muted/60 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-studio-success">
              <CheckCircle2 className="h-3 w-3" />
              Config Found
            </div>
          </div>
          <CardDescription>
            A repopress.config.json was found. Sync projects from it.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {defaultBranchInferred && (
            <Alert className="border-studio-attention/20 bg-studio-attention-muted/60">
              <AlertCircle className="h-4 w-4 text-studio-attention" />
              <AlertTitle className="text-studio-attention text-sm">Verify default branch</AlertTitle>
              <AlertDescription className="text-xs text-studio-attention">
                We couldn&apos;t confirm the default branch from GitHub and selected <span className="font-medium">{defaultBranch}</span> as
                a best guess. If this is wrong, change it below before syncing.
              </AlertDescription>
            </Alert>
          )}

          <Alert className="border-studio-success/20 bg-studio-success-muted/60">
            <Settings className="h-4 w-4 text-studio-success" />
            <AlertTitle className="text-studio-success">Ready to Sync</AlertTitle>
            <AlertDescription className="text-xs text-studio-success">
              Syncing will set up all projects defined in the config file.
            </AlertDescription>
          </Alert>

          <div className="space-y-2">
            <Label>Branch</Label>
            <Select value={selectedBranch} onValueChange={setSelectedBranch}>
              <SelectTrigger>
                <div className="flex items-center gap-2">
                  <GitBranch className="h-4 w-4 text-muted-foreground" />
                  <SelectValue />
                </div>
              </SelectTrigger>
              <SelectContent>
                {branches.map((branch) => (
                  <SelectItem key={branch.name} value={branch.name}>
                    {branch.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <Button onClick={handleRetrySync} className="w-full" disabled={isSyncPending}>
            {isSyncPending ? (
              <>
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                Syncing...
              </>
            ) : (
              <>
                <CheckCircle2 className="h-4 w-4 mr-2" />
                Sync from Config
              </>
            )}
          </Button>
        </CardContent>
      </Card>
    )
  }

  // Transient GitHub failure
  if (configErrorType === "fetch-failed") {
    return (
      <Card className="w-full max-w-md mx-auto">
        <CardHeader>
          <CardTitle>Configure Repository</CardTitle>
          <CardDescription>Could not reach GitHub to check for a config file.</CardDescription>
        </CardHeader>
        <CardContent>
          <Alert variant="destructive">
            <AlertCircle className="h-4 w-4" />
            <AlertTitle>Connection Error</AlertTitle>
            <AlertDescription className="text-xs">
              Could not reach GitHub. Please check your connection and try again.
            </AlertDescription>
          </Alert>
          <Button onClick={() => router.refresh()} className="w-full mt-4" variant="outline">
            <RefreshCw className="h-4 w-4 mr-2" />
            Retry
          </Button>
        </CardContent>
      </Card>
    )
  }

  // Config invalid
  if (configErrorType === "invalid") {
    return (
      <Card className="w-full max-w-md mx-auto">
        <CardHeader>
          <CardTitle>Configure Repository</CardTitle>
          <CardDescription>The config file has validation errors.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <Alert variant="destructive">
            <AlertCircle className="h-4 w-4" />
            <AlertTitle>Invalid Config</AlertTitle>
            <AlertDescription className="text-xs">{configError}</AlertDescription>
          </Alert>
          <p className="text-sm text-muted-foreground">
            Fix the errors in your <code className="px-1 py-0.5 bg-muted rounded text-xs">repopress.config.json</code>{" "}
            and push the changes, then refresh this page.
          </p>
          <Button onClick={() => router.refresh()} className="w-full" variant="outline">
            <RefreshCw className="h-4 w-4 mr-2" />
            Refresh
          </Button>
        </CardContent>
      </Card>
    )
  }

  // No config found — show init form (primary case for this page)
  return (
    <Card className="w-full max-w-md mx-auto">
      <CardHeader>
        <div className="flex items-center justify-between mb-2">
          <CardTitle>Initialize RepoPress</CardTitle>
          <div className="flex items-center gap-1 rounded-full border border-studio-attention/20 bg-studio-attention-muted px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-studio-attention">
            <Sparkles className="h-3 w-3" />
            New Repo
          </div>
        </div>
        <CardDescription>
          {selectedFramework !== "custom" ? (
            <>
              Detected <span className="font-medium text-foreground">{selectedFramework}</span> framework.
              Set up a config file to manage content.
            </>
          ) : (
            "Set up a config file to manage content in this repository."
          )}
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        {/* Framework detection summary */}
        <Alert className="border-studio-accent/20 bg-studio-accent-muted/60">
          <Sparkles className="h-4 w-4 text-studio-accent" />
          <AlertTitle className="text-studio-accent">Initialize with Config (Recommended)</AlertTitle>
          <AlertDescription className="text-xs text-pretty text-studio-accent">
            This adds a config file and preview adapter to your repo, enabling live MDX editing and project management.
          </AlertDescription>
        </Alert>

        {/* Inferred branch warning */}
        {defaultBranchInferred && (
          <Alert className="border-studio-attention/20 bg-studio-attention-muted/60">
            <AlertCircle className="h-4 w-4 text-studio-attention" />
            <AlertTitle className="text-studio-attention text-sm">Verify default branch</AlertTitle>
            <AlertDescription className="text-xs text-studio-attention">
              We couldn&apos;t confirm the default branch from GitHub and selected <span className="font-medium">{defaultBranch}</span> as
              a best guess. If this is wrong, change it below before initializing.
              Framework detection and config lookup used this branch.
            </AlertDescription>
          </Alert>
        )}

        {/* Init form fields */}
        <div className="space-y-4">
          <div className="space-y-2">
            <Label>Branch</Label>
            <Select value={selectedBranch} onValueChange={setSelectedBranch}>
              <SelectTrigger>
                <div className="flex items-center gap-2">
                  <GitBranch className="h-4 w-4 text-muted-foreground" />
                  <SelectValue placeholder="Select a branch" />
                </div>
              </SelectTrigger>
              <SelectContent>
                {branches.map((branch) => (
                  <SelectItem key={branch.name} value={branch.name}>
                    {branch.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <Label>Content Root</Label>
            <div className="relative">
              <Folder className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="e.g. content/blog"
                value={contentPath}
                onChange={(e) => setContentPath(e.target.value)}
                className="pl-9"
              />
            </div>
            {(() => {
              const config = getFrameworkConfig(selectedFramework)
              const roots = config.suggestedContentRoots
              return (
                roots.length > 1 && (
                  <div className="flex flex-wrap gap-1 mt-1">
                    {roots.map((root) => (
                      <button
                        key={root}
                        type="button"
                        className="text-xs px-2 py-0.5 rounded-full bg-muted hover:bg-muted/80 text-muted-foreground"
                        onClick={() => setContentPath(root)}
                      >
                        {root || "(root)"}
                      </button>
                    ))}
                  </div>
                )
              )
            })()}
          </div>

          <div className="space-y-2">
            <Label>Framework</Label>
            <Select value={selectedFramework} onValueChange={handleFrameworkChange}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {registeredAdapters.map((adapter) => (
                  <SelectItem key={adapter.id} value={adapter.id}>
                    {adapter.displayName}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {architectureNote && <p className="text-xs text-muted-foreground">{architectureNote}</p>}
          </div>

          <div className="space-y-2">
            <Label>Content Type</Label>
            <Select value={contentType} onValueChange={setContentType}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="blog">Blog</SelectItem>
                <SelectItem value="docs">Documentation</SelectItem>
                <SelectItem value="pages">Pages</SelectItem>
                <SelectItem value="changelog">Changelog</SelectItem>
                <SelectItem value="custom">Custom</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>

        {/* Viewer warning: org editors with cold cache may be misidentified as viewers */}
        {!isWriter && (
          <Alert className="border-studio-attention/20 bg-studio-attention-muted/60">
            <AlertCircle className="h-4 w-4 text-studio-attention" />
            <AlertTitle className="text-studio-attention text-sm">Limited Access Detected</AlertTitle>
            <AlertDescription className="text-xs text-studio-attention">
              We could not confirm write access. If you have push permissions, you can still try — GitHub will verify your access.
            </AlertDescription>
          </Alert>
        )}

        {/* Primary CTA: Initialize */}
        <Button
          type="button"
          className="w-full"
          onClick={handleInitRepoPress}
          disabled={isInitializing || isLoading || isSyncPending}
        >
          {isInitializing ? (
            <>
              <Loader2 className="h-4 w-4 mr-2 animate-spin" />
              Initializing...
            </>
          ) : (
            <>
              <Sparkles className="h-4 w-4 mr-2" />
              Initialize RepoPress
            </>
          )}
        </Button>

        {/* Advanced: legacy manual path */}
        <Collapsible open={showAdvanced} onOpenChange={setShowAdvanced}>
          <CollapsibleTrigger asChild>
            <Button variant="ghost" size="sm" className="w-full text-xs text-muted-foreground">
              {showAdvanced ? "Hide advanced options" : "Advanced: Create without config file"}
            </Button>
          </CollapsibleTrigger>
          <CollapsibleContent className="pt-2">
            <form onSubmit={handleSubmit}>
              <Button
                type="submit"
                variant="outline"
                className="w-full"
                disabled={isLoading || isInitializing || !user}
              >
                {isLoading ? (
                  <>
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                    Creating...
                  </>
                ) : (
                  "Create without config file (advanced)"
                )}
              </Button>
            </form>
          </CollapsibleContent>
        </Collapsible>
      </CardContent>
    </Card>
  )
}
