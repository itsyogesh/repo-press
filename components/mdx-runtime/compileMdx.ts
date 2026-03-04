"use server"

import { compile } from "@mdx-js/mdx"
import { type ExtractedImport, remarkTransformImports } from "./transformImports"

export interface CompileMdxResult {
  code?: string
  error?: string
  imports?: ExtractedImport[]
}

export async function compileMdx(source: string, allowedImports: Record<string, string[]>): Promise<CompileMdxResult> {
  try {
    const vfile = await compile(source, {
      outputFormat: "function-body",
      remarkPlugins: [[remarkTransformImports, { allowedImports }]],
      development: false,
    })

    const imports = vfile.data.extractedImports as ExtractedImport[] | undefined

    // MDX strictly throws when a component isn't provided.
    // We want our proxy/scope to handle missing components gracefully (rendering placeholders).
    // So we replace the hard throw statements with a fallback assignment.
    let code = String(vfile)

    // 1. MDX emits missing-component checks that we rewrite to assign placeholders.
    // To keep those assignments valid, make top-level declarations mutable.
    code = code.replace(/(^|[;\n]\s*)(?:const|var)\s+/g, "$1let ")

    // 2. Replace the throw checks with fallback assignments.
    code = code.replace(
      /if\s*\(!([a-zA-Z0-9_$]+)\)\s*_missingMdxReference\("([^"]+)",\s*([^)]+)\);/g,
      'if (!$1) $1 = _mdxConfig._missingMdxReference("$2", $3);',
    )
    code = code.replace(
      /if\s*\(!([a-zA-Z0-9_$]+)\)\s*\{\s*_missingMdxReference\("([^"]+)",\s*([^)]+)\);\s*\}/g,
      'if (!$1) { $1 = _mdxConfig._missingMdxReference("$2", $3); }',
    )

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
