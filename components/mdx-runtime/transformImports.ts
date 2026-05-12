import type { Root } from "mdast"
import type { Plugin } from "unified"
import { SKIP, visit } from "unist-util-visit"

export interface ExtractedImport {
  source: string
  imported: string
  local: string
}

export interface TransformImportsData {
  extractedImports?: ExtractedImport[]
  importDiagnostics?: string[]
}

export const remarkTransformImports: Plugin<[{ allowedImports: Record<string, string[]> }], Root> = (options) => {
  return (tree, file) => {
    const extracted: ExtractedImport[] = []
    const diagnostics: string[] = []
    const allowed = options?.allowedImports || {}

    visit(tree, "mdxjsEsm", (node, index, parent) => {
      const estree = (node.data as { estree?: { body: any[] } } | undefined)?.estree
      if (!estree) return

      const newBody = []

      for (const statement of estree.body) {
        if (statement.type === "ImportDeclaration") {
          const source = statement.source.value as string
          const allowedSpecifiers = allowed[source]

          if (!allowedSpecifiers) {
            diagnostics.push(`Import from '${source}' is not available in the preview sandbox and was skipped.`)
            continue
          }

          for (const specifier of statement.specifiers) {
            if (specifier.type === "ImportSpecifier") {
              const importedName =
                specifier.imported.type === "Identifier"
                  ? specifier.imported.name
                  : (specifier.imported.value as string)
              const localName = specifier.local.name

              if (!allowedSpecifiers.includes(importedName)) {
                diagnostics.push(
                  `Importing '${importedName}' from '${source}' is not available in the preview sandbox.`,
                )
                continue
              }

              extracted.push({
                source,
                imported: importedName,
                local: localName,
              })
            } else if (specifier.type === "ImportDefaultSpecifier") {
              const localName = specifier.local.name
              if (!allowedSpecifiers.includes("default")) {
                diagnostics.push(`Default import from '${source}' is not available in the preview sandbox.`)
                continue
              }
              extracted.push({
                source,
                imported: "default",
                local: localName,
              })
            } else {
              diagnostics.push(`Unsupported import specifier type '${specifier.type}' from '${source}' was skipped.`)
            }
          }
        } else if (statement.type === "ExportNamedDeclaration" || statement.type === "ExportDefaultDeclaration") {
          newBody.push(statement)
        } else {
          // Keep other statements
          newBody.push(statement)
        }
      }

      estree.body = newBody

      if (newBody.length === 0 && parent && typeof index === "number") {
        parent.children.splice(index, 1)
        return [SKIP, index]
      }
    })

    ;(file.data as TransformImportsData).extractedImports = extracted
    ;(file.data as TransformImportsData).importDiagnostics = diagnostics
  }
}
