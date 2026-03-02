"use client"

import React, { useMemo } from "react"
import { REAL_DOCS_SETUP_MEDIA } from "@/lib/repopress/standard-library"
import { GenericJsxEditor } from "./jsx-component-descriptors"
import { safeEvalJsExpression } from "./safe-jsx-prop-eval"
import { useStudioAdapter } from "./studio-adapter-context"
import { useStudio } from "./studio-context"

interface RepoJsxBridgeProps {
  mdastNode: any
  descriptor: any
}

/**
 * Validate extracted props against the component schema (if available).
 * Returns actionable warnings for props that don't match expected types.
 */
function validateProps(componentName: string, props: Record<string, any>, schema: any | undefined): string[] {
  if (!schema?.props || !Array.isArray(schema.props)) return []

  const warnings: string[] = []

  for (const propDef of schema.props) {
    const value = props[propDef.name]

    // Skip undefined — optional props are fine
    if (value === undefined) continue

    // Type validation
    switch (propDef.type) {
      case "number":
        if (typeof value !== "number" && value !== undefined) {
          warnings.push(
            `<${componentName}> prop "${propDef.name}" expected number, got ${typeof value}. Value will be passed as-is.`,
          )
        }
        break
      case "boolean":
        if (typeof value !== "boolean" && value !== undefined) {
          warnings.push(
            `<${componentName}> prop "${propDef.name}" expected boolean, got ${typeof value}. Value will be passed as-is.`,
          )
        }
        break
      case "image":
      case "string":
        if (typeof value !== "string" && value !== undefined) {
          warnings.push(
            `<${componentName}> prop "${propDef.name}" expected string, got ${typeof value}. Value will be coerced.`,
          )
        }
        break
      // "expression" can be any type after evaluation — no validation needed
    }
  }

  return warnings
}

export function RepoJsxBridge({ mdastNode, descriptor }: RepoJsxBridgeProps) {
  const { owner, repo, branch } = useStudio()
  const { adapter, components: componentSchema } = useStudioAdapter()

  const Component = adapter?.components?.[descriptor.name]
  const schema = componentSchema?.[descriptor.name]

  // Extract props from MDAST node attributes
  const { props, propWarnings } = useMemo(() => {
    const attrs = mdastNode.attributes || []
    const result: Record<string, any> = {}
    const evalWarnings: string[] = []

    // Build an evaluation scope for props
    const evalScope = {
      ...(adapter?.scope || {}),
      DOCS_SETUP_MEDIA: (adapter?.scope as any)?.DOCS_SETUP_MEDIA || REAL_DOCS_SETUP_MEDIA,
    }

    attrs.forEach((attr: any) => {
      if (attr.type === "mdxJsxAttribute") {
        if (attr.value?.type === "mdxJsxAttributeValueExpression") {
          const expression = attr.value.value as string
          const evaluated = safeEvalJsExpression(expression, evalScope)
          if (evaluated.ok) {
            result[attr.name] = evaluated.value
          } else {
            // Improved warning: actionable, includes the expression
            evalWarnings.push(
              `<${descriptor.name}> prop "${attr.name}": expression \`${expression}\` could not be evaluated — ${evaluated.reason}. The prop will be undefined in the preview.`,
            )
            result[attr.name] = undefined
          }
        } else {
          result[attr.name] = attr.value
        }
      }
    })

    // Validate extracted props against schema
    const schemaWarnings = validateProps(descriptor.name, result, schema)

    // Inject the asset resolver
    result.resolveAssetUrl = (path: string) => {
      if (!path) return ""
      if (path.startsWith("http")) return path
      return `https://raw.githubusercontent.com/${owner}/${repo}/${branch}/${path.replace(/^\.\//, "")}`
    }

    return {
      props: result,
      propWarnings: [...evalWarnings, ...schemaWarnings],
    }
  }, [mdastNode, owner, repo, branch, adapter, descriptor.name, schema])

  // Log actionable warnings (non-crashing)
  React.useEffect(() => {
    for (const w of propWarnings) {
      console.warn(`[RepoPress] ${w}`)
    }
  }, [propWarnings])

  if (!Component) {
    return <GenericJsxEditor descriptor={descriptor} mdastNode={mdastNode} />
  }

  // Render the real component from the repository adapter
  try {
    return (
      <div className="repo-jsx-container relative group">
        <div className="absolute -top-6 left-0 opacity-0 group-hover:opacity-100 transition-opacity flex items-center gap-1 bg-studio-accent text-white text-[10px] font-bold px-1.5 py-0.5 rounded-t-sm pointer-events-none z-20">
          {descriptor.name} (Live)
          {propWarnings.length > 0 && (
            <span className="ml-1 bg-yellow-500 text-yellow-950 px-1 rounded text-[9px]">
              {propWarnings.length} warning{propWarnings.length > 1 ? "s" : ""}
            </span>
          )}
        </div>
        <div className="border border-transparent group-hover:border-studio-accent/30 rounded-sm transition-colors overflow-hidden">
          <Component {...props}>
            {/* If the component has children, MDXEditor handles them via the nested editor */}
            {descriptor.hasChildren && props.children ? props.children : null}
          </Component>
        </div>
      </div>
    )
  } catch (err) {
    console.error(`[RepoPress] Failed to render <${descriptor.name} />:`, err)
    return <GenericJsxEditor descriptor={descriptor} mdastNode={mdastNode} />
  }
}
