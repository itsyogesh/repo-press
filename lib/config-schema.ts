import { z } from "zod"

export const previewConfigSchema = z.object({
  entry: z.string().optional(),
  plugins: z.array(z.string()).optional(),
  allowImports: z.array(z.string()).optional(),
})

export const projectConfigSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  contentRoot: z.string().default(""),
  framework: z.string().default("auto"),
  contentType: z.enum(["blog", "docs", "pages", "changelog", "custom"]).default("custom"),
  branch: z.string().optional(),
  preview: previewConfigSchema.optional(),
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
  projects: z.array(projectConfigSchema).min(1, "At least one project must be defined in the config."),
  plugins: z.record(z.string(), z.string()).optional(), // map of pluginId -> path
})

export type PreviewConfig = z.infer<typeof previewConfigSchema>
export type ProjectConfig = z.infer<typeof projectConfigSchema>
export type RepoPressConfig = z.infer<typeof repoPressConfigSchema>
