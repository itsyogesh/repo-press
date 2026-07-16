import type { JsxComponentDescriptor, JsxEditorProps } from "@mdxeditor/editor"
import * as React from "react"
import { Button } from "@/components/ui/button"
import type { AuthoringCatalog, AuthoringComponent } from "@/lib/studio/authoring-catalog"
import { componentAcceptsChildren } from "@/lib/studio/authoring-catalog"
import { useComponentEditRequest } from "./component-edit-context"

export function GenericJsxEditor({ descriptor, mdastNode }: JsxEditorProps) {
  const editBridge = useComponentEditRequest()
  const sourceSnapshotRef = React.useRef<string | null>(null)
  if (sourceSnapshotRef.current === null && editBridge) {
    sourceSnapshotRef.current = editBridge.captureSourceSnapshot()
  }
  const name = typeof mdastNode.name === "string" ? mdastNode.name : descriptor.name
  const start = mdastNode.position?.start.offset
  const canRequestEdit =
    editBridge !== null && sourceSnapshotRef.current !== null && typeof name === "string" && Number.isSafeInteger(start)
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
      <Button
        type="button"
        variant="outline"
        size="sm"
        disabled={!canRequestEdit}
        onClick={() => {
          if (canRequestEdit) {
            editBridge.requestEdit({
              name,
              start: start as number,
              sourceSnapshot: sourceSnapshotRef.current as string,
            })
          }
        }}
      >
        Edit {descriptor.name}
      </Button>
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
    // Incomplete native metadata cannot prove a component is self-closing.
    // Preserve possible nested source until a complete slot contract exists.
    hasChildren: component.schemaStatus === "incomplete" || componentAcceptsChildren(component),
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
