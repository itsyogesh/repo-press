"use client"

import { Github, Info, LogOut, Moon, Sun } from "lucide-react"
import { useTheme } from "next-themes"
import { clearGitHubPAT } from "@/app/login/actions"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Label } from "@/components/ui/label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Separator } from "@/components/ui/separator"
import { Skeleton } from "@/components/ui/skeleton"
import { signOut, useSession } from "@/lib/auth-client"

export function AppSettingsContent() {
  const { data: session, isPending } = useSession()
  const { theme, setTheme } = useTheme()

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
          <Skeleton className="h-48 w-full rounded-lg" />
          <Skeleton className="h-48 w-full rounded-lg" />
        </div>
      </div>
    )
  }

  return (
    <div className="mx-auto w-full max-w-2xl px-4 py-10 sm:px-6">
      <div className="flex flex-col gap-8">
        <div>
          <p className="font-mono text-[0.72rem] uppercase tracking-[0.24em] text-muted-foreground">Preferences</p>
          <h1 className="mt-3 text-3xl font-semibold tracking-[-0.05em] text-foreground">Settings</h1>
        </div>

        {/* Appearance */}
        <Card className="border-border/70">
          <CardHeader className="pb-3">
            <CardTitle className="text-base font-medium">Appearance</CardTitle>
            <CardDescription>Customize how RepoPress looks on your device.</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                {theme === "dark" ? (
                  <Moon className="h-4 w-4 text-muted-foreground" />
                ) : (
                  <Sun className="h-4 w-4 text-muted-foreground" />
                )}
                <Label htmlFor="theme-select" className="text-sm font-normal">
                  Theme
                </Label>
              </div>
              <Select value={theme ?? "system"} onValueChange={setTheme}>
                <SelectTrigger id="theme-select" className="w-32">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="light">Light</SelectItem>
                  <SelectItem value="dark">Dark</SelectItem>
                  <SelectItem value="system">System</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </CardContent>
        </Card>

        {/* Account */}
        <Card className="border-border/70">
          <CardHeader className="pb-3">
            <CardTitle className="text-base font-medium">Account</CardTitle>
            <CardDescription>Your connected GitHub account.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex items-center justify-between rounded-lg border border-border/70 bg-muted/30 px-4 py-3">
              <div className="flex items-center gap-3">
                <Github className="h-5 w-5 text-muted-foreground" />
                <div>
                  <p className="text-sm font-medium text-foreground">{user?.name ?? "GitHub"}</p>
                  <p className="text-xs text-muted-foreground">{user?.email ?? "Connected"}</p>
                </div>
              </div>
              <span className="rounded-full bg-studio-success-muted px-2 py-0.5 text-[0.65rem] font-medium text-studio-success">
                Active
              </span>
            </div>

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
          </CardContent>
        </Card>

        {/* About */}
        <Card className="border-border/70">
          <CardHeader className="pb-3">
            <CardTitle className="text-base font-medium">About</CardTitle>
            <CardDescription>RepoPress - Git-native headless CMS.</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="flex items-start gap-3">
              <Info className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />
              <div className="space-y-1 text-sm text-muted-foreground">
                <p>
                  Content stays in Git. Operational state lives in Convex. Visual MDX editing with draft/publish
                  workflows.
                </p>
                <p className="font-mono text-xs">v0.1.0</p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
