import { NextResponse } from "next/server"
import { handler } from "@/lib/auth-server"

const fallback = () =>
  NextResponse.json(
    { error: "Auth not configured. Set NEXT_PUBLIC_CONVEX_URL and NEXT_PUBLIC_CONVEX_SITE_URL." },
    { status: 503 },
  )

export const GET = handler?.GET ?? fallback
export const POST = handler?.POST ?? fallback
