"use server"

import { compile } from "@mdx-js/mdx"
import { type ExtractedImport, remarkTransformImports } from "@/components/mdx-runtime/transformImports"

export interface CompileMdxResult {
  code?: string
  error?: string
  imports?: ExtractedImport[]
}

/**
 * Replace top-level `const`/`var` declarations with `let`.
 */
function makeTopLevelDeclarationsMutable(code: string): string {
  return code
    .split("\n")
    .map((line) => {
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
      return line.replace(/^(\s*)(?:const|var)\s+/g, "$1let ")
    })
    .join("\n")
}

/**
 * Replace MDX missing-component throw checks with fallback assignments.
 */
function rewriteMissingRefChecks(code: string): string {
  code = code.replace(
    /if\s*\(!([a-zA-Z0-9_$]+)\)\s*_missingMdxReference\("([^"]+)",\s*([^)]+)\);/g,
    'if (!$1) $1 = _mdxConfig._missingMdxReference("$2", $3);',
  )
  code = code.replace(
    /if\s*\(!([a-zA-Z0-9_$]+)\)\s*\{\s*_missingMdxReference\("([^"]+)",\s*([^)]+)\);\s*\}/g,
    'if (!$1) { $1 = _mdxConfig._missingMdxReference("$2", $3); }',
  )
  return code
}

export async function compileMdxAction(
  source: string,
  allowedImports: Record<string, string[]>,
): Promise<CompileMdxResult> {
  try {
    const vfile = await compile(source, {
      outputFormat: "function-body",
      remarkPlugins: [[remarkTransformImports, { allowedImports }]],
      development: false,
    })

    const imports = vfile.data.extractedImports as ExtractedImport[] | undefined
    let code = String(vfile)

    code = makeTopLevelDeclarationsMutable(code)
    code = rewriteMissingRefChecks(code)

    return {
      code,
      imports: imports || [],
    }
  } catch (error: any) {
    console.error("[compileMdxAction] failed", error)
    return {
      error: error.message || "Failed to compile MDX",
    }
  }
}
