const SANDBOX_PATH = "/preview/sandbox"
const NEXT_ASSET_PREFIXES = ["/_next/static/", "/_next/image"] as const
const PUBLIC_ASSET_EXTENSION = /\.(?:svg|png|jpe?g|gif|webp|ico|woff2?|ttf|wasm)$/i

export function canServeDeploymentPath(pathname: string, deploymentRole = process.env.REPOPRESS_DEPLOYMENT_ROLE) {
  if (deploymentRole !== "sandbox") return true
  if (pathname === SANDBOX_PATH) return true
  if (NEXT_ASSET_PREFIXES.some((prefix) => pathname.startsWith(prefix))) return true
  return PUBLIC_ASSET_EXTENSION.test(pathname)
}
