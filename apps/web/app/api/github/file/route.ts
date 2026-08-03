import { NextResponse } from "next/server"
import { getGitHubToken } from "@/lib/auth-server"
import { getFile } from "@/lib/github"
import { isValidFilePath, isValidGitHubName } from "@/lib/route-validation"

export async function GET(request: Request) {
  const token = await getGitHubToken()
  if (!token) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  const { searchParams } = new URL(request.url)
  const owner = searchParams.get("owner")
  const repo = searchParams.get("repo")
  const path = searchParams.get("path")
  const ref = searchParams.get("ref") || searchParams.get("branch") || undefined

  if (!owner || !repo || !path) {
    return NextResponse.json({ error: "Missing required query params: owner, repo, path" }, { status: 400 })
  }

  if (!isValidGitHubName(owner)) {
    return NextResponse.json({ error: "Invalid owner format" }, { status: 400 })
  }
  if (!isValidGitHubName(repo)) {
    return NextResponse.json({ error: "Invalid repo format" }, { status: 400 })
  }
  if (!isValidFilePath(path)) {
    return NextResponse.json({ error: "Invalid file path" }, { status: 400 })
  }

  try {
    const file = await getFile(token, owner, repo, path, ref)
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
    console.error("Error fetching file:", error)
    return NextResponse.json({ error: "Failed to fetch file" }, { status: 500 })
  }
}
