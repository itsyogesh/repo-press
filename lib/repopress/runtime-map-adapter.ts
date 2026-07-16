import ts from "typescript"
import { compareCodeUnits, deepFreeze } from "./registry-schema"

const MAX_SOURCE_BYTES = 2 * 1024 * 1024
const MAX_BINDINGS = 128
const SAFE_IDENTIFIER = /^[A-Za-z_$][A-Za-z0-9_$]*$/u
const SAFE_IMPORT =
  /^(?:@\/[A-Za-z0-9._~/-]+|@?[A-Za-z0-9._-]+|@?[A-Za-z0-9._-]+\/[A-Za-z0-9._~/-]+|[.]{1,2}\/[A-Za-z0-9._~/-]+)$/u

export interface RuntimeMapBinding {
  mdxName: string
  exportName: string
  importSource: string
}

export type RuntimeMapEditResult =
  | Readonly<{ ok: true; source: string; changed: boolean }>
  | Readonly<{
      ok: false
      source: string
      code: "INVALID_SOURCE" | "UNSUPPORTED_SOURCE" | "AMBIGUOUS_MAP" | "BINDING_COLLISION"
      message: string
    }>

export interface AdaptRuntimeMapInput {
  source: string
  bindings: readonly RuntimeMapBinding[]
}

function refuse(
  source: string,
  code: "INVALID_SOURCE" | "UNSUPPORTED_SOURCE" | "AMBIGUOUS_MAP" | "BINDING_COLLISION",
  message: string,
): RuntimeMapEditResult {
  return deepFreeze({ ok: false, source, code, message })
}

function hasExportModifier(node: ts.Node): boolean {
  return (
    (ts.canHaveModifiers(node) ? ts.getModifiers(node) : undefined)?.some(
      (modifier) => modifier.kind === ts.SyntaxKind.ExportKeyword,
    ) ?? false
  )
}

function unwrapObject(expression: ts.Expression): ts.ObjectLiteralExpression | null {
  let current = expression
  while (
    ts.isParenthesizedExpression(current) ||
    ts.isAsExpression(current) ||
    ts.isTypeAssertionExpression(current) ||
    ts.isSatisfiesExpression(current)
  ) {
    current = current.expression
  }
  return ts.isObjectLiteralExpression(current) ? current : null
}

function returnedObject(functionNode: ts.FunctionDeclaration): ts.ObjectLiteralExpression | null {
  if (!functionNode.body) return null
  const returns: ts.ReturnStatement[] = []
  const visit = (node: ts.Node): void => {
    if (node !== functionNode && ts.isFunctionLike(node)) return
    if (ts.isReturnStatement(node)) returns.push(node)
    ts.forEachChild(node, visit)
  }
  visit(functionNode.body)
  if (returns.length !== 1 || !returns[0].expression) return null
  return unwrapObject(returns[0].expression)
}

function objectForVariable(sourceFile: ts.SourceFile, name: string): ts.ObjectLiteralExpression | null {
  const matches: ts.ObjectLiteralExpression[] = []
  for (const statement of sourceFile.statements) {
    if (!ts.isVariableStatement(statement)) continue
    for (const declaration of statement.declarationList.declarations) {
      if (ts.isIdentifier(declaration.name) && declaration.name.text === name && declaration.initializer) {
        const object = unwrapObject(declaration.initializer)
        if (object) matches.push(object)
      }
    }
  }
  return matches.length === 1 ? matches[0] : null
}

function findTargets(sourceFile: ts.SourceFile): ts.ObjectLiteralExpression[] {
  const targets: ts.ObjectLiteralExpression[] = []
  const exportedNames = new Set<string>()
  for (const statement of sourceFile.statements) {
    if (ts.isExportDeclaration(statement) && statement.exportClause && ts.isNamedExports(statement.exportClause)) {
      for (const element of statement.exportClause.elements)
        exportedNames.add(element.propertyName?.text ?? element.name.text)
    }
  }

  for (const statement of sourceFile.statements) {
    if (ts.isFunctionDeclaration(statement) && hasExportModifier(statement) && statement.name) {
      if (statement.name.text === "useMDXComponents" || statement.name.text === "getMDXComponents") {
        const object = returnedObject(statement)
        if (object) targets.push(object)
        else targets.push(statement as unknown as ts.ObjectLiteralExpression)
      }
    }
    if (ts.isVariableStatement(statement)) {
      const exported = hasExportModifier(statement)
      for (const declaration of statement.declarationList.declarations) {
        if (!ts.isIdentifier(declaration.name) || !declaration.initializer) continue
        const acceptedName = ["components", "mdxComponents", "defaultComponents"].includes(declaration.name.text)
        if ((exported && acceptedName) || exportedNames.has(declaration.name.text)) {
          const object = unwrapObject(declaration.initializer)
          if (object) targets.push(object)
          else targets.push(declaration as unknown as ts.ObjectLiteralExpression)
        }
      }
    }
    if (ts.isExportAssignment(statement)) {
      if (ts.isIdentifier(statement.expression)) {
        const object = objectForVariable(sourceFile, statement.expression.text)
        if (object) targets.push(object)
        else targets.push(statement as unknown as ts.ObjectLiteralExpression)
      } else {
        const object = unwrapObject(statement.expression)
        if (object) targets.push(object)
        else targets.push(statement as unknown as ts.ObjectLiteralExpression)
      }
    }
  }
  return Array.from(new Set(targets))
}

function readBindings(input: readonly RuntimeMapBinding[]): RuntimeMapBinding[] {
  if (!Array.isArray(input) || input.length === 0 || input.length > MAX_BINDINGS) {
    throw new TypeError("Runtime map bindings must be a non-empty bounded array")
  }
  const seen = new Set<string>()
  return input
    .map((entry, index) => {
      if (!entry || typeof entry !== "object" || Array.isArray(entry))
        throw new TypeError(`Binding ${index} must be an object`)
      const values = ["mdxName", "exportName", "importSource"].map((key) => {
        const descriptor = Object.getOwnPropertyDescriptor(entry, key)
        if (!descriptor || !("value" in descriptor) || typeof descriptor.value !== "string") {
          throw new TypeError(`Binding ${index}.${key} must be an own string data property`)
        }
        return descriptor.value
      })
      const [mdxName, exportName, importSource] = values
      if (!SAFE_IDENTIFIER.test(mdxName) || !SAFE_IDENTIFIER.test(exportName) || !SAFE_IMPORT.test(importSource)) {
        throw new TypeError(`Binding ${index} contains an invalid identifier or import source`)
      }
      if (seen.has(mdxName)) throw new TypeError(`Duplicate runtime map binding ${mdxName}`)
      seen.add(mdxName)
      return { mdxName, exportName, importSource }
    })
    .sort((left, right) => compareCodeUnits(left.mdxName, right.mdxName))
}

function importedBinding(
  sourceFile: ts.SourceFile,
  binding: RuntimeMapBinding,
): { exact: boolean; collision: boolean } {
  let exact = false
  let collision = false
  for (const statement of sourceFile.statements) {
    if (!ts.isImportDeclaration(statement) || !ts.isStringLiteral(statement.moduleSpecifier)) continue
    const clause = statement.importClause
    if (!clause) continue
    if (clause.name?.text === binding.mdxName) collision = true
    if (
      clause.namedBindings &&
      ts.isNamespaceImport(clause.namedBindings) &&
      clause.namedBindings.name.text === binding.mdxName
    ) {
      collision = true
    }
    if (clause.namedBindings && ts.isNamedImports(clause.namedBindings)) {
      for (const element of clause.namedBindings.elements) {
        if (element.name.text === binding.mdxName) {
          const importedName = element.propertyName?.text ?? element.name.text
          if (statement.moduleSpecifier.text === binding.importSource && importedName === binding.exportName)
            exact = true
          else collision = true
        } else if (statement.moduleSpecifier.text === binding.importSource) {
          collision = true
        }
      }
    }
  }
  return { exact, collision }
}

function topLevelNameCollision(sourceFile: ts.SourceFile, name: string): boolean {
  for (const statement of sourceFile.statements) {
    if (ts.isImportDeclaration(statement)) continue
    if ((ts.isFunctionDeclaration(statement) || ts.isClassDeclaration(statement)) && statement.name?.text === name)
      return true
    if (ts.isVariableStatement(statement)) {
      for (const declaration of statement.declarationList.declarations) {
        if (ts.isIdentifier(declaration.name) && declaration.name.text === name) return true
      }
    }
  }
  return false
}

function propertyName(property: ts.ObjectLiteralElementLike): string | null {
  if (ts.isSpreadAssignment(property)) return null
  const name = property.name
  if (!name || ts.isComputedPropertyName(name)) return null
  if (ts.isIdentifier(name) || ts.isStringLiteral(name) || ts.isNumericLiteral(name)) return name.text
  return null
}

function insertionIndent(
  source: string,
  object: ts.ObjectLiteralExpression,
): { newline: string; indent: string; multiline: boolean } {
  const newline = source.includes("\r\n") ? "\r\n" : "\n"
  const open = object.getStart() + 1
  const close = object.end - 1
  const body = source.slice(open, close)
  const multiline = body.includes("\n") || body.includes("\r")
  if (multiline) {
    const match = body.match(/\r?\n([\t ]*)\S/u)
    return { newline, indent: match?.[1] ?? "  ", multiline }
  }
  const lineStart = source.lastIndexOf("\n", object.getStart()) + 1
  const base = source.slice(lineStart, object.getStart()).match(/^[\t ]*/u)?.[0] ?? ""
  return { newline, indent: `${base}  `, multiline }
}

function importInsertionPoint(sourceFile: ts.SourceFile): number {
  let point = 0
  for (const statement of sourceFile.statements) {
    if (
      ts.isImportDeclaration(statement) ||
      (ts.isExpressionStatement(statement) && ts.isStringLiteral(statement.expression))
    ) {
      point = statement.end
      continue
    }
    break
  }
  return point
}

export function adaptRuntimeMap({ source, bindings: inputBindings }: AdaptRuntimeMapInput): RuntimeMapEditResult {
  if (typeof source !== "string" || new TextEncoder().encode(source).byteLength > MAX_SOURCE_BYTES) {
    return refuse(
      typeof source === "string" ? source : "",
      "INVALID_SOURCE",
      "Runtime map source exceeds the supported byte limit",
    )
  }
  let bindings: RuntimeMapBinding[]
  try {
    bindings = readBindings(inputBindings)
  } catch (error) {
    return refuse(source, "BINDING_COLLISION", error instanceof Error ? error.message : "Invalid runtime binding")
  }
  const sourceFile = ts.createSourceFile("mdx-components.tsx", source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX)
  const parseDiagnostics = (sourceFile as ts.SourceFile & { parseDiagnostics: readonly ts.Diagnostic[] })
    .parseDiagnostics
  if (parseDiagnostics.length > 0) {
    return refuse(source, "INVALID_SOURCE", "Runtime map has TypeScript syntax errors; no bytes were changed")
  }
  const targets = findTargets(sourceFile)
  if (targets.length === 0) {
    return refuse(
      source,
      "UNSUPPORTED_SOURCE",
      "No supported exported MDX component map was found; add useMDXComponents or an exported static map",
    )
  }
  if (targets.length !== 1 || !ts.isObjectLiteralExpression(targets[0])) {
    return refuse(source, "AMBIGUOUS_MAP", "Runtime map is dynamic or has multiple possible exported component maps")
  }
  const target = targets[0]
  for (const property of target.properties) {
    if (!ts.isSpreadAssignment(property) && (!property.name || ts.isComputedPropertyName(property.name))) {
      return refuse(
        source,
        "UNSUPPORTED_SOURCE",
        "Computed or dynamic component-map properties cannot be edited safely",
      )
    }
  }

  const existingNames = new Set(target.properties.map(propertyName).filter((name): name is string => name !== null))
  const missingImports: RuntimeMapBinding[] = []
  const missingProperties: RuntimeMapBinding[] = []
  for (const binding of bindings) {
    const imported = importedBinding(sourceFile, binding)
    if (imported.collision || (!imported.exact && topLevelNameCollision(sourceFile, binding.mdxName))) {
      return refuse(source, "BINDING_COLLISION", `Binding ${binding.mdxName} collides with an existing local or import`)
    }
    if (existingNames.has(binding.mdxName) && !imported.exact) {
      return refuse(
        source,
        "BINDING_COLLISION",
        `Component map already defines ${binding.mdxName} from unknown authority`,
      )
    }
    if (!imported.exact) missingImports.push(binding)
    if (!existingNames.has(binding.mdxName)) missingProperties.push(binding)
  }
  if (missingImports.length === 0 && missingProperties.length === 0)
    return deepFreeze({ ok: true, source, changed: false })

  const newline = source.includes("\r\n") ? "\r\n" : "\n"
  const quote =
    sourceFile.statements
      .filter(ts.isImportDeclaration)
      .map((statement) => source.slice(statement.moduleSpecifier.getStart(), statement.moduleSpecifier.end)[0])
      .find((character) => character === "'") ?? '"'
  const importLines = missingImports
    .map((binding) => {
      const imported =
        binding.exportName === binding.mdxName ? binding.exportName : `${binding.exportName} as ${binding.mdxName}`
      return `import { ${imported} } from ${quote}${binding.importSource}${quote}`
    })
    .join(newline)
  const importPoint = importInsertionPoint(sourceFile)
  const importText = importLines
    ? importPoint > 0
      ? `${newline}${importLines}`
      : `${importLines}${newline}${source.length > 0 ? newline : ""}`
    : ""

  const style = insertionIndent(source, target)
  const propertyNames = missingProperties.map((binding) => binding.mdxName)
  const propertyText = style.multiline
    ? `${style.newline}${style.indent}${propertyNames.join(`,${style.newline}${style.indent}`)},`
    : target.properties.length > 0
      ? ` ${propertyNames.join(", ")},`
      : ` ${propertyNames.join(", ")} `
  const edits = [
    ...(importText ? [{ start: importPoint, text: importText }] : []),
    ...(propertyNames.length > 0 ? [{ start: target.getStart() + 1, text: propertyText }] : []),
  ].sort((left, right) => right.start - left.start)
  let edited = source
  for (const edit of edits) edited = `${edited.slice(0, edit.start)}${edit.text}${edited.slice(edit.start)}`
  return deepFreeze({ ok: true, source: edited, changed: true })
}
