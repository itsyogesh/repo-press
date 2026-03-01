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

    return {
      code: String(vfile),
      imports: imports || [],
    }
  } catch (error: any) {
    return {
      error: error.message || "Failed to compile MDX",
    }
  }
}
