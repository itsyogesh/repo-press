import { getSessionCookie } from "better-auth/cookies"
import { type NextRequest, NextResponse } from "next/server"

const DASHBOARD_PATH = "/dashboard"

function hasAuthSession(request: NextRequest) {
  const sessionCookie = getSessionCookie(request)
  const patCookie = request.cookies.get("github_pat")?.value
  return Boolean(sessionCookie || patCookie)
}

export function proxy(request: NextRequest) {
  const { pathname, searchParams } = request.nextUrl
  const isAuthenticated = hasAuthSession(request)
  const isDashboardRoute = pathname === DASHBOARD_PATH || pathname.startsWith(`${DASHBOARD_PATH}/`)
  const isLoginRoute = pathname === "/login" || pathname.startsWith("/login/")
  const isMarketingRoot = pathname === "/"

  if (!isAuthenticated && isDashboardRoute) {
    const url = request.nextUrl.clone()
    url.pathname = "/login"
    return NextResponse.redirect(url)
  }

  // Allow explicit relogin/error states to avoid redirect loops with stale cookies.
  const hasLoginError = searchParams.has("error")
  if (isAuthenticated && (isMarketingRoot || (isLoginRoute && !hasLoginError))) {
    const url = request.nextUrl.clone()
    url.pathname = DASHBOARD_PATH
    url.search = ""
    return NextResponse.redirect(url)
  }

  return NextResponse.next()
}

export const config = {
  matcher: ["/", "/login/:path*", "/dashboard/:path*"],
}
