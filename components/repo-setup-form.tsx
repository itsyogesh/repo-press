"use client"

import type React from "react"

import { useState } from "react"
import { useRouter } from "next/navigation"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Label } from "@/components/ui/label"
import { Input } from "@/components/ui/input"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { GitBranch, Folder } from "lucide-react"

interface RepoSetupFormProps {
  owner: string
  repo: string
  branches: any[]
  defaultBranch: string
}

export function RepoSetupForm({ owner, repo, branches, defaultBranch }: RepoSetupFormProps) {
  const router = useRouter()
  const [selectedBranch, setSelectedBranch] = useState(defaultBranch)
  const [contentPath, setContentPath] = useState("")
  const [isLoading, setIsLoading] = useState(false)

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    setIsLoading(true)

    // Construct the URL with query parameters
    const params = new URLSearchParams()
    if (selectedBranch) params.set("branch", selectedBranch)
    if (contentPath) params.set("path", contentPath)

    router.push(`/dashboard/${owner}/${repo}?${params.toString()}`)
  }

  return (
    <Card className="w-full max-w-md mx-auto">
      <CardHeader>
        <CardTitle>Configure Repository</CardTitle>
        <CardDescription>Select the branch and folder you want to manage.</CardDescription>
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
            <Label htmlFor="path">Content Folder (Optional)</Label>
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
            <p className="text-xs text-muted-foreground">Leave empty to manage the root directory.</p>
          </div>

          <Button type="submit" className="w-full" disabled={isLoading}>
            {isLoading ? "Setting up..." : "Start Managing Content"}
          </Button>
        </form>
      </CardContent>
    </Card>
  )
}
