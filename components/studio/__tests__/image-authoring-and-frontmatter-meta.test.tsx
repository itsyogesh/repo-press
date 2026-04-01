import * as React from "react"
import { renderToStaticMarkup } from "react-dom/server"
import { describe, expect, it } from "vitest"
import { FrontmatterField } from "@/components/studio/frontmatter-field"
import { StudioProvider } from "@/components/studio/studio-context"
import { getAuthoredImageValue } from "@/lib/studio/image-authoring"

// Minimal mock field definitions covering meta fields requested by user
const metaFields = [
  { actualFieldName: "metaTitle", type: "string", description: "Meta title" },
  { actualFieldName: "metaDescription", type: "string", description: "Meta description", charLimit: 160 },
  { actualFieldName: "focusKeyword", type: "string", description: "Focus keyword" },
  { actualFieldName: "canonicalUrl", type: "string", description: "Canonical URL" },
  { actualFieldName: "metaRobots", type: "string", description: "Meta robots" },
  { actualFieldName: "lastUpdated", type: "date", description: "Last updated date" },
  { actualFieldName: "image", type: "image", description: "Cover image", semanticRole: "image" },
  { actualFieldName: "imageAlt", type: "string", description: "Image alt text" },
  { actualFieldName: "ogTitle", type: "string", description: "OG title" },
  { actualFieldName: "ogDescription", type: "string", description: "OG description", charLimit: 160 },
  { actualFieldName: "ogImage", type: "image", description: "OG image", semanticRole: "image" },
  { actualFieldName: "twitterTitle", type: "string", description: "Twitter title" },
  { actualFieldName: "twitterDescription", type: "string", description: "Twitter description" },
  { actualFieldName: "twitterImage", type: "image", description: "Twitter image", semanticRole: "image" },
  { actualFieldName: "schemaType", type: "string", description: "Schema type" },
]

describe("Image authoring and frontmatter metadata", () => {
  it("getAuthoredImageValue returns filename for frontmatter image fields and public path for component usage", () => {
    const repoPath = "/public/images/blog/post/photo-1.jpg"
    const fm = getAuthoredImageValue({ repoPath, usage: "frontmatter", fieldName: "image", semanticRole: "image" })
    expect(fm).toBe("photo-1.jpg")

    const comp = getAuthoredImageValue({ repoPath, usage: "component", fieldName: "image", semanticRole: "image" })
    expect(comp).toBe("/images/blog/post/photo-1.jpg")
  })

  it("FrontmatterField renders inputs for all requested meta properties", () => {
    const fields = metaFields
    const providerValue = {
      owner: "droidsize",
      repo: "collective.domains",
      branch: "main",
      projectId: "kd784kwtw4e454akcfs07hb0s183rj5y",
      projectAccessToken: undefined,
      userId: "test-user",
      selectedFilePath: undefined,
      contentRoot: "",
      tree: [],
      role: "owner",
      adapter: null,
      adapterLoading: false,
      adapterError: null,
      adapterDiagnostics: [],
      components: undefined,
    }

    const html = renderToStaticMarkup(
      <StudioProvider value={providerValue as any}>
        <div>
          {fields.map((f) => (
            <FrontmatterField
              key={f.actualFieldName}
              field={f as any}
              value={f.type === "date" ? "2026-01-01" : ""}
              onChange={() => {}}
            />
          ))}
        </div>
      </StudioProvider>,
    )

    // Check that each label appears in rendered output
    for (const f of fields) {
      expect(html).toContain(f.actualFieldName)
    }

    // Ensure image fields render the upload control
    expect(html.toLowerCase()).toContain("select or upload image")
  })
})
