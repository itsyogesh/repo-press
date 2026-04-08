import { NextResponse } from "next/server"
import { getGitHubToken } from "@/lib/auth-server"
import { saveFileContent } from "@/lib/github"
import { isValidFilePath, isValidGitHubName } from "@/lib/route-validation"

export async function POST(request: Request) {
  const token = await getGitHubToken()

  if (!token) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  try {
    const body = await request.json()
    const { owner, repo, path, content, sha, message, branch } = body

    if (!owner || !repo || !path || !content) {
      return NextResponse.json({ error: "Missing required fields" }, { status: 400 })
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

    const result = await saveFileContent(token, owner, repo, path, content, sha, message, branch)

    return NextResponse.json(result)
  } catch (error) {
    console.error("Error saving file:", error)
    return NextResponse.json({ error: "Failed to save file" }, { status: 500 })
  }
}
