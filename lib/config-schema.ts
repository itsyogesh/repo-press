import { z } from "zod"
import {
  assertDeclarative,
  authoringAssetSchema,
  authoringPropSchema,
  authoringProvenanceSchema,
  authoringSlotSchema,
  jsonBoundary,
} from "@/lib/repopress/registry-schema"

export const previewConfigSchema = z.object({
  entry: z.string().optional(),
  plugins: z.array(z.string()).optional(),
  allowImports: z.array(z.string()).optional(),
})

export const componentPropSchema = authoringPropSchema

const rawComponentSchema = z
  .object({
    logicalId: z.string().min(1).max(256).optional(),
    version: z.string().min(1).max(256).optional(),
    displayName: z.string().min(1).max(16_384).optional(),
    description: z.string().min(1).max(16_384).optional(),
    category: z.string().min(1).max(16_384).optional(),
    runtime: z.enum(["client", "server", "astro"]).optional(),
    schemaStatus: z.enum(["complete", "incomplete"]).optional(),
    props: z.array(componentPropSchema).max(128).optional(),
    assets: z.array(authoringAssetSchema).max(128).optional(),
    slots: z.array(authoringSlotSchema).max(64).optional(),
    fixtures: z.array(z.string().min(1).max(16_384)).max(128).optional(),
    provenance: authoringProvenanceSchema.optional(),
    hasChildren: z.boolean().optional().default(true),
    kind: z.enum(["flow", "text"]).optional().default("flow"),
  })
  .strict()
  .superRefine((value, context) => {
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

export const projectConfigSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  contentRoot: z.string().default(""),
  framework: z.string().default("auto"),
  contentType: z.enum(["blog", "docs", "pages", "changelog", "custom"]).default("custom"),
  branch: z.string().optional(),
  preview: previewConfigSchema.optional(),
  components: z.record(z.string(), componentSchema).optional(),
})

export const repoPressConfigSchema = z.object({
  version: z.number().int().min(1),
  defaults: z
    .object({
      branch: z.string().optional(),
      framework: z.string().optional(),
      preview: previewConfigSchema.optional(),
    })
    .optional(),
  projects: z.array(projectConfigSchema),
  plugins: z.record(z.string(), z.string()).optional(), // map of pluginId -> path
})

export type PreviewConfig = z.infer<typeof previewConfigSchema>
export type ProjectConfig = z.infer<typeof projectConfigSchema>
export type RepoPressConfig = z.infer<typeof repoPressConfigSchema>
