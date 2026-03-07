import type { RepoPressPreviewAdapter } from "@/lib/repopress/evaluate-adapter"
import { standardComponents } from "@/lib/repopress/standard-library"

export function buildMergedContext(
  adapter: RepoPressPreviewAdapter | null,
  plugins: Record<string, RepoPressPreviewAdapter>,
): RepoPressPreviewAdapter {
  const result: RepoPressPreviewAdapter = {
    components: { ...standardComponents },
    scope: {},
    allowImports: {},
  }

  for (const plugin of Object.values(plugins)) {
    if (plugin.components) {
      result.components = { ...result.components, ...plugin.components }
    }
    if (plugin.scope) {
      result.scope = { ...result.scope, ...plugin.scope }
    }
    if (plugin.allowImports) {
      for (const [moduleName, exports] of Object.entries(plugin.allowImports)) {
        result.allowImports![moduleName] = {
          ...(result.allowImports![moduleName] || {}),
          ...(exports as object),
        }
      }
    }
    if (plugin.resolveAssetUrl) {
      result.resolveAssetUrl = plugin.resolveAssetUrl
    }
  }

  if (adapter?.components) {
    result.components = { ...result.components, ...adapter.components }
  }
  if (adapter?.scope) {
    result.scope = { ...result.scope, ...adapter.scope }
  }
  if (adapter?.allowImports) {
    for (const [moduleName, exports] of Object.entries(adapter.allowImports)) {
      result.allowImports![moduleName] = {
        ...(result.allowImports![moduleName] || {}),
        ...(exports as object),
      }
    }
  }
  if (adapter?.resolveAssetUrl) {
    result.resolveAssetUrl = adapter.resolveAssetUrl
  }

  return result
}
