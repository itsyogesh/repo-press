"use client"

import { createClient } from "@/lib/supabase/client"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import { Github, Key, AlertCircle, Eye, EyeOff } from "lucide-react"
import { useState } from "react"
import { loginWithPAT } from "./actions"
import { useSearchParams } from "next/navigation"

export default function LoginPage() {
  const [isLoading, setIsLoading] = useState(false)
  const [showToken, setShowToken] = useState(false)
  const searchParams = useSearchParams()
  const error = searchParams.get("error")

  const handleLogin = async () => {
    const supabase = createClient()
    setIsLoading(true)

    try {
      const { error } = await supabase.auth.signInWithOAuth({
        provider: "github",
        options: {
          redirectTo: `${window.location.origin}/auth/callback`,
          scopes: "repo user",
        },
      })
      if (error) throw error
    } catch (error) {
      console.error("Error logging in:", error)
    } finally {
      setIsLoading(false)
    }
  }

  return (
    <div className="flex min-h-svh w-full items-center justify-center p-6 md:p-10 bg-muted/20">
      <div className="w-full max-w-sm">
        <Card>
          <CardHeader className="text-center">
            <CardTitle className="text-2xl">Welcome to RepoPress</CardTitle>
            <CardDescription>Sign in to manage your content</CardDescription>
          </CardHeader>
          <CardContent>
            {error === "invalid_token" && (
              <Alert variant="destructive" className="mb-4 text-left">
                <AlertCircle className="h-4 w-4" />
                <AlertTitle>Authentication Failed</AlertTitle>
                <AlertDescription>
                  Your session has expired or your token is invalid. Please sign in again.
                </AlertDescription>
              </Alert>
            )}

            <Tabs defaultValue="oauth" className="w-full">
              <TabsList className="grid w-full grid-cols-2 mb-4">
                <TabsTrigger value="oauth">GitHub OAuth</TabsTrigger>
                <TabsTrigger value="pat">Personal Token</TabsTrigger>
              </TabsList>
              <TabsContent value="oauth">
                <div className="flex flex-col gap-4">
                  <p className="text-sm text-muted-foreground text-center">
                    Connect directly with your GitHub account. Best for most users.
                  </p>
                  <Button className="w-full" onClick={handleLogin} disabled={isLoading}>
                    {isLoading ? (
                      "Connecting..."
                    ) : (
                      <>
                        <Github className="mr-2 h-4 w-4" />
                        Sign in with GitHub
                      </>
                    )}
                  </Button>
                </div>
              </TabsContent>
              <TabsContent value="pat">
                <form action={loginWithPAT} className="flex flex-col gap-4">
                  <div className="grid gap-2">
                    <Label htmlFor="token">Personal Access Token</Label>
                    <div className="relative">
                      <Input
                        id="token"
                        name="token"
                        type={showToken ? "text" : "password"}
                        placeholder="ghp_..."
                        required
                        className="font-mono pr-10"
                      />
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        className="absolute right-0 top-0 h-full px-3 py-2 hover:bg-transparent"
                        onClick={() => setShowToken(!showToken)}
                      >
                        {showToken ? (
                          <EyeOff className="h-4 w-4 text-muted-foreground" />
                        ) : (
                          <Eye className="h-4 w-4 text-muted-foreground" />
                        )}
                        <span className="sr-only">{showToken ? "Hide token" : "Show token"}</span>
                      </Button>
                    </div>
                    <p className="text-xs text-muted-foreground">
                      Token must have <code>repo</code> scope.
                    </p>
                  </div>
                  <Button type="submit" className="w-full">
                    <Key className="mr-2 h-4 w-4" />
                    Continue with Token
                  </Button>
                </form>
              </TabsContent>
            </Tabs>
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
