import { NextResponse } from "next/server"
import { getGitHubToken } from "@/lib/auth-server"
import { saveFileContent } from "@/lib/github"

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

    // content is expected to be base64 encoded
    const decodedContent = Buffer.from(content, "base64").toString("utf-8")

    const result = await saveFileContent(token, owner, repo, path, decodedContent, sha, message, branch)

    if (!result.content || !result.commit) {
      return NextResponse.json({ error: "Failed to upload image" }, { status: 500 })
    }

    return NextResponse.json({
      path,
      sha: result.content.sha,
      commitSha: result.commit.sha,
      url: result.content.html_url,
    })
  } catch (error) {
    console.error("Error uploading image:", error)
    return NextResponse.json({ error: "Failed to upload image" }, { status: 500 })
  }
}
