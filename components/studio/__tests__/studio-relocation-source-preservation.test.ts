import fs from "node:fs"
import path from "node:path"
import { describe, expect, it } from "vitest"
import { parseContentFile } from "@/lib/content-metadata"

const studioLayoutSource = fs.readFileSync(path.join(process.cwd(), "components/studio/studio-layout.tsx"), "utf8")

describe("Studio relocation source preservation", () => {
  it("keeps an unsupported metadata export read-only after a non-selected file rename", () => {
    const source = "export const metadata = { title: makeTitle() }\n\n# Body\n"
    const parsed = parseContentFile(source, "content/old.mdx")

    expect(parsed).toMatchObject({
      body: source,
      metadata: {},
      editable: false,
      diagnostic: "UNSUPPORTED_METADATA_EXPORT",
    })
    expect(studioLayoutSource).toContain('parseContentFile(payload.content || "", oldPath)')
    expect(studioLayoutSource).toContain("isSourceEditable: parsed.editable")
    expect(studioLayoutSource).toContain("sourceDiagnostic: parsed.diagnostic")
  })

  it("keeps unsupported YAML byte-for-byte and read-only after a non-selected file rename", () => {
    const source = "---\ntitle: [unterminated\n---\n# Body\n"
    const parsed = parseContentFile(source, "content/old.mdx")

    expect(() => parseContentFile(source, "content/old.mdx")).not.toThrow()
    expect(parsed).toMatchObject({
      body: source,
      metadata: {},
      editable: false,
      diagnostic: "UNSUPPORTED_FRONTMATTER",
    })
    expect(studioLayoutSource).toContain('parseContentFile(payload.content || "", oldPath)')
    expect(studioLayoutSource).not.toContain('matter(payload.content || "")')
  })
})
