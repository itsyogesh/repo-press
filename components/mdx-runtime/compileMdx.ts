"use server"

import { compile } from "@mdx-js/mdx"
import { type ExtractedImport, remarkTransformImports } from "./transformImports"

export interface CompileMdxResult {
  code?: string
  error?: string
  imports?: ExtractedImport[]
}

/**
 * Fix #5: Replace top-level `const`/`var` declarations with `let` using a
 * line-by-line approach that skips string literals and comments, instead of
 * a single broad regex that could corrupt content inside strings.
 */
function makeTopLevelDeclarationsMutable(code: string): string {
  return code
    .split("\n")
    .map((line) => {
      // Skip lines that are clearly inside string literals or comments
      const trimmed = line.trimStart()
      if (
        trimmed.startsWith("//") ||
        trimmed.startsWith("*") ||
        trimmed.startsWith("/*") ||
        trimmed.startsWith('"') ||
        trimmed.startsWith("'") ||
        trimmed.startsWith("`")
      ) {
        return line
      }
      // Only replace `const ` or `var ` at the start of a statement
      // (possibly preceded by whitespace or a semicolon)
      return line.replace(/^(\s*)(?:const|var)\s+/g, "$1let ")
    })
    .join("\n")
}

/**
 * Fix #5: Replace MDX missing-component throw checks with fallback assignments.
 * These regexes are intentionally narrow — they match only the specific pattern
 * emitted by @mdx-js/mdx for missing references, not arbitrary code.
 */
function rewriteMissingRefChecks(code: string): string {
  // Pattern 1: if (!Foo) _missingMdxReference("Foo", true);
  code = code.replace(
    /if\s*\(!([a-zA-Z0-9_$]+)\)\s*_missingMdxReference\("([^"]+)",\s*([^)]+)\);/g,
    'if (!$1) $1 = _mdxConfig._missingMdxReference("$2", $3);',
  )
  // Pattern 2: if (!Foo) { _missingMdxReference("Foo", true); }
  code = code.replace(
    /if\s*\(!([a-zA-Z0-9_$]+)\)\s*\{\s*_missingMdxReference\("([^"]+)",\s*([^)]+)\);\s*\}/g,
    'if (!$1) { $1 = _mdxConfig._missingMdxReference("$2", $3); }',
  )
  return code
}

export async function compileMdx(source: string, allowedImports: Record<string, string[]>): Promise<CompileMdxResult> {
  try {
    const vfile = await compile(source, {
      outputFormat: "function-body",
      remarkPlugins: [[remarkTransformImports, { allowedImports }]],
      development: false,
    })

    const imports = vfile.data.extractedImports as ExtractedImport[] | undefined

    let code = String(vfile)

    // 1. Make top-level declarations mutable so fallback assignments work.
    code = makeTopLevelDeclarationsMutable(code)

    // 2. Replace the throw checks with fallback assignments.
    code = rewriteMissingRefChecks(code)

    return {
      code,
      imports: imports || [],
    }
  } catch (error: any) {
    return {
      error: error.message || "Failed to compile MDX",
    }
  }
}
