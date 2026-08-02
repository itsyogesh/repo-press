const SANDBOX_PATH = "/preview/sandbox"
const NEXT_ASSET_PREFIX = "/_next/static/"
const PUBLIC_ASSET_EXTENSION = /\.(?:svg|png|jpe?g|gif|webp|ico|woff2?|ttf|wasm)$/i

export function canServeDeploymentPath(pathname: string, deploymentRole = process.env.REPOPRESS_DEPLOYMENT_ROLE) {
  if (deploymentRole !== "sandbox") return true
  if (pathname === SANDBOX_PATH) return true
  if (pathname.startsWith(NEXT_ASSET_PREFIX)) return true
  return PUBLIC_ASSET_EXTENSION.test(pathname)
}
