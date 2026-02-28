import crypto from "crypto"
import { ConvexHttpClient } from "convex/browser"
import { NextResponse } from "next/server"
import { api } from "@/convex/_generated/api"

const convex = new ConvexHttpClient(process.env.NEXT_PUBLIC_CONVEX_URL!)

function verifySignature(payload: string, signature: string | null, secret: string): boolean {
  if (!signature) return false
  const expected = `sha256=${crypto.createHmac("sha256", secret).update(payload).digest("hex")}`
  const sigBuf = Buffer.from(signature)
  const expBuf = Buffer.from(expected)
  if (sigBuf.length !== expBuf.length) return false
  return crypto.timingSafeEqual(sigBuf, expBuf)
}

export async function POST(request: Request) {
  const secret = process.env.GITHUB_WEBHOOK_SECRET
  if (!secret) {
    console.error("GITHUB_WEBHOOK_SECRET not configured")
    return NextResponse.json({ error: "Webhook not configured" }, { status: 500 })
  }

  const payload = await request.text()
  const signature = request.headers.get("x-hub-signature-256")

  if (!verifySignature(payload, signature, secret)) {
    return NextResponse.json({ error: "Invalid signature" }, { status: 401 })
  }

  const event = request.headers.get("x-github-event")
  if (event !== "pull_request") {
    // We only handle pull_request events
    return NextResponse.json({ ok: true, skipped: true })
  }

  try {
    const data = JSON.parse(payload)
    const { action, pull_request } = data

    if (!pull_request) {
      return NextResponse.json({ ok: true, skipped: true })
    }

    const prNumber = pull_request.number as number
    const merged = pull_request.merged as boolean
    const mergeCommitSha = pull_request.merge_commit_sha as string | null

    if (action === "closed" && merged && mergeCommitSha) {
      // PR was merged -- trigger publish
      await convex.mutation(api.githubWebhook.handlePRMerged, {
        prNumber,
        mergeCommitSha,
      })
      return NextResponse.json({ ok: true, action: "merged" })
    }

    if (action === "closed" && !merged) {
      // PR was closed without merge
      await convex.mutation(api.githubWebhook.handlePRClosed, {
        prNumber,
      })
      return NextResponse.json({ ok: true, action: "closed" })
    }

    return NextResponse.json({ ok: true, skipped: true })
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Webhook processing failed"
    console.error("Webhook handler error:", error)
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
