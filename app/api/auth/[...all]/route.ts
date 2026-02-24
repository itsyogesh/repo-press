import { NextResponse } from "next/server"
import { handler } from "@/lib/auth-server"

const fallback = () =>
  NextResponse.json(
    { error: "Auth not configured. Set NEXT_PUBLIC_CONVEX_URL and NEXT_PUBLIC_CONVEX_SITE_URL." },
    { status: 503 },
  )

async function proxyWithCookies(request: Request, method: "GET" | "POST") {
  if (!handler) return fallback()
  const response = await handler[method](request)

  // Explicitly forward Set-Cookie headers from the Convex proxy response.
  // Node.js fetch with redirect: "manual" may not properly pass Set-Cookie
  // through Next.js route handlers, so we reconstruct the response.
  const setCookies = response.headers.getSetCookie?.() ?? []

  // Debug: log response details for auth callbacks and sign-in
  const url = new URL(request.url)
  if (url.pathname.includes("/callback/") || url.pathname.includes("/sign-in/")) {
    console.log(`[Auth Proxy] ${method} ${url.pathname} → ${response.status}`)
    console.log(`[Auth Proxy] Location: ${response.headers.get("location")}`)
    console.log(`[Auth Proxy] Set-Cookie count: ${setCookies.length}`)
    for (const cookie of setCookies) {
      const name = cookie.split("=")[0]
      const rest = cookie.split("=").slice(1).join("=")
      const attrs = rest.indexOf(";") >= 0 ? rest.substring(rest.indexOf(";")) : ""
      console.log(`[Auth Proxy]   Cookie: ${name}=<masked>${attrs}`)
    }
  }

  // Reconstruct the response to ensure all headers (especially Set-Cookie) are forwarded
  const newResponse = new NextResponse(response.body, {
    status: response.status,
    statusText: response.statusText,
  })

  // Copy all headers from the proxy response
  response.headers.forEach((value, key) => {
    if (key.toLowerCase() !== "set-cookie") {
      newResponse.headers.set(key, value)
    }
  })

  // Explicitly append each Set-Cookie header individually
  for (const cookie of setCookies) {
    newResponse.headers.append("set-cookie", cookie)
  }

  return newResponse
}

export const GET = (request: Request) => proxyWithCookies(request, "GET")
export const POST = (request: Request) => proxyWithCookies(request, "POST")
