import * as jsxRuntime from "react/jsx-runtime"
import { Fragment } from "react"

export function evaluateMdx(code: string, scope: Record<string, unknown>, onMissing?: (name: string) => void) {
  const mdxConfig = {
    ...jsxRuntime,
    Fragment,
    useMDXComponents: (components: any) => components || {},
    _missingMdxReference: (name: string, component: boolean) => {
      console.warn(`Missing MDX reference: ${name} (isComponent: ${component})`)
      if (onMissing) onMissing(name)
      // Return a placeholder component if it's a component, otherwise a string
      if (component) {
        return function MissingComponent(props: any) {
          return jsxRuntime.jsx("div", {
            style: {
              border: "1px dashed red",
              padding: "1rem",
              margin: "1rem 0",
              textAlign: "left",
            },
            children: [jsxRuntime.jsx("code", { children: `<${name} />` }), props.children],
          })
        }
      }
      return `[Missing ${name}]`
    },
  }

  // Create a list of pairs to ensure key/value alignment
  const pairs = Object.entries(scope)
  // Add _missingMdxReference to scope so it's available as a local variable
  pairs.push(["_missingMdxReference", mdxConfig._missingMdxReference])

  const keys = pairs.map(([k]) => k)
  const values = pairs.map(([, v]) => v)

  // Create a new function where the first argument is the config expected by MDX,
  // followed by any scope variables we want to inject.
  const fn = new Function("_mdxConfig", ...keys, code)

  // Execute to get the module exports
  const result = fn(mdxConfig, ...values)

  return result.default
}
