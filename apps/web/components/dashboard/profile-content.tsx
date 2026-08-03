"use client"

import { ExternalLink, Github, LogOut, Mail } from "lucide-react"
import { clearGitHubPAT } from "@/app/login/actions"
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Separator } from "@/components/ui/separator"
import { Skeleton } from "@/components/ui/skeleton"
import { signOut, useSession } from "@/lib/auth-client"

function getInitials(name?: string | null): string {
  if (!name) return "?"
  return name
    .split(" ")
    .map((part) => part[0])
    .join("")
    .toUpperCase()
    .slice(0, 2)
}

export function ProfileContent() {
  const { data: session, isPending } = useSession()
  const user = session?.user

  async function handleLogout() {
    await signOut()
    await clearGitHubPAT()
    window.location.href = "/login"
  }

  if (isPending) {
    return (
      <div className="mx-auto w-full max-w-2xl px-4 py-10 sm:px-6">
        <div className="flex flex-col gap-6">
          <Skeleton className="h-8 w-48" />
          <Skeleton className="h-64 w-full rounded-lg" />
        </div>
      </div>
    )
  }

  if (!user) {
    return (
      <div className="mx-auto w-full max-w-2xl px-4 py-10 sm:px-6">
        <p className="text-muted-foreground">Unable to load profile. Please sign in again.</p>
      </div>
    )
  }

  const displayName = user.name ?? user.email ?? "User"
  const avatarUrl = user.image ?? undefined
  const githubUrl = user.name ? `https://github.com/${user.name}` : undefined

  return (
    <div className="mx-auto w-full max-w-2xl px-4 py-10 sm:px-6">
      <div className="flex flex-col gap-8">
        <div>
          <p className="font-mono text-[0.72rem] uppercase tracking-[0.24em] text-muted-foreground">Account</p>
          <h1 className="rp-display mt-3 text-2xl">Profile</h1>
        </div>

        <Card className="overflow-hidden border-border/70">
          <CardContent className="p-6 sm:p-8">
            <div className="flex flex-col gap-6 sm:flex-row sm:items-start">
              <Avatar className="h-20 w-20 shrink-0 rounded-full">
                <AvatarImage src={avatarUrl} alt={displayName} />
                <AvatarFallback className="rounded-full text-lg">{getInitials(displayName)}</AvatarFallback>
              </Avatar>

              <div className="min-w-0 flex-1 space-y-4">
                <div>
                  <h2 className="rp-display text-xl">{displayName}</h2>
                  {user.email && (
                    <p className="mt-1 flex items-center gap-1.5 text-sm text-muted-foreground">
                      <Mail className="h-3.5 w-3.5 shrink-0" />
                      <span className="truncate">{user.email}</span>
                    </p>
                  )}
                </div>

                {githubUrl && (
                  <a
                    href={githubUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-1.5 text-sm text-muted-foreground transition-colors hover:text-foreground"
                  >
                    <Github className="h-3.5 w-3.5" />
                    View GitHub profile
                    <ExternalLink className="h-3 w-3" />
                  </a>
                )}
              </div>
            </div>
          </CardContent>
        </Card>

        <Card className="border-border/70">
          <CardHeader className="pb-3">
            <CardTitle className="text-base font-medium">Connected account</CardTitle>
            <CardDescription>Your GitHub account linked to RepoPress.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex items-center justify-between rounded-lg border border-border/70 bg-muted/30 px-4 py-3">
              <div className="flex items-center gap-3">
                <Github className="h-5 w-5 text-muted-foreground" />
                <div>
                  <p className="text-sm font-medium text-foreground">GitHub</p>
                  <p className="text-xs text-muted-foreground">{user.email ?? "Connected"}</p>
                </div>
              </div>
              <span className="rounded-full bg-studio-success-muted px-2 py-0.5 text-[0.65rem] font-medium text-studio-success">
                Active
              </span>
            </div>
          </CardContent>
        </Card>

        <Separator className="bg-border/50" />

        <div className="flex items-center justify-between">
          <div>
            <p className="text-sm font-medium text-foreground">Sign out</p>
            <p className="text-xs text-muted-foreground">Sign out of RepoPress on this device.</p>
          </div>
          <Button variant="outline" size="sm" onClick={handleLogout}>
            <LogOut className="h-4 w-4" />
            Sign out
          </Button>
        </div>
      </div>
    </div>
  )
}
