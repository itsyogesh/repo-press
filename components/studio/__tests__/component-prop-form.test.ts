import { describe, expect, it } from "vitest"
import { type AuthoringComponentMetadata, buildAuthoringCatalog } from "@/lib/studio/authoring-catalog"
import { getRequiredProps, validateFormState } from "../component-prop-form"

function component(metadata: AuthoringComponentMetadata) {
  return buildAuthoringCatalog({ metadata: { Widget: metadata } })[0]
}

describe("getRequiredProps", () => {
  it("returns names of required props", () => {
    const props = [
      { name: "src", type: "image" as const, required: true },
      { name: "alt", type: "string" as const },
      { name: "title", type: "string" as const, required: true },
    ]
    expect(getRequiredProps(props)).toEqual(["src", "title"])
  })

  it("returns empty array when no required props", () => {
    const props = [{ name: "alt", type: "string" as const }]
    expect(getRequiredProps(props)).toEqual([])
  })
})

describe("validateFormState", () => {
  it("returns missing required fields", () => {
    const props = [
      { name: "src", type: "image" as const, required: true },
      { name: "alt", type: "string" as const, required: true },
      { name: "caption", type: "string" as const },
    ]
    const state = { src: "/image.png", alt: "", caption: "" }
    const errors = validateFormState(component({ props, hasChildren: false }), state)
    expect(errors).toEqual({ alt: "Required" })
  })

  it("returns empty object when all required fields filled", () => {
    const props = [{ name: "src", type: "image" as const, required: true }]
    const state = { src: "/image.png" }
    const errors = validateFormState(component({ props, hasChildren: false }), state)
    expect(errors).toEqual({})
  })

  it("treats undefined and empty string as missing", () => {
    const props = [
      { name: "src", type: "image" as const, required: true },
      { name: "title", type: "string" as const, required: true },
    ]
    const state: Record<string, unknown> = { src: undefined, title: "   " }
    const errors = validateFormState(component({ props, hasChildren: false }), state)
    expect(errors).toEqual({ src: "Required", title: "Required" })
  })

  it("boolean false is valid for required boolean prop", () => {
    const props = [{ name: "enabled", type: "boolean" as const, required: true }]
    const state = { enabled: false }
    const errors = validateFormState(component({ props, hasChildren: false }), state)
    expect(errors).toEqual({})
  })

  it("requires an explicit value for a required boolean prop", () => {
    const props = [{ name: "enabled", type: "boolean" as const, required: true }]
    expect(validateFormState(component({ props, hasChildren: false }), {})).toEqual({ enabled: "Required" })
  })

  it("validates enum values and required MDX slots", () => {
    const def = component({
      props: [{ name: "variant", type: "string", required: true, options: ["default", "accent"] }],
      slots: [{ name: "children", accepts: "mdx", required: true }],
    })

    expect(validateFormState(def, { variant: "danger", children: "" })).toEqual({
      variant: "Choose an allowed value",
      children: "Required",
    })
    expect(validateFormState(def, { variant: "accent", children: "**Safe MDX**" })).toEqual({})
  })
})
