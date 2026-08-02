import { type NextRequest, NextResponse } from "next/server"
import { canServeDeploymentRequest } from "@/lib/deployment-role"

const DASHBOARD_PATH = "/dashboard"
const CONVEX_JWT_COOKIE_NAMES = ["better-auth.convex_jwt", "convex_jwt"] as const

function getAuthSignals(request: NextRequest) {
  const hasConvexJwt = CONVEX_JWT_COOKIE_NAMES.some((cookieName) => Boolean(request.cookies.get(cookieName)?.value))
  const hasPatAuth = Boolean(request.cookies.get("github_pat")?.value)

  return {
    hasConvexJwt,
    hasPatAuth,
    isAuthenticated: hasConvexJwt || hasPatAuth,
  }
}

export function proxy(request: NextRequest) {
  const { pathname, searchParams } = request.nextUrl

  if (!canServeDeploymentRequest(pathname, request.method)) {
    return new NextResponse("Not Found", {
      status: 404,
      headers: {
        "Cache-Control": "no-store",
        "Content-Type": "text/plain; charset=utf-8",
        "X-Content-Type-Options": "nosniff",
      },
    })
  }

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
  matcher: ["/((?!_next/static).*)"],
}
