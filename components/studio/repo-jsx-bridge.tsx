"use client"

import React, { useMemo } from "react"
import { useStudio } from "./studio-context"
import { useStudioAdapter } from "./studio-adapter-context"
import { GenericJsxEditor } from "./jsx-component-descriptors"

interface RepoJsxBridgeProps {
  mdastNode: any
  descriptor: any
}

export function RepoJsxBridge({ mdastNode, descriptor }: RepoJsxBridgeProps) {
  const { adapter, components: componentSchema, owner, repo, branch } = useStudio()

  const Component = adapter?.components?.[descriptor.name]
  const schema = componentSchema?.[descriptor.name]

  // Extract props from MDAST node attributes
  const props = useMemo(() => {
    const attrs = mdastNode.attributes || []
    const result: Record<string, any> = {}

    attrs.forEach((attr: any) => {
      if (attr.type === "mdxJsxAttribute") {
        if (attr.value?.type === "mdxJsxAttributeValueExpression") {
          result[attr.name] = attr.value.value
        } else {
          result[attr.name] = attr.value
        }
      }
    })

    // Inject the asset resolver so components can resolve images/videos in the editor
    result.resolveAssetUrl = (path: string) => {
      // We can't import buildGitHubRawUrl directly if we are a client component
      // but we have owner/repo/branch in context
      return `https://raw.githubusercontent.com/${owner}/${repo}/${branch}/${path.replace(/^\.\//, "")}`
    }

    return result
  }, [mdastNode, owner, repo, branch])

  if (!Component) {
    return <GenericJsxEditor descriptor={descriptor} mdastNode={mdastNode} />
  }

  // Render the real component from the repository adapter
  try {
    return (
      <div className="repo-jsx-container relative group">
        <div className="absolute -top-6 left-0 opacity-0 group-hover:opacity-100 transition-opacity flex items-center gap-1 bg-studio-accent text-white text-[10px] font-bold px-1.5 py-0.5 rounded-t-sm pointer-events-none">
          {descriptor.name} (Live)
        </div>
        <div className="border border-transparent group-hover:border-studio-accent/30 rounded-sm transition-colors">
          <Component {...props}>
            {/* If the component has children, MDXEditor handles them via the nested editor */}
            {descriptor.hasChildren ? props.children : null}
          </Component>
        </div>
      </div>
    )
  } catch (err) {
    console.error(`Failed to render repository component <${descriptor.name} />:`, err)
    return <GenericJsxEditor descriptor={descriptor} mdastNode={mdastNode} />
  }
}
