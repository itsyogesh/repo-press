"use client"

import type React from "react"

import { useState } from "react"
import { useRouter } from "next/navigation"
import { useMutation, useQuery } from "convex/react"
import { api } from "@/convex/_generated/api"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Label } from "@/components/ui/label"
import { Input } from "@/components/ui/input"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { GitBranch, Folder, Loader2 } from "lucide-react"
import { toast } from "sonner"

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
  }
}

export function RepoSetupForm({ owner, repo, branches, defaultBranch, frameworkConfig }: RepoSetupFormProps) {
  const router = useRouter()
  const user = useQuery(api.auth.getCurrentUser)
  const getOrCreateProject = useMutation(api.projects.getOrCreate)

  const [selectedBranch, setSelectedBranch] = useState(defaultBranch)
  const [contentPath, setContentPath] = useState(frameworkConfig.suggestedContentRoots[0] || "")
  const [contentType, setContentType] = useState<string>(frameworkConfig.contentType)
  const [isLoading, setIsLoading] = useState(false)

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()

    if (!user?._id) {
      toast.error("Not authenticated. Please sign in again.")
      return
    }

    setIsLoading(true)

    try {
      await getOrCreateProject({
        userId: user._id,
        name: `${owner}/${repo}`,
        repoOwner: owner,
        repoName: repo,
        branch: selectedBranch,
        contentRoot: contentPath,
        detectedFramework: frameworkConfig.framework as
          | "fumadocs" | "nextra" | "astro" | "hugo" | "docusaurus" | "jekyll" | "contentlayer" | "next-mdx" | "custom"
          | undefined,
        contentType: contentType as "blog" | "docs" | "pages" | "changelog" | "custom",
        frontmatterSchema: frameworkConfig.frontmatterFields,
      })

      toast.success("Project created successfully!")
      router.push(`/dashboard/${owner}/${repo}/studio?branch=${selectedBranch}`)
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
        <CardTitle>Configure Repository</CardTitle>
        <CardDescription>
          {frameworkConfig.framework !== "custom" ? (
            <>Detected <span className="font-medium text-foreground">{frameworkConfig.framework}</span> framework. Configure your content settings below.</>
          ) : (
            "Select the branch and folder you want to manage."
          )}
        </CardDescription>
      </CardHeader>
      <CardContent>
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
            {frameworkConfig.suggestedContentRoots.length > 1 && (
              <div className="flex flex-wrap gap-1 mt-1">
                {frameworkConfig.suggestedContentRoots.map((root) => (
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
            )}
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

          <Button type="submit" className="w-full" disabled={isLoading || !user}>
            {isLoading ? (
              <>
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                Creating project...
              </>
            ) : (
              "Create Project"
            )}
          </Button>
        </form>
      </CardContent>
    </Card>
  )
}
