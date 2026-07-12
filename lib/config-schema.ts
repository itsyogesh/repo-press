import { z } from "zod"
import {
  assertDeclarative,
  authoringAssetSchema,
  authoringPropSchema,
  authoringProvenanceSchema,
  authoringSlotSchema,
  jsonBoundary,
  logicalIdSchema,
  mdxNameSchema,
  relativePathSchema,
  semanticVersionSchema,
} from "@/lib/repopress/registry-schema"

export const previewConfigSchema = z.object({
  entry: z.string().optional(),
  plugins: z.array(z.string()).optional(),
  allowImports: z.array(z.string()).optional(),
})

export const componentPropSchema = authoringPropSchema

const rawComponentSchema = z
  .object({
    logicalId: logicalIdSchema.optional(),
    version: semanticVersionSchema.optional(),
    exportName: mdxNameSchema.optional(),
    displayName: z.string().min(1).max(16_384).optional(),
    description: z.string().min(1).max(16_384).optional(),
    category: z.string().min(1).max(16_384).optional(),
    runtime: z.enum(["client", "server", "astro"]).optional(),
    schemaStatus: z.enum(["complete", "incomplete"]).optional(),
    props: z.array(componentPropSchema).max(128).optional(),
    assets: z.array(authoringAssetSchema).max(128).optional(),
    slots: z.array(authoringSlotSchema).max(64).optional(),
    previewFixtures: z.array(relativePathSchema).max(128).optional(),
    defaultFixture: relativePathSchema.optional(),
    import: z
      .object({ source: z.string().min(1).max(16_384), exportName: mdxNameSchema })
      .strict()
      .optional(),
    frameworks: z
      .array(z.enum(["next", "fumadocs", "astro"]))
      .max(3)
      .optional(),
    provenance: authoringProvenanceSchema.optional(),
    hasChildren: z.boolean().optional().default(true),
    kind: z.enum(["flow", "text"]).optional().default("flow"),
  })
  .strict()
  .superRefine((value, context) => {
    if (value.frameworks && new Set(value.frameworks).size !== value.frameworks.length) {
      context.addIssue({ code: z.ZodIssueCode.custom, path: ["frameworks"], message: "Frameworks must be unique" })
    }
    if (value.defaultFixture && !value.previewFixtures?.includes(value.defaultFixture)) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["defaultFixture"],
        message: "Default fixture must be listed in preview fixtures",
      })
    }
    try {
      assertDeclarative(value, "components override")
    } catch (error) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: error instanceof Error ? error.message : "Component override must be declarative",
      })
    }
  })

export const componentSchema = jsonBoundary(rawComponentSchema)

const componentMapSchema = z.record(mdxNameSchema, componentSchema).superRefine((components, context) => {
  let count = 0
  let keyBytes = 0
  for (const name in components) {
    if (!Object.hasOwn(components, name)) continue
    count += 1
    keyBytes += new TextEncoder().encode(name).byteLength
    if (count > 512) {
      context.addIssue({ code: z.ZodIssueCode.custom, message: "Component map exceeds component count limit" })
      return
    }
    if (keyBytes > 64 * 1024) {
      context.addIssue({ code: z.ZodIssueCode.custom, message: "Component map exceeds key byte limit" })
      return
    }
  }
})

export const projectConfigSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  contentRoot: z.string().default(""),
  framework: z.string().default("auto"),
  contentType: z.enum(["blog", "docs", "pages", "changelog", "custom"]).default("custom"),
  branch: z.string().optional(),
  preview: previewConfigSchema.optional(),
  components: componentMapSchema.optional(),
})

const rawRepoPressConfigSchema = z.object({
  version: z.number().int().min(1),
  defaults: z
    .object({
      branch: z.string().optional(),
      framework: z.string().optional(),
      preview: previewConfigSchema.optional(),
    })
    .optional(),
  projects: z.array(projectConfigSchema).max(512),
  plugins: z.record(z.string(), z.string()).optional(), // map of pluginId -> path
})

export const repoPressConfigSchema = jsonBoundary(rawRepoPressConfigSchema)

export type PreviewConfig = z.infer<typeof previewConfigSchema>
export type ProjectConfig = z.infer<typeof projectConfigSchema>
export type ComponentConfigInput = z.input<typeof rawComponentSchema>
export type ProjectConfigInput = Omit<ProjectConfig, "components"> & {
  components?: Record<string, ComponentConfigInput>
}
export type RepoPressConfig = z.infer<typeof repoPressConfigSchema>
