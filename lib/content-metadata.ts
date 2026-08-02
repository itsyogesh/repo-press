import { type Expression, type Literal, type Property, parse } from "acorn"
import matter from "gray-matter"

export type ContentMetadataSource = "frontmatter" | "metadata-export" | "none"

export type ParsedContentFile = Readonly<{
  body: string
  metadata: Readonly<Record<string, unknown>>
  metadataSource: ContentMetadataSource
  editable: boolean
  diagnostic?: "UNSUPPORTED_METADATA_EXPORT"
}>

const YAML_FRONTMATTER_PATTERN = /^\uFEFF?---\r?\n/
const METADATA_EXPORT_PATTERN = /^\uFEFF?export\s+const\s+metadata(?:\s*:[^=\r\n]+)?\s*=/
const FENCE_LINE_PATTERN = /^\s{0,3}(`{3,}|~{3,})[ \t]*(\S?)/
const DANGEROUS_KEYS = new Set(["__proto__", "constructor", "prototype"])

const MAX_METADATA_DEPTH = 32
const MAX_METADATA_NODES = 2_048
const MAX_METADATA_KEYS = 256
const MAX_ARRAY_ITEMS = 1_024
const MAX_STRING_LENGTH = 65_536
const MAX_TOTAL_STRING_LENGTH = 262_144

const EMPTY_METADATA = Object.freeze({}) as Readonly<Record<string, unknown>>

function isMdxFile(filePath: string) {
  return /\.mdx$/i.test(filePath)
}

function skipJsTrivia(content: string, start: number) {
  let index = start
  while (index < content.length) {
    while (/\s/.test(content[index] ?? "")) index += 1
    if (content.startsWith("//", index)) {
      const lineEnd = content.indexOf("\n", index + 2)
      index = lineEnd === -1 ? content.length : lineEnd + 1
      continue
    }
    if (content.startsWith("/*", index)) {
      const commentEnd = content.indexOf("*/", index + 2)
      if (commentEnd === -1) return null
      index = commentEnd + 2
      continue
    }
    return index
  }
  return index
}

function matchesMetadataDeclarationStart(content: string, start: number) {
  let index = content[start] === "\uFEFF" ? start + 1 : start
  for (const keyword of ["export", "const", "metadata"]) {
    if (!content.startsWith(keyword, index)) return false
    const boundary = content[index + keyword.length]
    if (boundary && /[$\w]/.test(boundary)) return false
    index += keyword.length
    const next = skipJsTrivia(content, index)
    if (next === null) return false
    index = next
  }
  return true
}

/** Find a column-zero metadata declaration outside CommonMark code fences. */
export function findTopLevelMetadataExportOffset(content: string) {
  let openFence: { marker: string; length: number } | null = null
  let offset = 0
  for (const line of content.split(/\r?\n/)) {
    const lineEnd = offset + line.length
    const newlineLength = content.startsWith("\r\n", lineEnd) ? 2 : content[lineEnd] === "\n" ? 1 : 0
    const fenceMatch = FENCE_LINE_PATTERN.exec(line)
    if (openFence) {
      if (
        fenceMatch &&
        fenceMatch[1][0] === openFence.marker &&
        fenceMatch[1].length >= openFence.length &&
        fenceMatch[2] === ""
      ) {
        openFence = null
      }
      offset += line.length + newlineLength
      continue
    }
    if (fenceMatch) {
      openFence = { marker: fenceMatch[1][0], length: fenceMatch[1].length }
      offset += line.length + newlineLength
      continue
    }
    if (matchesMetadataDeclarationStart(content, offset)) return offset
    offset += line.length + newlineLength
  }
  return null
}

export function hasTopLevelMetadataExport(content: string) {
  return findTopLevelMetadataExportOffset(content) !== null
}

function consumeLeadingEsmStatement(content: string, start: number) {
  const brackets: string[] = []
  const multilineMetadataDeclaration = matchesMetadataDeclarationStart(content, start)
  const metadataPrefix = multilineMetadataDeclaration ? METADATA_EXPORT_PATTERN.exec(content.slice(start)) : null
  const metadataInitializerOffset = metadataPrefix ? start + metadataPrefix[0].length : null
  let quote: '"' | "'" | null = null
  let escaped = false
  let lineComment = false
  let blockComment = false
  let metadataInitializerObjectStarted = false
  let metadataObjectClosed = false

  for (let index = start; index < content.length; index += 1) {
    const character = content[index]
    const nextCharacter = content[index + 1]

    if (lineComment) {
      if (character === "\n") {
        lineComment = false
        if (brackets.length === 0 && (!multilineMetadataDeclaration || metadataObjectClosed)) return index + 1
      }
      continue
    }
    if (blockComment) {
      if (character === "*" && nextCharacter === "/") {
        blockComment = false
        index += 1
      }
      continue
    }
    if (quote) {
      if (escaped) escaped = false
      else if (character === "\\") escaped = true
      else if (character === quote) quote = null
      continue
    }
    if (character === "`") return null
    if (character === '"' || character === "'") {
      quote = character
      continue
    }
    if (character === "/" && nextCharacter === "/") {
      lineComment = true
      index += 1
      continue
    }
    if (character === "/" && nextCharacter === "*") {
      blockComment = true
      index += 1
      continue
    }
    if (character === "{" || character === "[" || character === "(") {
      if (
        multilineMetadataDeclaration &&
        metadataInitializerOffset !== null &&
        index >= metadataInitializerOffset &&
        character === "{" &&
        brackets.length === 0
      ) {
        metadataInitializerObjectStarted = true
      }
      brackets.push(character)
      continue
    }
    if (character === "}" || character === "]" || character === ")") {
      const expected = character === "}" ? "{" : character === "]" ? "[" : "("
      if (brackets.pop() !== expected) return null
      if (metadataInitializerObjectStarted && character === "}" && brackets.length === 0) metadataObjectClosed = true
      continue
    }
    if (character === ";" && brackets.length === 0) return index + 1
    if (character === "\n" && brackets.length === 0 && (!multilineMetadataDeclaration || metadataObjectClosed)) {
      return index + 1
    }
  }

  return brackets.length === 0 && !quote && !blockComment ? content.length : null
}

type LeadingEsmScan = {
  end: number
  metadataDeclarations: ReadonlyArray<Readonly<{ start: number; end: number }>>
}

function scanLeadingEsmPreamble(content: string): LeadingEsmScan | null {
  let index = content.startsWith("\uFEFF") ? 1 : 0
  let safeEnd = index
  const metadataDeclarations: Array<{ start: number; end: number }> = []
  while (index < content.length) {
    while (/\s/.test(content[index] ?? "")) index += 1
    safeEnd = index
    if (index >= content.length) return { end: safeEnd, metadataDeclarations }

    if (content.startsWith("//", index)) {
      const lineEnd = content.indexOf("\n", index + 2)
      index = lineEnd === -1 ? content.length : lineEnd + 1
      safeEnd = index
      continue
    }
    if (content.startsWith("/*", index)) {
      const commentEnd = content.indexOf("*/", index + 2)
      if (commentEnd === -1) return null
      index = commentEnd + 2
      safeEnd = index
      continue
    }
    if (!/^(?:import|export)\b/.test(content.slice(index))) return { end: safeEnd, metadataDeclarations }
    const statementStart = index
    const statementEnd = consumeLeadingEsmStatement(content, index)
    if (statementEnd === null) return null
    if (matchesMetadataDeclarationStart(content, statementStart)) {
      metadataDeclarations.push({ start: statementStart, end: statementEnd })
    }
    index = statementEnd
    safeEnd = index
  }
  return { end: safeEnd, metadataDeclarations }
}

export function findLeadingEsmPreambleEnd(content: string) {
  return scanLeadingEsmPreamble(content)?.end ?? null
}

function startsUnsupportedContinuation(content: string) {
  const firstLineEnd = content.startsWith("\r\n") ? 2 : content.startsWith("\n") ? 1 : 0
  if (firstLineEnd === 0) return false

  let index = firstLineEnd
  while (content[index] === " " || content[index] === "\t") index += 1
  if (content.startsWith("\r\n", index) || content[index] === "\n" || index >= content.length) return false
  return /^(?:[.([?:`,+\-*/%<>=!&|^]|in\b|instanceof\b|as\b|satisfies\b)/.test(content.slice(index))
}

function declarationHasUnsupportedContinuation(content: string, declarationEnd: number) {
  if (content[declarationEnd - 1] !== "\n") return false
  const lineBreakStart = content[declarationEnd - 2] === "\r" ? declarationEnd - 2 : declarationEnd - 1
  return startsUnsupportedContinuation(content.slice(lineBreakStart))
}

/** Recover the complete leading ESM preamble containing the metadata export. */
export function extractMetadataExport(content: string) {
  const start = findTopLevelMetadataExportOffset(content)
  if (start === null) return null

  const preambleEnd = findLeadingEsmPreambleEnd(content)
  if (preambleEnd === null || start >= preambleEnd) return null

  const declaration = content.slice(start)
  const prefixMatch = METADATA_EXPORT_PATTERN.exec(declaration)
  if (!prefixMatch) return null

  const brackets: string[] = []
  let quote: '"' | "'" | "`" | null = null
  let escaped = false
  let lineComment = false
  let blockComment = false
  let objectStarted = false
  let objectEnd: number | null = null

  for (let index = prefixMatch[0].length; index < declaration.length; index += 1) {
    const character = declaration[index]
    const nextCharacter = declaration[index + 1]

    if (lineComment) {
      if (character === "\n") lineComment = false
      continue
    }
    if (blockComment) {
      if (character === "*" && nextCharacter === "/") {
        blockComment = false
        index += 1
      }
      continue
    }
    if (quote) {
      if (escaped) escaped = false
      else if (character === "\\") escaped = true
      else if (character === quote) quote = null
      continue
    }

    if (character === "/" && nextCharacter === "*") {
      blockComment = true
      index += 1
      continue
    }
    if (character === "/" && nextCharacter === "/") {
      lineComment = true
      index += 1
      continue
    }
    if (character === "/" || character === "`") return null
    if (character === '"' || character === "'") {
      quote = character
      continue
    }
    if (character === "{" || character === "[" || character === "(") {
      if (!objectStarted && character !== "{") return null
      objectStarted = true
      brackets.push(character)
      continue
    }
    if (character === "}" || character === "]" || character === ")") {
      const expected = character === "}" ? "{" : character === "]" ? "[" : "("
      if (brackets.pop() !== expected) return null
      if (objectStarted && brackets.length === 0) {
        objectEnd = index + 1
        break
      }
      continue
    }
    if (!objectStarted && !/\s/.test(character)) return null
  }

  if (objectEnd === null || quote || blockComment) return null
  const lineEndMatch = /\r?\n/.exec(declaration.slice(objectEnd))
  const lineEnd = lineEndMatch ? objectEnd + lineEndMatch.index : declaration.length
  const suffix = declaration.slice(objectEnd, lineEnd)
  if (!/^\s*(?:(?:satisfies|as)\s+[A-Za-z_$][\w$<>,.[\]\s|&]*)?;?\s*(?:\/\/[^\r\n]*)?$/.test(suffix)) return null
  const hasTerminatingSemicolon = /;\s*(?:\/\/[^\r\n]*)?$/.test(suffix)
  if (!hasTerminatingSemicolon && startsUnsupportedContinuation(declaration.slice(lineEnd))) return null

  return content.slice(0, preambleEnd).trimEnd()
}

type ParseBudget = {
  nodes: number
  keys: number
  arrayItems: number
  stringLength: number
}

function consumeStringBudget(value: string, budget: ParseBudget) {
  if (value.length > MAX_STRING_LENGTH) throw new Error("Metadata string exceeds limit")
  budget.stringLength += value.length
  if (budget.stringLength > MAX_TOTAL_STRING_LENGTH) throw new Error("Metadata strings exceed limit")
}

function literalValue(node: Literal, budget: ParseBudget) {
  if (node.regex || node.bigint !== undefined || typeof node.value === "bigint" || node.value instanceof RegExp) {
    throw new Error("Unsupported metadata literal")
  }
  if (typeof node.value === "string") consumeStringBudget(node.value, budget)
  if (typeof node.value === "number" && !Number.isFinite(node.value)) throw new Error("Metadata number must be finite")
  if (
    typeof node.value !== "string" &&
    typeof node.value !== "number" &&
    typeof node.value !== "boolean" &&
    node.value !== null
  ) {
    throw new Error("Unsupported metadata literal")
  }
  return node.value
}

function propertyKey(property: Property, budget: ParseBudget) {
  if (property.computed || property.kind !== "init" || property.method || property.shorthand) {
    throw new Error("Unsupported metadata property")
  }

  let key: string
  if (property.key.type === "Identifier") key = property.key.name
  else if (property.key.type === "Literal" && typeof property.key.value === "string") key = property.key.value
  else throw new Error("Unsupported metadata key")

  if (DANGEROUS_KEYS.has(key)) throw new Error("Dangerous metadata key")
  consumeStringBudget(key, budget)
  return key
}

function staticValue(node: Expression, depth: number, budget: ParseBudget): unknown {
  budget.nodes += 1
  if (budget.nodes > MAX_METADATA_NODES || depth > MAX_METADATA_DEPTH)
    throw new Error("Metadata structure exceeds limit")

  if (node.type === "Literal") return literalValue(node, budget)
  if (node.type === "UnaryExpression") {
    if ((node.operator !== "+" && node.operator !== "-") || node.argument.type !== "Literal") {
      throw new Error("Unsupported metadata unary expression")
    }
    const value = literalValue(node.argument, budget)
    if (typeof value !== "number") throw new Error("Unary metadata value must be numeric")
    const result = node.operator === "-" ? -value : value
    if (!Number.isFinite(result)) throw new Error("Metadata number must be finite")
    return result
  }
  if (node.type === "ArrayExpression") {
    budget.arrayItems += node.elements.length
    if (budget.arrayItems > MAX_ARRAY_ITEMS) throw new Error("Metadata array exceeds limit")
    const values = node.elements.map((element) => {
      if (element === null || element.type === "SpreadElement") throw new Error("Unsupported metadata array entry")
      return staticValue(element, depth + 1, budget)
    })
    return Object.freeze(values)
  }
  if (node.type === "ObjectExpression") {
    const record: Record<string, unknown> = {}
    for (const entry of node.properties) {
      budget.nodes += 1
      budget.keys += 1
      if (budget.nodes > MAX_METADATA_NODES || budget.keys > MAX_METADATA_KEYS || entry.type !== "Property") {
        throw new Error("Metadata object exceeds limit")
      }
      const key = propertyKey(entry, budget)
      if (Object.hasOwn(record, key)) throw new Error("Duplicate metadata key")
      Object.defineProperty(record, key, {
        value: staticValue(entry.value, depth + 1, budget),
        enumerable: true,
        configurable: false,
        writable: false,
      })
    }
    return Object.freeze(record)
  }
  throw new Error("Unsupported metadata expression")
}

function parseStaticMetadataDeclaration(declaration: string) {
  const program = parse(declaration, { ecmaVersion: "latest", sourceType: "module" })
  if (program.body.length !== 1) throw new Error("Expected one metadata export")
  const statement = program.body[0]
  if (statement.type !== "ExportNamedDeclaration" || statement.declaration?.type !== "VariableDeclaration") {
    throw new Error("Expected exported metadata declaration")
  }
  if (statement.declaration.kind !== "const" || statement.declaration.declarations.length !== 1) {
    throw new Error("Expected one exported const")
  }
  const declarator = statement.declaration.declarations[0]
  if (declarator.id.type !== "Identifier" || declarator.id.name !== "metadata" || !declarator.init) {
    throw new Error("Expected metadata initializer")
  }
  const value = staticValue(declarator.init, 0, { nodes: 0, keys: 0, arrayItems: 0, stringLength: 0 })
  if (typeof value !== "object" || value === null || Array.isArray(value)) throw new Error("Metadata must be an object")
  return value as Readonly<Record<string, unknown>>
}

function unsupportedMetadataExport(source: string): ParsedContentFile {
  return {
    body: source,
    metadata: EMPTY_METADATA,
    metadataSource: "metadata-export",
    editable: false,
    diagnostic: "UNSUPPORTED_METADATA_EXPORT",
  }
}

function freezeYamlValue(value: unknown): unknown {
  if (Array.isArray(value)) {
    for (const item of value) freezeYamlValue(item)
    return Object.freeze(value)
  }
  if (value && typeof value === "object") {
    for (const item of Object.values(value)) freezeYamlValue(item)
    return Object.freeze(value)
  }
  return value
}

export function parseContentFile(source: string, filePath: string): ParsedContentFile {
  if (YAML_FRONTMATTER_PATTERN.test(source)) {
    const parsed = matter(source.startsWith("\uFEFF") ? source.slice(1) : source)
    return {
      body: parsed.content,
      metadata: freezeYamlValue(parsed.data) as Readonly<Record<string, unknown>>,
      metadataSource: "frontmatter",
      editable: true,
    }
  }

  if (!isMdxFile(filePath) || !hasTopLevelMetadataExport(source)) {
    return { body: source, metadata: EMPTY_METADATA, metadataSource: "none", editable: true }
  }

  const preamble = scanLeadingEsmPreamble(source)
  if (
    preamble === null ||
    preamble.metadataDeclarations.length !== 1 ||
    hasTopLevelMetadataExport(source.slice(preamble.end))
  ) {
    return unsupportedMetadataExport(source)
  }
  const declaration = preamble.metadataDeclarations[0]
  if (declarationHasUnsupportedContinuation(source, declaration.end)) return unsupportedMetadataExport(source)

  try {
    const metadata = parseStaticMetadataDeclaration(source.slice(declaration.start, declaration.end))
    return {
      body: source.slice(preamble.end),
      metadata,
      metadataSource: "metadata-export",
      editable: true,
    }
  } catch {
    return unsupportedMetadataExport(source)
  }
}
