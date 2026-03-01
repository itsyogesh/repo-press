import { redirect } from "next/navigation"
import Link from "next/link"
import { getGitHubToken, fetchAuthQuery } from "@/lib/auth-server"
import { api } from "@/convex/_generated/api"
import { RepoBreadcrumb } from "@/components/repo-breadcrumb"
import { Button } from "@/components/ui/button"
import { ChevronLeft, Settings } from "lucide-react"
import { DeleteProjectZone } from "@/components/settings/delete-project-zone"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Separator } from "@/components/ui/separator"
import { Badge } from "@/components/ui/badge"

interface SettingsPageProps {
  params: Promise<{
    owner: string
    repo: string
  }>
}

export default async function SettingsPage({ params }: SettingsPageProps) {
  const token = await getGitHubToken()

  if (!token) {
    redirect("/login")
  }

  const { owner, repo } = await params

  // Fetch projects for this repo
  const projects = await fetchAuthQuery!(api.projects.listMyProjectsForRepo, {
    repoOwner: owner,
    repoName: repo,
  })

  return (
    <div className="container mx-auto py-8 px-4 max-w-5xl">
      <div className="flex flex-col gap-8">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-4">
            <Button variant="ghost" size="icon" asChild className="h-8 w-8">
              <Link href={`/dashboard/${owner}/${repo}`}>
                <ChevronLeft className="h-4 w-4" />
              </Link>
            </Button>
            <RepoBreadcrumb owner={owner} repo={repo} path={["settings"]} />
          </div>
          <div className="flex gap-2">
            <Button variant="outline" asChild>
              <Link href={`/dashboard/${owner}/${repo}`}>Back to Repo</Link>
            </Button>
          </div>
        </div>

        <div className="flex flex-col gap-2">
          <div className="flex items-center gap-2">
            <Settings className="h-6 w-6 text-muted-foreground" />
            <h1 className="text-3xl font-bold tracking-tight text-foreground">Project Settings</h1>
          </div>
          <p className="text-muted-foreground">
            Manage your projects for {owner}/{repo}
          </p>
        </div>

        <div className="grid gap-6">
          {projects && projects.length > 0 ? (
            projects.map((project) => (
              <Card key={project._id} className="overflow-hidden border-studio-border bg-studio-canvas shadow-sm">
                <CardHeader className="pb-4">
                  <div className="flex items-start justify-between">
                    <div className="space-y-1">
                      <div className="flex items-center gap-2">
                        <CardTitle className="text-xl">{project.name}</CardTitle>
                        <Badge
                          variant="secondary"
                          className="h-5 px-1.5 text-[10px] uppercase font-bold tracking-tight bg-muted/50"
                        >
                          {project.contentType}
                        </Badge>
                      </div>
                      <CardDescription className="text-sm italic">
                        {project.contentRoot || "Root directory"} • {project.branch}
                      </CardDescription>
                    </div>
                  </div>
                </CardHeader>
                <CardContent className="space-y-6 pt-0">
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-sm">
                    <div className="space-y-1">
                      <p className="text-muted-foreground text-xs font-bold uppercase tracking-wider">Source</p>
                      <p className="font-mono bg-muted/30 px-2 py-1 rounded border text-[12px] inline-block">
                        {project.frameworkSource === "config" ? "repopress.config.json" : "Manual / Detected"}
                      </p>
                    </div>
                    <div className="space-y-1">
                      <p className="text-muted-foreground text-xs font-bold uppercase tracking-wider">Framework</p>
                      <p className="font-medium">{project.detectedFramework || "Generic"}</p>
                    </div>
                  </div>

                  <Separator className="bg-studio-border/50" />

                  <div className="pt-2">
                    <DeleteProjectZone project={project} />
                  </div>
                </CardContent>
              </Card>
            ))
          ) : (
            <div className="text-center py-12 border-2 border-dashed rounded-xl bg-muted/5">
              <p className="text-muted-foreground">No projects found for this repository.</p>
              <Button variant="link" asChild className="mt-2">
                <Link href={`/dashboard/${owner}/${repo}/setup`}>Configure a project</Link>
              </Button>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
