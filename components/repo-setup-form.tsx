"use client"

import { useMutation, useQuery } from "convex/react"
import { Folder, GitBranch, Loader2 } from "lucide-react"
import { useRouter } from "next/navigation"
import type React from "react"
import { useState } from "react"
import { toast } from "sonner"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import { Settings, Sparkles, CheckCircle2, AlertTriangle } from "lucide-react"
import { api } from "@/convex/_generated/api"
import { getFrameworkConfig, getRegisteredAdapters } from "@/lib/framework-adapters"
import type { FrameworkConfig } from "@/lib/framework-adapters"
import type { RepoPressConfig } from "@/lib/config-schema"
import { syncProjectsFromConfigAction } from "@/app/dashboard/[owner]/[repo]/actions"
import { initRepoPressAction } from "@/app/dashboard/[owner]/[repo]/init-actions"

interface RepoSetupFormProps {
  owner: string
  repo: string
  branches: any[]
  defaultBranch: string
  frameworkConfig: {
    framework: string
    contentType: string
    suggestedContentRoots: string[]
    frontmatterFields: any[]
    metaFilePattern: string | null
    contentArchitecture?: { architectureNote?: string }
  }
  repoConfig?: RepoPressConfig | null
}

export function RepoSetupForm({
  owner,
  repo,
  branches,
  defaultBranch,
  frameworkConfig,
  repoConfig,
}: RepoSetupFormProps) {
  const router = useRouter()
  const user = useQuery(api.auth.getCurrentUser)
  const getOrCreateProject = useMutation(api.projects.getOrCreate)

  const [selectedBranch, setSelectedBranch] = useState(defaultBranch)
  const [selectedFramework, setSelectedFramework] = useState(frameworkConfig.framework)
  const [contentPath, setContentPath] = useState(frameworkConfig.suggestedContentRoots[0] || "")
  const [contentType, setContentType] = useState<string>(frameworkConfig.contentType)
  const [currentFields, setCurrentFields] = useState(frameworkConfig.frontmatterFields)
  const [architectureNote, setArchitectureNote] = useState(frameworkConfig.contentArchitecture?.architectureNote || "")
  const [isLoading, setIsLoading] = useState(false)
  const [isInitializing, setIsInitializing] = useState(false)

  const registeredAdapters = getRegisteredAdapters()

  const handleFrameworkChange = (newFramework: string) => {
    setSelectedFramework(newFramework)
    const config = getFrameworkConfig(newFramework)
    setContentType(config.contentType)
    setContentPath(config.suggestedContentRoots[0] || "")
    setCurrentFields(config.frontmatterFields)
    setArchitectureNote(config.contentArchitecture?.architectureNote || "")
  }

  const handleSyncFromConfig = async () => {
    setIsLoading(true)
    try {
      const res = await syncProjectsFromConfigAction(owner, repo, selectedBranch)
      if (res.success) {
        toast.success(`Successfully synced ${res.count} projects from config!`)
        router.push(`/dashboard/${owner}/${repo}`)
      } else {
        toast.error(res.error || "Failed to sync projects")
      }
    } catch (err: any) {
      toast.error(err.message)
    } finally {
      setIsLoading(false)
    }
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
        toast.success("RepoPress initialized successfully! Committing config files...")
        // Wait a bit for GitHub to reflect changes then sync
        setTimeout(async () => {
          await handleSyncFromConfig()
        }, 2000)
      } else {
        toast.error(res.error || "Failed to initialize RepoPress")
        setIsInitializing(false)
      }
    } catch (err: any) {
      toast.error(err.message)
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

  return (
    <Card className="w-full max-w-md mx-auto">
      <CardHeader>
        <div className="flex items-center justify-between mb-2">
          <CardTitle>Configure Repository</CardTitle>
          {repoConfig ? (
            <div className="flex items-center gap-1 text-[10px] font-bold uppercase tracking-wider text-green-600 bg-green-50 px-2 py-0.5 rounded-full border border-green-200">
              <CheckCircle2 className="h-3 w-3" />
              Config Found
            </div>
          ) : (
            <div className="flex items-center gap-1 text-[10px] font-bold uppercase tracking-wider text-amber-600 bg-amber-50 px-2 py-0.5 rounded-full border border-amber-200">
              <Sparkles className="h-3 w-3" />
              New Repo
            </div>
          )}
        </div>
        <CardDescription>
          {repoConfig ? (
            "A repopress.config.json was found. You can sync projects directly from it."
          ) : selectedFramework !== "custom" ? (
            <>
              Detected <span className="font-medium text-foreground">{selectedFramework}</span> framework.
            </>
          ) : (
            "Select the branch and folder you want to manage."
          )}
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        {repoConfig ? (
          <div className="space-y-4">
            <Alert className="bg-green-50/50 border-green-200">
              <Settings className="h-4 w-4 text-green-600" />
              <AlertTitle className="text-green-800">Ready to Sync</AlertTitle>
              <AlertDescription className="text-green-700 text-xs">
                This repository already has a configuration file. Syncing will automatically set up all projects defined
                in it.
              </AlertDescription>
            </Alert>

            <div className="space-y-2">
              <Label>Sync Branch</Label>
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

            <Button
              onClick={handleSyncFromConfig}
              className="w-full bg-green-600 hover:bg-green-700"
              disabled={isLoading}
            >
              {isLoading ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  Syncing Projects...
                </>
              ) : (
                <>
                  <CheckCircle2 className="h-4 w-4 mr-2" />
                  Sync from Config
                </>
              )}
            </Button>

            <div className="relative">
              <div className="absolute inset-0 flex items-center">
                <span className="w-full border-t" />
              </div>
              <div className="relative flex justify-center text-xs uppercase">
                <span className="bg-background px-2 text-muted-foreground">Or setup manually</span>
              </div>
            </div>
          </div>
        ) : (
          <div className="space-y-4">
            <Alert className="bg-blue-50/50 border-blue-200">
              <Sparkles className="h-4 w-4 text-blue-600" />
              <AlertTitle className="text-blue-800">MDX Preview Support</AlertTitle>
              <AlertDescription className="text-blue-700 text-xs text-pretty">
                We recommend initializing RepoPress in this repo. This adds a config file and preview adapter to enable
                live MDX editing.
              </AlertDescription>
            </Alert>
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-6">
          <div className="space-y-2">
            <Label htmlFor="branch">Branch</Label>
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
            <Label htmlFor="framework">Framework</Label>
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
            <Label htmlFor="path">Content Root</Label>
            <div className="relative">
              <Folder className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
              <Input
                id="path"
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
            <Label htmlFor="contentType">Content Type</Label>
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

          <div className="pt-2 space-y-3">
            {!repoConfig && (
              <Button
                type="button"
                variant="outline"
                className="w-full border-blue-200 text-blue-700 hover:bg-blue-50"
                onClick={handleInitRepoPress}
                disabled={isInitializing || isLoading}
              >
                {isInitializing ? (
                  <>
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                    Initializing...
                  </>
                ) : (
                  <>
                    <Sparkles className="h-4 w-4 mr-2" />
                    Initialize with Config (Recommended)
                  </>
                )}
              </Button>
            )}

            <Button type="submit" className="w-full" disabled={isLoading || isInitializing || !user}>
              {isLoading ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  Creating project...
                </>
              ) : (
                "Create Project (Legacy Mode)"
              )}
            </Button>
          </div>
        </form>
      </CardContent>
    </Card>
  )
}
