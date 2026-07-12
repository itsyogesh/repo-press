import type { JsxComponentDescriptor } from "@mdxeditor/editor"
import type { AuthoringCatalog, AuthoringComponent } from "@/lib/studio/authoring-catalog"
import { componentAcceptsChildren } from "@/lib/studio/authoring-catalog"

export function GenericJsxEditor({ descriptor }: { mdastNode: unknown; descriptor: JsxComponentDescriptor }) {
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

function descriptorFromCatalog(component: AuthoringComponent): JsxComponentDescriptor {
  return {
    name: component.mdxName,
    kind: component.kind,
    props: component.props.map((prop) => ({
      name: prop.name,
      type: prop.type === "string" || prop.type === "image" ? "string" : "expression",
    })),
    hasChildren: componentAcceptsChildren(component),
    Editor: GenericJsxEditor,
  }
}

/**
 * Build generic rich-editor descriptors from serializable authoring metadata.
 * Unknown names found in an existing document get a children-preserving
 * placeholder, but never an executable renderer or invented prop schema.
 */
export function getJsxComponentDescriptors(
  authoringCatalog: AuthoringCatalog,
  discoveredComponentNames: readonly string[] = [],
): JsxComponentDescriptor[] {
  const descriptors = new Map(
    authoringCatalog.map((component) => [component.mdxName, descriptorFromCatalog(component)]),
  )
  for (const name of discoveredComponentNames) {
    if (!descriptors.has(name)) {
      descriptors.set(name, { name, kind: "flow", props: [], hasChildren: true, Editor: GenericJsxEditor })
    }
  }
  return Array.from(descriptors.values()).sort((a, b) => (a.name ?? "").localeCompare(b.name ?? ""))
}
