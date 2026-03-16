"use server"

import { compile } from "@mdx-js/mdx"
import { parse } from "acorn"
import MagicString from "magic-string"
import { type ExtractedImport, remarkTransformImports } from "@/components/mdx-runtime/transformImports"

export interface CompileMdxResult {
  code?: string
  error?: string
  imports?: ExtractedImport[]
}

/**
 * Replace top-level `const`/`var` declarations with `let` safely using an AST.
 */
function makeTopLevelDeclarationsMutable(code: string): string {
  try {
    const ast = parse(code, {
      ecmaVersion: "latest",
      sourceType: "module",
      allowReturnOutsideFunction: true,
      allowAwaitOutsideFunction: true,
    }) as any

    const ms = new MagicString(code)

    for (const node of ast.body) {
      if (node.type === "VariableDeclaration" && (node.kind === "const" || node.kind === "var")) {
        ms.overwrite(node.start, node.start + node.kind.length, "let")
      }
    }

    return ms.toString()
  } catch (err) {
    console.warn("[makeTopLevelDeclarationsMutable] failed to parse", err)
    return code
  }
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
