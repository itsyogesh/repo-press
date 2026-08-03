const AUTH_CALLBACK_PATH = "/api/auth/callback/github"
const INVALID_SITE_URL_MESSAGE = "SITE_URL must be an absolute HTTPS application origin or an HTTP localhost origin"

function isLocalHostname(hostname: string) {
  return hostname === "localhost" || hostname === "127.0.0.1" || hostname === "[::1]"
}

export function resolveAuthOrigin(value: string | undefined) {
  if (!value?.trim()) throw new Error(INVALID_SITE_URL_MESSAGE)

  try {
    const trimmed = value.trim()
    const url = new URL(trimmed)
    if (
      (url.protocol !== "https:" && !(url.protocol === "http:" && isLocalHostname(url.hostname))) ||
      url.origin === "null" ||
      url.username ||
      url.password ||
      (url.pathname !== "/" && url.pathname !== "") ||
      url.search ||
      url.hash
    ) {
      throw new Error(INVALID_SITE_URL_MESSAGE)
    }

    const siteUrl = url.origin
    return {
      githubCallbackURL: `${siteUrl}${AUTH_CALLBACK_PATH}`,
      siteUrl,
      trustedOrigins: [siteUrl],
    }
  } catch (error) {
    if (error instanceof Error && error.message === INVALID_SITE_URL_MESSAGE) throw error
    throw new Error(INVALID_SITE_URL_MESSAGE)
  }
}
