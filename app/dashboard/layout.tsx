import { redirect } from "next/navigation"
import type { ReactNode } from "react"
import { DashboardProviders } from "@/components/dashboard/dashboard-providers"
import { DashboardShell } from "@/components/dashboard/dashboard-shell"
import { getGitHubToken } from "@/lib/auth-server"

export default async function DashboardLayout({ children }: { children: ReactNode }) {
  const token = await getGitHubToken()
  if (!token) {
    redirect("/login")
  }

  return (
    <DashboardProviders>
      <DashboardShell>{children}</DashboardShell>
    </DashboardProviders>
  )
}
