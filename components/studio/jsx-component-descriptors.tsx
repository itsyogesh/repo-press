import type { JsxComponentDescriptor } from "@mdxeditor/editor"

/**
 * JSX component descriptors for common MDX components.
 * These render as labeled editor boxes in WYSIWYG mode,
 * showing the component name, editable props, and rich-text children.
 */
/**
 * Generic placeholder editor for JSX components without specialized rendering.
 * Shows a labeled box with the component name.
 */
function GenericJsxEditor({ descriptor }: { mdastNode: any; descriptor: JsxComponentDescriptor }) {
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

export function getJsxComponentDescriptors(): JsxComponentDescriptor[] {
  return [
    {
      name: "DocsImage",
      kind: "flow",
      props: [
        { name: "src", type: "expression" },
        { name: "alt", type: "string" },
      ],
      hasChildren: false,
      Editor: ({ mdastNode, descriptor }) => {
        const altAttr = (mdastNode as any).attributes?.find((a: any) => a.name === "alt")
        const altValue = typeof altAttr?.value === "string" ? altAttr.value : "Image"
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
              🖼️ {descriptor.name}
            </div>
            <div
              style={{
                fontSize: "12px",
                marginTop: "4px",
                color: "var(--studio-fg)",
              }}
            >
              {altValue}
            </div>
          </div>
        )
      },
    },
    {
      name: "DocsVideo",
      kind: "flow",
      props: [
        { name: "src", type: "expression" },
        { name: "alt", type: "string" },
      ],
      hasChildren: false,
      Editor: ({ mdastNode, descriptor }) => {
        const altAttr = (mdastNode as any).attributes?.find((a: any) => a.name === "alt")
        const altValue = typeof altAttr?.value === "string" ? altAttr.value : "Video"
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
              🎬 {descriptor.name}
            </div>
            <div
              style={{
                fontSize: "12px",
                marginTop: "4px",
                color: "var(--studio-fg)",
              }}
            >
              {altValue}
            </div>
          </div>
        )
      },
    },
    {
      name: "Callout",
      kind: "flow",
      props: [
        { name: "type", type: "string" },
        { name: "title", type: "string" },
      ],
      hasChildren: true,
      Editor: ({ mdastNode, descriptor }) => {
        const titleAttr = (mdastNode as any).attributes?.find((a: any) => a.name === "title")
        const titleValue = typeof titleAttr?.value === "string" ? titleAttr.value : "Callout"
        return (
          <div
            style={{
              padding: "12px 16px",
              border: "1px solid var(--studio-border)",
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
                marginBottom: "4px",
                textTransform: "uppercase",
                letterSpacing: "0.05em",
              }}
            >
              📌 {descriptor.name}
            </div>
            <div>{titleValue}</div>
          </div>
        )
      },
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
      Editor: ({ descriptor }) => (
        <div
          style={{
            padding: "12px 16px",
            border: "1px solid var(--studio-border)",
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
              marginBottom: "4px",
              textTransform: "uppercase",
              letterSpacing: "0.05em",
            }}
          >
            🃏 {descriptor.name}
          </div>
        </div>
      ),
    },
    {
      name: "Tabs",
      kind: "flow",
      props: [
        { name: "items", type: "expression" },
        { name: "defaultValue", type: "string" },
      ],
      hasChildren: true,
      Editor: ({ descriptor }) => (
        <div
          style={{
            padding: "12px 16px",
            border: "1px solid var(--studio-border)",
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
              marginBottom: "4px",
              textTransform: "uppercase",
              letterSpacing: "0.05em",
            }}
          >
            📑 {descriptor.name}
          </div>
        </div>
      ),
    },
    {
      name: "Steps",
      kind: "flow",
      props: [],
      hasChildren: true,
      Editor: ({ descriptor }) => (
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
            🔢 {descriptor.name}
          </div>
        </div>
      ),
    },
    {
      name: "Accordion",
      kind: "flow",
      props: [{ name: "title", type: "string" }],
      hasChildren: true,
      Editor: ({ descriptor }) => (
        <div
          style={{
            padding: "12px 16px",
            border: "1px solid var(--studio-border)",
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
            🎵 {descriptor.name}
          </div>
        </div>
      ),
    },
    // Additional MDX components that may appear in content.
    // Registered with generic editors so MDXEditor can parse them without errors.
    {
      name: "DynamicImage",
      kind: "flow",
      props: [
        { name: "src", type: "expression" },
        { name: "alt", type: "string" },
        { name: "width", type: "expression" },
        { name: "height", type: "expression" },
      ],
      hasChildren: false,
      Editor: ({ mdastNode, descriptor }) => {
        const altAttr = (mdastNode as any).attributes?.find((a: any) => a.name === "alt")
        const altValue = typeof altAttr?.value === "string" ? altAttr.value : "Image"
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
            <div
              style={{
                fontSize: "12px",
                marginTop: "4px",
                color: "var(--studio-fg)",
              }}
            >
              {altValue}
            </div>
          </div>
        )
      },
    },
    { name: "TickPoint", kind: "flow", props: [], hasChildren: true, Editor: GenericJsxEditor },
    { name: "Note", kind: "flow", props: [{ name: "title", type: "string" }], hasChildren: true, Editor: GenericJsxEditor },
    { name: "Warning", kind: "flow", props: [{ name: "title", type: "string" }], hasChildren: true, Editor: GenericJsxEditor },
    { name: "Tip", kind: "flow", props: [{ name: "title", type: "string" }], hasChildren: true, Editor: GenericJsxEditor },
    { name: "Info", kind: "flow", props: [{ name: "title", type: "string" }], hasChildren: true, Editor: GenericJsxEditor },
    { name: "CardGroup", kind: "flow", props: [{ name: "cols", type: "expression" }], hasChildren: true, Editor: GenericJsxEditor },
    { name: "Tab", kind: "flow", props: [{ name: "label", type: "string" }], hasChildren: true, Editor: GenericJsxEditor },
    { name: "Step", kind: "flow", props: [{ name: "title", type: "string" }], hasChildren: true, Editor: GenericJsxEditor },
    { name: "AccordionGroup", kind: "flow", props: [], hasChildren: true, Editor: GenericJsxEditor },
    { name: "CodeGroup", kind: "flow", props: [{ name: "title", type: "string" }], hasChildren: true, Editor: GenericJsxEditor },
    { name: "CodeBlock", kind: "flow", props: [{ name: "title", type: "string" }], hasChildren: false, Editor: GenericJsxEditor },
  ]
}
