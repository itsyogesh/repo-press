import { redirect } from "next/navigation"
import { getGitHubToken } from "@/lib/auth-server"
import LoginPageClient from "./login-page-client"

export default async function LoginPage() {
  const token = await getGitHubToken()

  if (token) {
    redirect("/dashboard")
  }

  return <LoginPageClient />
}
