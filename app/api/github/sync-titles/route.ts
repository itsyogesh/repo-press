import { ConvexHttpClient } from "convex/browser"
import { NextResponse } from "next/server"
import { api } from "@/convex/_generated/api"
import type { Id } from "@/convex/_generated/dataModel"
import { getGitHubToken } from "@/lib/auth-server"

const convex = new ConvexHttpClient(process.env.NEXT_PUBLIC_CONVEX_URL!)

export async function POST(request: Request) {
  const token = await getGitHubToken()
  if (!token) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  try {
    const body = await request.json()
    const { projectId, owner, repo, branch, files } = body

    if (!projectId || !owner || !repo || !branch || !files) {
      return NextResponse.json({ error: "Missing required fields" }, { status: 400 })
    }

    // Call the Convex action with the server-side token
    await convex.action(api.documents.syncTreeTitles, {
      projectId: projectId as Id<"projects">,
      owner,
      repo,
      branch,
      files,
      githubToken: token,
    })

    return NextResponse.json({ ok: true })
  } catch (error) {
    console.error("Error syncing titles:", error)
    return NextResponse.json({ error: "Failed to sync titles" }, { status: 500 })
  }
}
