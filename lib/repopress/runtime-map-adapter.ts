import ts from "typescript"
import { compareCodeUnits, deepFreeze } from "./registry-schema"

const MAX_SOURCE_BYTES = 2 * 1024 * 1024
const MAX_BINDINGS = 128
const MAX_STATIC_SPREAD_DEPTH = 16
const MAX_STATIC_SPREAD_OBJECTS = 64
const MAX_STATIC_SPREAD_PROPERTIES = 512
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
  if (functionNode.body.statements.length !== 1) return null
  const statement = functionNode.body.statements[0]
  if (!ts.isReturnStatement(statement) || !statement.expression) return null
  return unwrapObject(statement.expression)
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
  const bindingContains = (binding: ts.BindingName): boolean => {
    if (ts.isIdentifier(binding)) return binding.text === name
    return binding.elements.some((element) => !ts.isOmittedExpression(element) && bindingContains(element.name))
  }
  for (const statement of sourceFile.statements) {
    if (ts.isImportDeclaration(statement)) continue
    if (
      (ts.isFunctionDeclaration(statement) || ts.isClassDeclaration(statement) || ts.isEnumDeclaration(statement)) &&
      statement.name?.text === name
    )
      return true
    if (ts.isVariableStatement(statement)) {
      for (const declaration of statement.declarationList.declarations) {
        if (bindingContains(declaration.name)) return true
      }
    }
  }
  return false
}

function propertyReferencesBinding(object: ts.ObjectLiteralExpression, name: string): "missing" | "exact" | "conflict" {
  const matches = object.properties.filter((property) => propertyName(property) === name)
  if (matches.length === 0) return "missing"
  if (matches.length !== 1) return "conflict"
  const property = matches[0]
  if (ts.isShorthandPropertyAssignment(property)) return property.name.text === name ? "exact" : "conflict"
  if (ts.isPropertyAssignment(property) && ts.isIdentifier(property.initializer)) {
    return property.initializer.text === name ? "exact" : "conflict"
  }
  return "conflict"
}

function topLevelConstObjects(sourceFile: ts.SourceFile): Map<string, ts.ObjectLiteralExpression> {
  const objects = new Map<string, ts.ObjectLiteralExpression>()
  for (const statement of sourceFile.statements) {
    if (!ts.isVariableStatement(statement) || !(statement.declarationList.flags & ts.NodeFlags.Const)) continue
    for (const declaration of statement.declarationList.declarations) {
      if (ts.isIdentifier(declaration.name) && declaration.initializer && unwrapObject(declaration.initializer)) {
        objects.set(declaration.name.text, unwrapObject(declaration.initializer) as ts.ObjectLiteralExpression)
      }
    }
  }
  return objects
}

function canonicalCallerParameter(target: ts.ObjectLiteralExpression): string | null {
  let current: ts.Node | undefined = target.parent
  while (current) {
    if (
      ts.isFunctionDeclaration(current) &&
      ["useMDXComponents", "getMDXComponents"].includes(current.name?.text ?? "")
    ) {
      const parameter = current.parameters.find(
        (candidate) => ts.isIdentifier(candidate.name) && candidate.name.text === "components",
      )
      return parameter && ts.isIdentifier(parameter.name) ? parameter.name.text : null
    }
    current = current.parent
  }
  return null
}

function inspectStaticSpreadClosure(
  rootName: string,
  objects: ReadonlyMap<string, ts.ObjectLiteralExpression>,
  managedNames: ReadonlySet<string>,
): "safe" | "collision" | "unsupported" {
  const visiting = new Set<string>()
  const memo = new Map<string, "safe" | "collision" | "unsupported">()
  let objectCount = 0
  let propertyCount = 0

  const visit = (name: string, depth: number): "safe" | "collision" | "unsupported" => {
    const cached = memo.get(name)
    if (cached) return cached
    if (depth > MAX_STATIC_SPREAD_DEPTH || visiting.has(name)) return "unsupported"
    const object = objects.get(name)
    if (!object || ++objectCount > MAX_STATIC_SPREAD_OBJECTS) return "unsupported"
    visiting.add(name)
    let result: "safe" | "collision" | "unsupported" = "safe"
    for (const property of object.properties) {
      propertyCount += 1
      if (propertyCount > MAX_STATIC_SPREAD_PROPERTIES) {
        result = "unsupported"
        break
      }
      if (ts.isSpreadAssignment(property)) {
        if (!ts.isIdentifier(property.expression)) {
          result = "unsupported"
          break
        }
        const nested = visit(property.expression.text, depth + 1)
        if (nested !== "safe") {
          result = nested
          break
        }
        continue
      }
      if (!ts.isPropertyAssignment(property) && !ts.isShorthandPropertyAssignment(property)) {
        result = "unsupported"
        break
      }
      const name = propertyName(property)
      if (name === null) {
        result = "unsupported"
        break
      }
      if (managedNames.has(name)) {
        result = "collision"
        break
      }
    }
    visiting.delete(name)
    memo.set(name, result)
    return result
  }

  return visit(rootName, 0)
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

function propertyInsertionEdits(
  source: string,
  object: ts.ObjectLiteralExpression,
  propertyNames: readonly string[],
  insertionIndex: number,
): Array<{ start: number; text: string }> {
  if (propertyNames.length === 0) return []
  const style = insertionIndent(source, object)
  const before = object.properties[insertionIndex]
  if (before) {
    return [
      {
        start: before.getStart(),
        text: style.multiline
          ? `${propertyNames.join(`,${style.newline}${style.indent}`)},${style.newline}${style.indent}`
          : `${propertyNames.join(", ")}, `,
      },
    ]
  }
  if (object.properties.length === 0) {
    return [
      {
        start: object.getStart() + 1,
        text: style.multiline
          ? `${style.newline}${style.indent}${propertyNames.join(`,${style.newline}${style.indent}`)},`
          : ` ${propertyNames.join(", ")} `,
      },
    ]
  }
  const close = object.end - 1
  const last = object.properties.at(-1) as ts.ObjectLiteralElementLike
  if (!style.multiline) {
    const body = source.slice(object.getStart() + 1, close)
    const bodyEnd = object.getStart() + 1 + body.trimEnd().length
    const separator = source.slice(last.end, bodyEnd).includes(",") ? "" : ","
    return [{ start: bodyEnd, text: `${separator} ${propertyNames.join(", ")}` }]
  }
  const lineStart = source.lastIndexOf("\n", close - 1) + 1
  const hasComma = source.slice(last.end, lineStart).includes(",")
  return [
    ...(!hasComma ? [{ start: last.end, text: "," }] : []),
    {
      start: lineStart,
      text: `${style.indent}${propertyNames.join(`,${style.newline}${style.indent}`)},${style.newline}`,
    },
  ]
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
  const staticObjects = topLevelConstObjects(sourceFile)
  const callerParameter = canonicalCallerParameter(target)
  const managedNames = new Set(bindings.map((binding) => binding.mdxName))
  let callerSpreadIndex = -1
  let lastStaticSpreadIndex = -1
  for (let index = 0; index < target.properties.length; index += 1) {
    const property = target.properties[index]
    if (ts.isSpreadAssignment(property)) {
      if (ts.isIdentifier(property.expression) && property.expression.text === callerParameter) {
        if (callerSpreadIndex >= 0) {
          return refuse(source, "UNSUPPORTED_SOURCE", "The canonical caller component map may only be spread once")
        }
        callerSpreadIndex = index
        continue
      }
      if (!ts.isIdentifier(property.expression) || !staticObjects.has(property.expression.text)) {
        return refuse(
          source,
          "UNSUPPORTED_SOURCE",
          "Dynamic component-map spreads cannot be edited safely; use a known static map or function parameter",
        )
      }
      if (callerSpreadIndex >= 0) {
        return refuse(
          source,
          "UNSUPPORTED_SOURCE",
          "Static defaults after the caller override prevent a safe RepoPress insertion point",
        )
      }
      const closure = inspectStaticSpreadClosure(property.expression.text, staticObjects, managedNames)
      if (closure === "collision") {
        return refuse(source, "BINDING_COLLISION", "A static component-map spread already defines a managed binding")
      }
      if (closure === "unsupported") {
        return refuse(source, "UNSUPPORTED_SOURCE", "Static component-map spread closure is dynamic or unbounded")
      }
      lastStaticSpreadIndex = index
      continue
    }
    if (!ts.isSpreadAssignment(property) && (!property.name || ts.isComputedPropertyName(property.name))) {
      return refuse(
        source,
        "UNSUPPORTED_SOURCE",
        "Computed or dynamic component-map properties cannot be edited safely",
      )
    }
  }

  const missingImports: RuntimeMapBinding[] = []
  const missingProperties: RuntimeMapBinding[] = []
  for (const binding of bindings) {
    const imported = importedBinding(sourceFile, binding)
    if (imported.collision || (!imported.exact && topLevelNameCollision(sourceFile, binding.mdxName))) {
      return refuse(source, "BINDING_COLLISION", `Binding ${binding.mdxName} collides with an existing local or import`)
    }
    const propertyAuthority = propertyReferencesBinding(target, binding.mdxName)
    if (propertyAuthority === "conflict" || (propertyAuthority === "exact" && !imported.exact)) {
      return refuse(
        source,
        "BINDING_COLLISION",
        `Component map already defines ${binding.mdxName} from unknown authority`,
      )
    }
    if (!imported.exact) missingImports.push(binding)
    if (propertyAuthority === "missing") missingProperties.push(binding)
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

  const propertyNames = missingProperties.map((binding) => binding.mdxName)
  const insertionIndex = callerSpreadIndex >= 0 ? callerSpreadIndex : lastStaticSpreadIndex + 1
  const edits = [
    ...(importText ? [{ start: importPoint, text: importText }] : []),
    ...propertyInsertionEdits(source, target, propertyNames, insertionIndex),
  ].sort((left, right) => right.start - left.start)
  let edited = source
  for (const edit of edits) edited = `${edited.slice(0, edit.start)}${edit.text}${edited.slice(edit.start)}`
  return deepFreeze({ ok: true, source: edited, changed: true })
}
