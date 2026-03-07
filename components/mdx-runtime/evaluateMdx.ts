import { Fragment } from "react"
import * as jsxRuntime from "react/jsx-runtime"
import { withFunctionConstructorGuard } from "@/lib/repopress/function-constructor-guard"

/**
 * List of global browser APIs that compiled MDX code must NOT access.
 * Used to shadow dangerous globals inside the evaluation sandbox.
 *
 * NOTE: This is a defence-in-depth measure, not a full sandbox.
 * Task 4 (expression sandbox / allowlist evaluator) will replace
 * `new Function()` entirely.
 */
const BLOCKED_GLOBALS = [
  "window",
  "self",
  "globalThis",
  "fetch",
  "XMLHttpRequest",
  "WebSocket",
  "EventSource",
  "localStorage",
  "sessionStorage",
  "indexedDB",
  "document",
  "navigator",
  "location",
  "history",
  "crypto",
  "opener",
  "parent",
  "top",
  "frames",
  "postMessage",
  "importScripts",
  // `eval` cannot be used as a strict-mode function parameter name.
  // Compiled MDX includes `"use strict"`, so shadowing `eval` via `new Function`
  // parameters causes a SyntaxError before evaluation.
  "Function",
] as const

export function evaluateMdx(code: string, scope: Record<string, unknown>, onMissing?: (name: string) => void) {
  const warnedMissing = new Set<string>()

  const mdxConfig = {
    ...jsxRuntime,
    Fragment,
    useMDXComponents: (components: any) => components || {},
    _missingMdxReference: (name: string, component: boolean) => {
      if (!warnedMissing.has(name)) {
        warnedMissing.add(name)
        console.warn(`Missing MDX reference: ${name} (isComponent: ${component})`)
      }
      if (onMissing) onMissing(name)
      // Return a placeholder component if it's a component, otherwise a string
      if (component) {
        return function MissingComponent(props: any) {
          return jsxRuntime.jsxs("div", {
            style: {
              border: "1px dashed red",
              padding: "1rem",
              margin: "1rem 0",
              textAlign: "left",
            },
            children: [
              jsxRuntime.jsx("code", { children: `<${name} />` }),
              props.children
                ? jsxRuntime.jsx("div", {
                    style: { marginTop: "0.5rem" },
                    children: props.children,
                  })
                : null,
            ],
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

  // Fix #2: Shadow dangerous browser globals to prevent exfiltration from MDX content.
  // Each blocked name becomes a function parameter set to `undefined`, which shadows the
  // real global inside the function body produced by `new Function()`.
  for (const name of BLOCKED_GLOBALS) {
    if (!pairs.some(([k]) => k === name)) {
      pairs.push([name, undefined])
    }
  }

  const keys = pairs.map(([k]) => k)
  const values = pairs.map(([, v]) => v)

  // Create a new function where the first argument is the config expected by MDX,
  // followed by any scope variables we want to inject.
  // SECURITY: `new Function()` still executes arbitrary JS — the blocked-globals
  // shadow above is defence-in-depth only. Task 4 will replace this with a proper
  // allowlist evaluator.
  const result = withFunctionConstructorGuard(() => {
    const fn = new Function("_mdxConfig", ...keys, code)
    return fn(mdxConfig, ...values)
  })

  return result.default
}
