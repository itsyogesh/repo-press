import * as jsxRuntime from "react/jsx-runtime"
import { Fragment } from "react"

export function evaluateMdx(code: string, scope: Record<string, unknown>) {
  const mdxConfig = {
    ...jsxRuntime,
    Fragment,
    useMDXComponents: () => ({}),
  }

  const scopeKeys = Object.keys(scope)
  const scopeValues = Object.values(scope)

  // Create a new function where the first argument is the config expected by MDX,
  // followed by any scope variables we want to inject.
  const fn = new Function("_mdxConfig", ...scopeKeys, code)

  // Execute to get the module exports
  const result = fn(mdxConfig, ...scopeValues)

  return result.default
}
