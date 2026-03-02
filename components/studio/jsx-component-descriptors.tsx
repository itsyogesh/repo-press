import type { JsxComponentDescriptor } from "@mdxeditor/editor"
import { RepoJsxBridge } from "./repo-jsx-bridge"

/**
 * JSX component descriptors for common MDX components.
 * These render as labeled editor boxes in WYSIWYG mode,
 * showing the component name, editable props, and rich-text children.
 */

/**
 * Generic placeholder editor for JSX components without specialized rendering.
 * Shows a labeled box with the component name.
 */
export function GenericJsxEditor({ descriptor }: { mdastNode: any; descriptor: JsxComponentDescriptor }) {
  return (
    <div
      style={{
        padding: "12px 16px",
        border: "1px dashed var(--studio-border)",
        borderRadius: "8px",
        background: "var(--studio-canvas-inset)",
        margin: "8px 0",
      }}
    >
      <div
        style={{
          fontSize: "11px",
          fontWeight: 600,
          color: "var(--studio-fg-muted)",
          textTransform: "uppercase",
          letterSpacing: "0.05em",
        }}
      >
        {descriptor.name}
      </div>
    </div>
  )
}

export function getJsxComponentDescriptors(
  adapterComponents?: Record<string, any>,
  componentSchema?: Record<string, any>,
): JsxComponentDescriptor[] {
  // 1. Built-in descriptors
  const baseDescriptors: JsxComponentDescriptor[] = [
    {
      name: "DocsImage",
      kind: "flow",
      props: [
        { name: "src", type: "expression" },
        { name: "alt", type: "string" },
        { name: "caption", type: "string" },
      ],
      hasChildren: false,
      Editor: RepoJsxBridge,
    },
    {
      name: "DocsVideo",
      kind: "flow",
      props: [
        { name: "src", type: "expression" },
        { name: "title", type: "string" },
      ],
      hasChildren: false,
      Editor: RepoJsxBridge,
    },
    {
      name: "Callout",
      kind: "flow",
      props: [
        { name: "type", type: "string" },
        { name: "title", type: "string" },
      ],
      hasChildren: true,
      Editor: RepoJsxBridge,
    },
    {
      name: "Card",
      kind: "flow",
      props: [
        { name: "title", type: "string" },
        { name: "href", type: "string" },
        { name: "icon", type: "string" },
      ],
      hasChildren: true,
      Editor: RepoJsxBridge,
    },
    {
      name: "Tabs",
      kind: "flow",
      props: [
        { name: "items", type: "expression" },
        { name: "defaultValue", type: "string" },
      ],
      hasChildren: true,
      Editor: RepoJsxBridge,
    },
    {
      name: "Steps",
      kind: "flow",
      props: [],
      hasChildren: true,
      Editor: RepoJsxBridge,
    },
    {
      name: "CopyIpsButton",
      kind: "flow",
      props: [],
      hasChildren: false,
      Editor: RepoJsxBridge,
    },
    {
      name: "Badge",
      kind: "text",
      props: [{ name: "variant", type: "string" }],
      hasChildren: true,
      Editor: RepoJsxBridge,
    },
    {
      name: "Button",
      kind: "text",
      props: [
        { name: "variant", type: "string" },
        { name: "size", type: "string" },
      ],
      hasChildren: true,
      Editor: RepoJsxBridge,
    },
  ]

  // 2. Add dynamic descriptors from schema or adapter discovery
  const dynamicNames = new Set([...Object.keys(adapterComponents || {}), ...Object.keys(componentSchema || {})])

  const dynamicDescriptors: JsxComponentDescriptor[] = []

  dynamicNames.forEach((name) => {
    // Skip if already in base
    if (baseDescriptors.some((d) => d.name === name)) return

    const schema = componentSchema?.[name]
    dynamicDescriptors.push({
      name,
      kind: (schema?.kind as any) || "flow",
      props: schema?.props || [],
      hasChildren: schema?.hasChildren ?? true,
      Editor: RepoJsxBridge,
    })
  })

  // Add standard HTML tags often used with JSX syntax in MDX
  const htmlTags: JsxComponentDescriptor[] = [
    {
      name: "section",
      kind: "flow",
      props: [{ name: "className", type: "string" }],
      hasChildren: true,
      Editor: RepoJsxBridge,
    },
    {
      name: "h1",
      kind: "flow",
      props: [],
      hasChildren: true,
      Editor: RepoJsxBridge,
    },
    {
      name: "h2",
      kind: "flow",
      props: [],
      hasChildren: true,
      Editor: RepoJsxBridge,
    },
    {
      name: "h3",
      kind: "flow",
      props: [],
      hasChildren: true,
      Editor: RepoJsxBridge,
    },
    {
      name: "a",
      kind: "text",
      props: [
        { name: "href", type: "expression" },
        { name: "className", type: "string" },
      ],
      hasChildren: true,
      Editor: RepoJsxBridge,
    },
    {
      name: "Note",
      kind: "flow",
      props: [{ name: "title", type: "string" }],
      hasChildren: true,
      Editor: RepoJsxBridge,
    },
    {
      name: "Warning",
      kind: "flow",
      props: [{ name: "title", type: "string" }],
      hasChildren: true,
      Editor: RepoJsxBridge,
    },
    {
      name: "Tip",
      kind: "flow",
      props: [{ name: "title", type: "string" }],
      hasChildren: true,
      Editor: RepoJsxBridge,
    },
    {
      name: "Info",
      kind: "flow",
      props: [{ name: "title", type: "string" }],
      hasChildren: true,
      Editor: RepoJsxBridge,
    },
    {
      name: "Tab",
      kind: "flow",
      props: [{ name: "label", type: "string" }],
      hasChildren: true,
      Editor: RepoJsxBridge,
    },
    {
      name: "Step",
      kind: "flow",
      props: [{ name: "title", type: "string" }],
      hasChildren: true,
      Editor: RepoJsxBridge,
    },
  ]

  htmlTags.forEach((tag) => {
    if (!baseDescriptors.some((d) => d.name === tag.name)) {
      baseDescriptors.push(tag)
    }
  })

  return [...baseDescriptors, ...dynamicDescriptors]
}
