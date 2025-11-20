import { createClient } from "@/lib/supabase/server"
import { saveFileContent } from "@/lib/github"
import { NextResponse } from "next/server"
import { cookies } from "next/headers"

export async function POST(request: Request) {
  const supabase = await createClient()
  const {
    data: { session },
  } = await supabase.auth.getSession()

  const cookieStore = await cookies()
  const pat = cookieStore.get("github_pat")?.value
  const token = session?.provider_token || pat

  if (!token) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  try {
    const body = await request.json()
    const { owner, repo, path, content, sha, message, branch } = body

    if (!owner || !repo || !path || !content) {
      return NextResponse.json({ error: "Missing required fields" }, { status: 400 })
    }

    const result = await saveFileContent(token, owner, repo, path, content, sha, message, branch)

    return NextResponse.json(result)
  } catch (error) {
    console.error("Error saving file:", error)
    return NextResponse.json({ error: "Failed to save file" }, { status: 500 })
  }
}
