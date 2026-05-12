import matter from "gray-matter"
import ts from "typescript"
import { normalizeFrontmatterDates } from "@/lib/framework-adapters"

export type ContentMetadataSource = "frontmatter" | "metadata-export" | "none"

export type ParsedContentFile = {
  body: string
  frontmatter: Record<string, unknown>
  metadataSource: ContentMetadataSource
  warnings: string[]
}

function normalizeBody(value: string) {
  return value.replace(/^\s*\n/, "").replace(/\n+$/g, "")
}

function isMdxFile(filePath: string) {
  return /\.mdx$/i.test(filePath)
}

function hasExportModifier(node: ts.Node) {
  const modifiers = ts.canHaveModifiers(node) ? ts.getModifiers(node) : undefined
  return Boolean(modifiers?.some((modifier) => modifier.kind === ts.SyntaxKind.ExportKeyword))
}

function unwrapExpression(node: ts.Expression): ts.Expression {
  if (ts.isAsExpression(node) || ts.isTypeAssertionExpression(node) || ts.isParenthesizedExpression(node)) {
    return unwrapExpression(node.expression)
  }
  if (ts.isSatisfiesExpression(node)) {
    return unwrapExpression(node.expression)
  }
  return node
}

function convertExpression(node: ts.Expression): unknown {
  const expression = unwrapExpression(node)

  if (ts.isStringLiteral(expression) || ts.isNoSubstitutionTemplateLiteral(expression)) {
    return expression.text
  }
  if (ts.isNumericLiteral(expression)) {
    return Number(expression.text)
  }
  if (expression.kind === ts.SyntaxKind.TrueKeyword) return true
  if (expression.kind === ts.SyntaxKind.FalseKeyword) return false
  if (expression.kind === ts.SyntaxKind.NullKeyword) return null

  if (ts.isArrayLiteralExpression(expression)) {
    return expression.elements.map((element) => {
      if (!ts.isExpression(element)) {
        throw new Error("Unsupported metadata array element")
      }
      return convertExpression(element)
    })
  }

  if (ts.isObjectLiteralExpression(expression)) {
    return expression.properties.reduce<Record<string, unknown>>((acc, property) => {
      if (!ts.isPropertyAssignment(property)) {
        throw new Error("Unsupported metadata property shape")
      }

      let key: string
      if (ts.isIdentifier(property.name) || ts.isStringLiteral(property.name) || ts.isNumericLiteral(property.name)) {
        key = property.name.text
      } else {
        throw new Error("Unsupported metadata property key")
      }

      acc[key] = convertExpression(property.initializer)
      return acc
    }, {})
  }

  throw new Error(`Unsupported metadata expression: ${ts.SyntaxKind[expression.kind]}`)
}

function extractMetadataExport(source: string): {
  frontmatter: Record<string, unknown> | null
  body: string
  warnings: string[]
} {
  const warnings: string[] = []
  const sourceFile = ts.createSourceFile("content-file.mdx", source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX)

  for (const statement of sourceFile.statements) {
    if (
      !ts.isVariableStatement(statement) ||
      !hasExportModifier(statement) ||
      statement.declarationList.declarations.length !== 1
    ) {
      continue
    }

    const declaration = statement.declarationList.declarations[0]
    if (!ts.isIdentifier(declaration.name) || declaration.name.text !== "metadata" || !declaration.initializer) {
      continue
    }

    try {
      const frontmatter = convertExpression(declaration.initializer)
      if (!frontmatter || typeof frontmatter !== "object" || Array.isArray(frontmatter)) {
        warnings.push("Metadata export must evaluate to an object literal.")
        break
      }

      const body = `${source.slice(0, statement.getStart(sourceFile))}${source.slice(statement.end)}`
      return {
        frontmatter: normalizeFrontmatterDates(frontmatter as Record<string, unknown>) as Record<string, unknown>,
        body: normalizeBody(body),
        warnings,
      }
    } catch (error) {
      warnings.push(error instanceof Error ? error.message : "Failed to parse metadata export.")
      break
    }
  }

  return {
    frontmatter: null,
    body: normalizeBody(source),
    warnings,
  }
}

export function parseContentFile(rawContent: string, filePath: string): ParsedContentFile {
  const warnings: string[] = []
  let yamlFrontmatter: Record<string, unknown> = {}
  let bodyWithoutFrontmatter = rawContent

  try {
    const { data, content } = matter(rawContent)
    yamlFrontmatter = normalizeFrontmatterDates(data) as Record<string, unknown>
    bodyWithoutFrontmatter = content
  } catch {
    bodyWithoutFrontmatter = rawContent.replace(/^---\r?\n[\s\S]*?\r?\n---\r?\n?/, "")
  }

  if (!isMdxFile(filePath)) {
    return {
      body: normalizeBody(bodyWithoutFrontmatter),
      frontmatter: yamlFrontmatter,
      metadataSource: Object.keys(yamlFrontmatter).length > 0 ? "frontmatter" : "none",
      warnings,
    }
  }

  const metadataExport = extractMetadataExport(bodyWithoutFrontmatter)
  warnings.push(...metadataExport.warnings)

  if (metadataExport.frontmatter) {
    if (Object.keys(yamlFrontmatter).length > 0) {
      warnings.unshift("Both YAML frontmatter and export const metadata were found. Using metadata export.")
    }
    return {
      body: metadataExport.body,
      frontmatter: metadataExport.frontmatter,
      metadataSource: "metadata-export",
      warnings,
    }
  }

  return {
    body: normalizeBody(bodyWithoutFrontmatter),
    frontmatter: yamlFrontmatter,
    metadataSource: Object.keys(yamlFrontmatter).length > 0 ? "frontmatter" : "none",
    warnings,
  }
}

function formatMetadataExport(frontmatter: Record<string, unknown>) {
  return `export const metadata = ${JSON.stringify(frontmatter, null, 2)}`
}

export function serializeContentFile({
  filePath,
  body,
  frontmatter,
  metadataSource,
  metadataDefault,
}: {
  filePath: string
  body: string
  frontmatter: Record<string, unknown>
  metadataSource: ContentMetadataSource
  metadataDefault: "frontmatter" | "metadata-export"
}) {
  const effectiveSource =
    metadataSource === "none" ? (isMdxFile(filePath) ? metadataDefault : "frontmatter") : metadataSource

  if (effectiveSource === "metadata-export" && isMdxFile(filePath)) {
    if (Object.keys(frontmatter).length === 0) {
      return body
    }
    return `${formatMetadataExport(frontmatter)}\n\n${body}`
  }

  return matter.stringify(body, frontmatter)
}

export function extractTitleFromContentFile(rawContent: string, filePath: string) {
  const parsed = parseContentFile(rawContent, filePath)
  const title = parsed.frontmatter.title
  if (typeof title === "string" && title.trim()) {
    return title.trim()
  }
  return (
    filePath
      .split("/")
      .pop()
      ?.replace(/\.(mdx?|markdown)$/i, "") || filePath
  )
}
