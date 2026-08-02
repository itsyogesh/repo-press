import { cleanup, render, screen } from "@testing-library/react"
import { afterEach, describe, expect, it, vi } from "vitest"
import { buildAuthoringCatalog } from "@/lib/studio/authoring-catalog"
import { ComponentPropForm, validateFormState } from "../component-prop-form"

afterEach(cleanup)

describe("generated component prop accessibility", () => {
  it("exposes required state for string, number, enum, and tri-state boolean controls", () => {
    const def = buildAuthoringCatalog({
      metadata: {
        Widget: {
          props: [
            { name: "title", label: "Title", type: "string", required: true },
            { name: "count", label: "Count", type: "number", required: true },
            {
              name: "variant",
              label: "Variant",
              type: "string",
              required: true,
              options: ["default", "accent"],
            },
            { name: "enabled", label: "Enabled", type: "boolean", required: true },
          ],
          hasChildren: false,
        },
      },
    })[0]

    render(<ComponentPropForm def={def} formState={{}} onFormChange={vi.fn()} />)

    expect(screen.getByRole("textbox", { name: "Title" })).toBeRequired()
    expect(screen.getByRole("spinbutton", { name: "Count" })).toBeRequired()
    expect(screen.getByRole("combobox", { name: "Variant" })).toHaveAttribute("aria-required", "true")
    expect(screen.getByRole("combobox", { name: "Enabled" })).toHaveAttribute("aria-required", "true")
    expect(screen.getByRole("combobox", { name: "Enabled" })).toHaveTextContent("Select...")
  })

  it("associates surfaced errors with controls and announces each error", () => {
    const def = buildAuthoringCatalog({
      metadata: {
        Widget: {
          props: [
            { name: "title", label: "Title", type: "string", required: true, description: "Visible title." },
            {
              name: "variant",
              label: "Variant",
              type: "string",
              required: true,
              options: ["default", "accent"],
            },
            { name: "enabled", label: "Enabled", type: "boolean", required: true },
          ],
          hasChildren: false,
        },
      },
    })[0]
    const errors = validateFormState(def, {})

    render(<ComponentPropForm def={def} formState={{}} onFormChange={vi.fn()} errors={errors} />)

    const title = screen.getByRole("textbox", { name: "Title" })
    expect(title).toHaveAttribute("aria-invalid", "true")
    expect(title).toHaveAttribute("aria-errormessage", "prop-title-error")
    expect(title).toHaveAttribute("aria-describedby", "prop-title-description prop-title-error")
    expect(screen.getByRole("combobox", { name: "Variant" })).toHaveAttribute("aria-errormessage", "prop-variant-error")
    expect(screen.getByRole("combobox", { name: "Enabled" })).toHaveAttribute("aria-errormessage", "prop-enabled-error")
    expect(screen.getAllByRole("alert")).toHaveLength(3)
  })
})
