import { NextResponse } from "next/server"
import { getGitHubToken } from "@/lib/auth-server"
import { getFile } from "@/lib/github"

export async function GET(request: Request) {
  const token = await getGitHubToken()
  if (!token) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  const { searchParams } = new URL(request.url)
  const owner = searchParams.get("owner")
  const repo = searchParams.get("repo")
  const path = searchParams.get("path")
  const branch = searchParams.get("branch") || undefined

  if (!owner || !repo || !path) {
    return NextResponse.json({ error: "Missing required query params: owner, repo, path" }, { status: 400 })
  }

  try {
    const file = await getFile(token, owner, repo, path, branch)
    if (!file) {
      return NextResponse.json({ error: "File not found" }, { status: 404 })
    }

    return NextResponse.json({
      path: file.path,
      name: file.name,
      sha: file.sha,
      content: file.content,
    })
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Failed to fetch file"
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
