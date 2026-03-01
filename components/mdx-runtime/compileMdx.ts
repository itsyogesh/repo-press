"use server"

import { compile } from "@mdx-js/mdx"
import { remarkTransformImports, ExtractedImport } from "./transformImports"

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

    // 1. Change const to let only for component/scope declarations
    // MDX v3 typically uses const { ... } = props.components or similar patterns
    // We target declarations to avoid matching keywords inside strings or comments.
    code = code.replace(/(^|;|\n)\s*const\s+\{/g, "$1let {")
    code = code.replace(/(^|;|\n)\s*var\s+\{/g, "$1let {")

    // 2. Replace the throw check with a fallback assignment using a safer approach
    code = code.replace(
      /if\s*\(!([a-zA-Z0-9_$]+)\)\s*_missingMdxReference\("([^"]+)",\s*([^)]+)\);/g,
      'try { if (!$1) $1 = _mdxConfig._missingMdxReference("$2", $3); } catch(e) { /* ignore read-only */ }',
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
