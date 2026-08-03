import { UNIVERSAL_FIELDS } from "../fields"
import type { DetectionContext, FrameworkAdapter } from "../types"

const BLUME_CONFIG_FILES = ["blume.config.ts", "blume.config.mts", "blume.config.js", "blume.config.mjs"] as const

function declaresBlume(packageJson: unknown): boolean {
  if (!packageJson || typeof packageJson !== "object" || Array.isArray(packageJson)) return false
  const manifest = packageJson as Record<string, unknown>
  return ["dependencies", "devDependencies", "optionalDependencies"].some((key) => {
    const dependencies = manifest[key]
    return Boolean(
      dependencies && typeof dependencies === "object" && !Array.isArray(dependencies) && "blume" in dependencies,
    )
  })
}

async function readJson(ctx: DetectionContext, path: string): Promise<unknown> {
  const source = await ctx.readFile(path)
  if (!source) return null
  try {
    return JSON.parse(source)
  } catch {
    return null
  }
}

async function hasReadableConfig(ctx: DetectionContext, prefix = ""): Promise<boolean> {
  for (const fileName of BLUME_CONFIG_FILES) {
    if ((await ctx.readFile(`${prefix}${fileName}`)) !== null) return true
  }
  return false
}

export const blumeAdapter: FrameworkAdapter = {
  id: "blume",
  displayName: "Blume",
  defaultContentType: "docs",
  defaultContentRoots: ["content", "apps/docs/content"],
  metaFilePattern: "meta.ts",
  namingStrategy: "index-if-empty",
  fileExtension: ".mdx",
  fieldVariants: {},
  contentArchitecture: {
    hasConfigSchema: true,
    architectureNote:
      "Blume renders Markdown and MDX through its Astro-powered documentation runtime and supports typed navigation metadata.",
  },
  fields: UNIVERSAL_FIELDS,
  async detect(ctx) {
    const rootConfig = BLUME_CONFIG_FILES.some((fileName) => ctx.rootFileNames.includes(fileName))
    const rootPackage = declaresBlume(ctx.packageJson)
    if (rootConfig || rootPackage) {
      return {
        score: (rootConfig ? 80 : 0) + (rootPackage ? 80 : 0),
        contentType: "docs",
        suggestedContentRoots: ["content"],
      }
    }

    const nestedConfig = await hasReadableConfig(ctx, "apps/docs/")
    const nestedPackage = declaresBlume(await readJson(ctx, "apps/docs/package.json"))
    if (nestedConfig || nestedPackage) {
      return {
        score: (nestedConfig ? 80 : 0) + (nestedPackage ? 80 : 0),
        contentType: "docs",
        suggestedContentRoots: ["apps/docs/content"],
      }
    }

    return { score: 0, contentType: "docs" }
  },
}
