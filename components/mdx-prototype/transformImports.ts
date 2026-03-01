import { visit, SKIP } from "unist-util-visit"
import type { Plugin } from "unified"
import type { Root } from "mdast"

export interface ExtractedImport {
  source: string
  imported: string
  local: string
}

export const remarkTransformImports: Plugin<[{ allowedImports: Record<string, string[]> }], Root> = (options) => {
  return (tree, file) => {
    const extracted: ExtractedImport[] = []
    const allowed = options?.allowedImports || {}

    visit(tree, "mdxjsEsm", (node, index, parent) => {
      // @ts-ignore
      const estree = node.data?.estree
      if (!estree) return

      const newBody = []

      for (const statement of estree.body) {
        if (statement.type === "ImportDeclaration") {
          const source = statement.source.value as string
          const allowedSpecifiers = allowed[source]

          if (!allowedSpecifiers) {
            file.fail(`Import from '${source}' is not allowed in this project.`)
            return
          }

          for (const specifier of statement.specifiers) {
            if (specifier.type === "ImportSpecifier") {
              const importedName =
                specifier.imported.type === "Identifier"
                  ? specifier.imported.name
                  : (specifier.imported.value as string)
              const localName = specifier.local.name

              if (!allowedSpecifiers.includes(importedName)) {
                file.fail(`Importing '${importedName}' from '${source}' is not allowed.`)
                return
              }

              extracted.push({
                source,
                imported: importedName,
                local: localName,
              })
            } else if (specifier.type === "ImportDefaultSpecifier") {
              const localName = specifier.local.name
              if (!allowedSpecifiers.includes("default")) {
                file.fail(`Default import from '${source}' is not allowed.`)
                return
              }
              extracted.push({
                source,
                imported: "default",
                local: localName,
              })
            } else {
              file.fail(`Unsupported import specifier type: ${specifier.type}`)
              return
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

    // @ts-ignore
    file.data.extractedImports = extracted
  }
}
