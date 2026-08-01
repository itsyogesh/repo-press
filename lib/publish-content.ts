import matter from "gray-matter"

/**
 * Metadata format provenance for a content file at publish time.
 *
 * - "frontmatter": the file stores metadata as a leading YAML block
 * - "metadata-export": the MDX file stores metadata as `export const metadata = {...}`
 * - "none": the file has no detectable metadata
 */
export type ContentMetadataSource = "frontmatter" | "metadata-export" | "none"

const YAML_FRONTMATTER_PATTERN = /^\uFEFF?---\r?\n/
const METADATA_EXPORT_PATTERN = /^\uFEFF?export\s+const\s+metadata(?:\s*:[^=\r\n]+)?\s*=/
const FENCE_LINE_PATTERN = /^\s{0,3}(`{3,}|~{3,})[ \t]*(\S?)/

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

/**
 * Line scanner that reports whether any top-level (column-0, non-fenced) line
 * is an `export const metadata =` statement. Deterministic and throw-free by
 * construction: publish decisions must never depend on a full MDX parse that
 * can reject otherwise-publishable documents.
 *
 * Fences follow CommonMark closing rules: a fence closes only on a line with
 * the SAME marker character, at LEAST the opening run length, and nothing but
 * whitespace after it. A ``` line inside an open ~~~ block (or a shorter run
 * of the same marker) is content, not a close.
 */
function findTopLevelMetadataExportOffset(content: string) {
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

function hasTopLevelMetadataExport(content: string) {
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
        if (brackets.length === 0 && (!multilineMetadataDeclaration || metadataObjectClosed)) {
          return index + 1
        }
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
      if (metadataInitializerObjectStarted && character === "}" && brackets.length === 0) {
        metadataObjectClosed = true
      }
      continue
    }
    if (character === ";" && brackets.length === 0) return index + 1
    if (character === "\n" && brackets.length === 0 && (!multilineMetadataDeclaration || metadataObjectClosed)) {
      return index + 1
    }
  }

  return brackets.length === 0 && !quote && !blockComment ? content.length : null
}

function findLeadingEsmPreambleEnd(content: string) {
  let index = content.startsWith("\uFEFF") ? 1 : 0
  let safeEnd = index
  while (index < content.length) {
    while (/\s/.test(content[index] ?? "")) index += 1
    safeEnd = index
    if (index >= content.length) return safeEnd

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
    if (!/^(?:import|export)\b/.test(content.slice(index))) return safeEnd
    const statementEnd = consumeLeadingEsmStatement(content, index)
    if (statementEnd === null) return null
    index = statementEnd
    safeEnd = index
  }
  return safeEnd
}

function startsUnsupportedContinuation(content: string) {
  const firstLineEnd = content.startsWith("\r\n") ? 2 : content.startsWith("\n") ? 1 : 0
  if (firstLineEnd === 0) return false

  let index = firstLineEnd
  while (content[index] === " " || content[index] === "\t") index += 1
  if (content.startsWith("\r\n", index) || content[index] === "\n" || index >= content.length) {
    return false
  }
  return /^(?:[.([?:`,+\-*/%<>=!&|^]|in\b|instanceof\b|as\b|satisfies\b)/.test(content.slice(index))
}

/**
 * Recover the exact JavaScript declaration from the immutable Git snapshot.
 * MDXEditor does not retain mdxjsEsm nodes in rich-text output, so an edited
 * draft can legitimately contain only the body even though its source file
 * uses `export const metadata`. A non-executing lexical scanner finds the
 * declaration boundary. Unsupported or unbalanced syntax fails closed instead
 * of publishing a file with silently deleted metadata.
 */
function extractMetadataExport(content: string) {
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
      if (escaped) {
        escaped = false
      } else if (character === "\\") {
        escaped = true
      } else if (character === quote) {
        quote = null
      }
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
    if (character === "/") return null
    if (character === "`") return null
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
  if (!/^\s*(?:(?:satisfies|as)\s+[A-Za-z_$][\w$<>,.[\]\s|&]*)?;?\s*(?:\/\/[^\r\n]*)?$/.test(suffix)) {
    return null
  }
  const hasTerminatingSemicolon = /;\s*(?:\/\/[^\r\n]*)?$/.test(suffix)
  if (!hasTerminatingSemicolon && startsUnsupportedContinuation(declaration.slice(lineEnd))) return null

  return content.slice(0, preambleEnd).trimEnd()
}

export function bodyEmbedsMetadataExport(body: string) {
  return hasTopLevelMetadataExport(body)
}

/**
 * Detect the metadata format of an existing file's raw content. Used against
 * the publish preflight snapshot so serialization can preserve the format the
 * repository actually uses.
 */
export function detectMetadataSource(rawContent: string, filePath: string): ContentMetadataSource {
  if (YAML_FRONTMATTER_PATTERN.test(rawContent)) {
    return "frontmatter"
  }
  if (isMdxFile(filePath) && hasTopLevelMetadataExport(rawContent)) {
    return "metadata-export"
  }
  return "none"
}

function formatMetadataExport(frontmatter: Record<string, unknown>) {
  return `export const metadata = ${JSON.stringify(frontmatter, null, 2)}`
}

export type SerializePublishContentResult = { ok: true; content: string } | { ok: false; reason: string }

/**
 * Serialize a document for publishing while preserving the repository's
 * metadata format. Fails closed (instead of writing duplicate or converted
 * metadata) when the body already embeds `export const metadata` and separate
 * frontmatter fields also exist - that conflict needs a human decision.
 */
export function serializePublishContent({
  filePath,
  body,
  frontmatter,
  metadataSource,
  existingContent,
}: {
  filePath: string
  body: string
  frontmatter: Record<string, unknown>
  metadataSource: ContentMetadataSource
  existingContent?: string
}): SerializePublishContentResult {
  const hasFrontmatter = Object.keys(frontmatter).length > 0
  const mdx = isMdxFile(filePath)

  if (mdx && bodyEmbedsMetadataExport(body)) {
    if (hasFrontmatter) {
      return {
        ok: false,
        reason:
          "Document body embeds `export const metadata` while separate frontmatter fields exist; merge them into one metadata source before publishing",
      }
    }
    return { ok: true, content: body }
  }

  if (mdx && metadataSource === "metadata-export") {
    if (!hasFrontmatter) {
      const preservedMetadata = existingContent ? extractMetadataExport(existingContent) : null
      if (!preservedMetadata) {
        return {
          ok: false,
          reason:
            "Could not recover the existing metadata export from the pinned Git snapshot; publish stopped to prevent metadata loss",
        }
      }
      return { ok: true, content: `${preservedMetadata}\n\n${body.replace(/^\r?\n+/, "")}` }
    }
    return { ok: true, content: `${formatMetadataExport(frontmatter)}\n\n${body}` }
  }

  if (!hasFrontmatter && metadataSource === "none") {
    return { ok: true, content: body }
  }

  return { ok: true, content: matter.stringify(body, frontmatter) }
}
