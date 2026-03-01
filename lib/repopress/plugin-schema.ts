import { z } from "zod"

export const pluginManifestSchema = z.object({
  id: z.string(),
  name: z.string(),
  version: z.string(),
  entry: z.string(),
  components: z.array(z.string()).optional(),
  scopeExports: z.array(z.string()).optional(),
})

export type PluginManifest = z.infer<typeof pluginManifestSchema>
