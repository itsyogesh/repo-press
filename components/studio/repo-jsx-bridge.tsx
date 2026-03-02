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

export function RepoJsxBridge({ mdastNode, descriptor }: RepoJsxBridgeProps) {
  const { owner, repo, branch } = useStudio()
  const { adapter, components: componentSchema } = useStudioAdapter()

  const Component = adapter?.components?.[descriptor.name]
  const schema = componentSchema?.[descriptor.name]

  // Extract props from MDAST node attributes
  const props = useMemo(() => {
    const attrs = mdastNode.attributes || []
    const result: Record<string, any> = {}

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
            console.warn(
              `Failed to safely evaluate prop expression "${attr.name}" in component <${descriptor.name} />: ${evaluated.reason}`,
            )
            result[attr.name] = undefined
          }
        } else {
          result[attr.name] = attr.value
        }
      }
    })

    // Inject the asset resolver
    result.resolveAssetUrl = (path: string) => {
      if (!path) return ""
      if (path.startsWith("http")) return path
      return `https://raw.githubusercontent.com/${owner}/${repo}/${branch}/${path.replace(/^\.\//, "")}`
    }

    return result
  }, [mdastNode, owner, repo, branch, adapter, descriptor.name])

  if (!Component) {
    return <GenericJsxEditor descriptor={descriptor} mdastNode={mdastNode} />
  }

  // Render the real component from the repository adapter
  try {
    return (
      <div className="repo-jsx-container relative group">
        <div className="absolute -top-6 left-0 opacity-0 group-hover:opacity-100 transition-opacity flex items-center gap-1 bg-studio-accent text-white text-[10px] font-bold px-1.5 py-0.5 rounded-t-sm pointer-events-none z-20">
          {descriptor.name} (Live)
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
    console.error(`Failed to render repository component <${descriptor.name} />:`, err)
    return <GenericJsxEditor descriptor={descriptor} mdastNode={mdastNode} />
  }
}
