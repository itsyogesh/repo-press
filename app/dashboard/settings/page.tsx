import { redirect } from "next/navigation"
import { AppSettingsContent } from "@/components/dashboard/app-settings-content"
import { getGitHubToken } from "@/lib/auth-server"

export default async function AppSettingsPage() {
  const token = await getGitHubToken()

  if (!token) {
    redirect("/login")
  }

  return <AppSettingsContent />
}
