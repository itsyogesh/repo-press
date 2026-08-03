import { redirect } from "next/navigation"
import { ProfileContent } from "@/components/dashboard/profile-content"
import { getGitHubToken } from "@/lib/auth-server"

export default async function ProfilePage() {
  const token = await getGitHubToken()

  if (!token) {
    redirect("/login")
  }

  return <ProfileContent />
}
