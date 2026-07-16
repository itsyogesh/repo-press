import { type NextRequest, NextResponse } from "next/server"

const DASHBOARD_PATH = "/dashboard"
const CONVEX_JWT_COOKIE_NAMES = ["better-auth.convex_jwt", "convex_jwt"] as const
const BETTER_AUTH_SESSION_COOKIE_NAMES = ["better-auth.session_token", "__Secure-better-auth.session_token"] as const

function getAuthSignals(request: NextRequest) {
  const hasConvexJwt = CONVEX_JWT_COOKIE_NAMES.some((cookieName) => Boolean(request.cookies.get(cookieName)?.value))
  const hasBetterAuthSession = BETTER_AUTH_SESSION_COOKIE_NAMES.some((cookieName) =>
    Boolean(request.cookies.get(cookieName)?.value),
  )
  const hasPatAuth = Boolean(request.cookies.get("github_pat")?.value)

  return {
    hasBetterAuthSession,
    hasConvexJwt,
    hasPatAuth,
    isAuthenticated: hasConvexJwt || hasPatAuth || hasBetterAuthSession,
  }
}

export function proxy(request: NextRequest) {
  const { pathname, searchParams } = request.nextUrl
  const { hasPatAuth, isAuthenticated } = getAuthSignals(request)
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
  const shouldRedirectFromLogin = hasPatAuth && !hasLoginError
  if (isAuthenticated && (isMarketingRoot || (isLoginRoute && shouldRedirectFromLogin))) {
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
