const SANDBOX_PATH = "/preview/sandbox"
const NEXT_ASSET_PREFIX = "/_next/static/"
const SANDBOX_PUBLIC_ASSETS = new Set([
  "/apple-icon.png",
  "/esbuild.wasm",
  "/icon-dark-32x32.png",
  "/icon-light-32x32.png",
  "/icon.svg",
])
const READ_ONLY_METHODS = new Set(["GET", "HEAD"])

export function canServeDeploymentRequest(
  pathname: string,
  method: string,
  deploymentRole = process.env.REPOPRESS_DEPLOYMENT_ROLE,
) {
  if (deploymentRole !== "sandbox") return true
  if (!READ_ONLY_METHODS.has(method.toUpperCase())) return false
  if (pathname === SANDBOX_PATH) return true
  if (pathname.startsWith(NEXT_ASSET_PREFIX)) return true
  return SANDBOX_PUBLIC_ASSETS.has(pathname)
}
