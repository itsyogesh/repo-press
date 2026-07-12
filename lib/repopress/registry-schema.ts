import { z } from "zod"

export const REGISTRY_LIMITS = Object.freeze({
  maxDepth: 24,
  maxNodes: 10_000,
  maxBytes: 256 * 1024,
  maxStringBytes: 64 * 1024,
  maxFiles: 512,
  maxDependencies: 256,
  maxProps: 128,
  maxOptions: 256,
  maxSlots: 64,
  maxAssets: 128,
  maxFixtures: 128,
})

const DANGEROUS_KEYS = new Set(["__proto__", "prototype", "constructor"])
const EXECUTABLE_KEYS = new Set([
  "code",
  "component",
  "evaluate",
  "implementation",
  "loader",
  "module",
  "render",
  "resolver",
  "script",
  "transform",
])
const EXECUTABLE_STRING = /(?:\bfunction\b|=>|\b(?:eval|import)\s*\(|\bnew\s+Function\b|<script\b|javascript\s*:)/iu
const SAFE_NAME = /^[A-Za-z0-9@][A-Za-z0-9@._/-]{0,255}$/
const SAFE_FIELD_NAME = /^[A-Za-z_$][A-Za-z0-9_$-]{0,127}$/
const SAFE_MDX_NAME = /^[A-Za-z_$][A-Za-z0-9_$]*(?:\.[A-Za-z_$][A-Za-z0-9_$]*)*$/
const SAFE_PATH = /^(?!\/)(?!.*(?:^|\/)\.\.(?:\/|$))(?!.*[\\\0])[\p{L}\p{N}._@/ +()-]+$/u
export const integritySchema = z
  .string()
  .regex(/^sha256-[A-Za-z0-9+/]{43}=$/, "Expected SHA-256 SRI integrity")
  .refine((value) => {
    try {
      const encoded = value.slice("sha256-".length)
      const decoded = atob(encoded)
      return decoded.length === 32 && btoa(decoded) === encoded
    } catch {
      return false
    }
  }, "Expected canonical SHA-256 SRI integrity")

type PreflightState = { active: WeakSet<object>; bytes: number; nodes: number }

function addBytes(value: string, state: PreflightState): void {
  const bytes = new TextEncoder().encode(value).byteLength
  if (bytes > REGISTRY_LIMITS.maxStringBytes) throw new TypeError("Registry string exceeds byte limit")
  state.bytes += bytes
  if (state.bytes > REGISTRY_LIMITS.maxBytes) throw new TypeError("Registry metadata exceeds byte limit")
}

function preflightJson(value: unknown, state: PreflightState, depth = 0, path = "value"): void {
  if (depth > REGISTRY_LIMITS.maxDepth) throw new TypeError("Registry metadata exceeds depth limit")
  state.nodes += 1
  if (state.nodes > REGISTRY_LIMITS.maxNodes) throw new TypeError("Registry metadata exceeds node limit")
  if (value === null || typeof value === "boolean") return
  if (typeof value === "string") {
    addBytes(value, state)
    return
  }
  if (typeof value === "number") {
    if (!Number.isFinite(value)) throw new TypeError(`${path} must be finite JSON data`)
    return
  }
  if (typeof value !== "object") throw new TypeError(`${path} must be JSON data`)
  if (state.active.has(value)) throw new TypeError(`${path} contains a cycle`)
  state.active.add(value)
  const prototype = Object.getPrototypeOf(value)
  if (Array.isArray(value)) {
    for (let index = 0; index < value.length; index += 1) {
      if (!Object.hasOwn(value, index)) throw new TypeError(`${path}[${index}] must not be sparse`)
      preflightJson(value[index], state, depth + 1, `${path}[${index}]`)
    }
  } else {
    if (prototype !== Object.prototype && prototype !== null) throw new TypeError(`${path} must be a plain object`)
    for (const key of Object.keys(value)) {
      if (DANGEROUS_KEYS.has(key)) throw new TypeError(`${path} contains dangerous key ${key}`)
      const descriptor = Object.getOwnPropertyDescriptor(value, key)
      if (!descriptor || !("value" in descriptor)) throw new TypeError(`${path}.${key} must be a data property`)
      addBytes(key, state)
      preflightJson(descriptor.value, state, depth + 1, `${path}.${key}`)
    }
  }
  state.active.delete(value)
}

export function assertJson(value: unknown): void {
  preflightJson(value, { active: new WeakSet(), bytes: 0, nodes: 0 })
}

export function assertDeclarative(value: unknown, path = "meta.repopress"): void {
  if (typeof value === "string") {
    if (EXECUTABLE_STRING.test(value)) throw new TypeError(`${path} must not contain executable source`)
    return
  }
  if (!value || typeof value !== "object") return
  if (Array.isArray(value)) {
    value.forEach((entry, index) => {
      assertDeclarative(entry, `${path}[${index}]`)
    })
    return
  }
  for (const key of Object.keys(value)) {
    if (EXECUTABLE_KEYS.has(key) || /^on[A-Z]/.test(key)) throw new TypeError(`${path}.${key} is executable metadata`)
    const descriptor = Object.getOwnPropertyDescriptor(value, key)
    if (!descriptor || !("value" in descriptor)) throw new TypeError(`${path}.${key} must be a data property`)
    assertDeclarative(descriptor.value, `${path}.${key}`)
  }
}

export function jsonBoundary<T extends z.ZodTypeAny>(
  schema: T,
): z.ZodEffects<z.ZodPipeline<z.ZodEffects<z.ZodUnknown, unknown, unknown>, T>, z.output<T>, unknown> {
  return z
    .unknown()
    .superRefine((value, context) => {
      try {
        assertJson(value)
      } catch (error) {
        context.addIssue({
          code: z.ZodIssueCode.custom,
          message: error instanceof Error ? error.message : "Invalid JSON",
        })
      }
    })
    .pipe(schema)
    .transform((value) => deepFreeze(value) as z.output<T>)
}

export function deepFreeze<T>(value: T): T {
  if (!value || typeof value !== "object") return value
  for (const key of Object.keys(value)) deepFreeze((value as Record<string, unknown>)[key])
  return Object.isFrozen(value) ? value : Object.freeze(value)
}

const boundedString = z.string().min(1).max(REGISTRY_LIMITS.maxStringBytes)
const safeNameSchema = boundedString.regex(SAFE_NAME, "Invalid registry name").refine((value) => {
  return !value.split(/[./:]/).some((segment) => DANGEROUS_KEYS.has(segment))
}, "Registry name contains a dangerous segment")
const semanticVersionSchema = boundedString.regex(
  /^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?(?:\+[0-9A-Za-z.-]+)?$/,
  "Expected a semantic version",
)
export const relativePathSchema = boundedString.refine((value) => {
  const relative = value.startsWith("~/") ? value.slice(2) : value
  const segments = relative.split("/")
  return (
    value === value.normalize("NFC") &&
    !relative.includes("~") &&
    segments.every((segment) => segment !== "" && segment !== "." && segment !== "..") &&
    SAFE_PATH.test(relative)
  )
}, "Expected a safe repository-relative path")

export const registryAddressSchema = boundedString.refine((value) => {
  if (value.startsWith("https://")) {
    try {
      const url = new URL(value)
      return url.protocol === "https:" && !url.username && !url.password
    } catch {
      return false
    }
  }
  if (/^\.\/(?!.*(?:^|\/)\.\.(?:\/|$)).+\.json$/u.test(value)) return !value.includes("\\")
  return /^(?:@[A-Za-z0-9._-]+\/)?[A-Za-z0-9._-]+(?:\/[A-Za-z0-9._-]+){0,3}(?:#[A-Za-z0-9._/-]+)?$/.test(value)
}, "Invalid registry dependency address")

const jsonLiteralSchema: z.ZodType<unknown> = z.lazy(() =>
  z.union([
    z.null(),
    z.boolean(),
    z.number().finite(),
    z.string().max(REGISTRY_LIMITS.maxStringBytes),
    z.array(jsonLiteralSchema),
    z.record(jsonLiteralSchema),
  ]),
)

export const authoringPropSchema = z
  .object({
    name: boundedString.regex(SAFE_FIELD_NAME),
    type: z.enum(["string", "number", "boolean", "expression", "image"]),
    label: boundedString.optional(),
    default: jsonLiteralSchema.optional(),
    required: z.boolean().optional(),
    description: boundedString.optional(),
    options: z.array(boundedString).max(REGISTRY_LIMITS.maxOptions).optional(),
    placeholder: boundedString.optional(),
  })
  .strict()

export const authoringSlotSchema = z
  .object({
    name: boundedString.regex(SAFE_FIELD_NAME),
    accepts: z.enum(["text", "markdown", "mdx", "components"]),
    required: z.boolean().optional(),
  })
  .strict()

export const authoringAssetSchema = z
  .object({ path: relativePathSchema, type: z.enum(["image", "style", "font", "file"]) })
  .strict()

export const authoringProvenanceSchema = z
  .object({
    source: z.enum(["native", "registry", "manual"]),
    registryItem: registryAddressSchema.optional(),
    version: semanticVersionSchema.optional(),
    integrity: integritySchema.optional(),
  })
  .strict()

const authoringFields = {
  logicalId: safeNameSchema.optional(),
  mdxName: boundedString.regex(SAFE_MDX_NAME).optional(),
  displayName: boundedString.optional(),
  description: boundedString.optional(),
  category: boundedString.optional(),
  runtime: z.enum(["client", "server", "astro"]).optional(),
  schemaStatus: z.enum(["complete", "incomplete"]).optional(),
  props: z.array(authoringPropSchema).max(REGISTRY_LIMITS.maxProps).optional(),
  slots: z.array(authoringSlotSchema).max(REGISTRY_LIMITS.maxSlots).optional(),
  assets: z.array(authoringAssetSchema).max(REGISTRY_LIMITS.maxAssets).optional(),
  fixtures: z.array(relativePathSchema).max(REGISTRY_LIMITS.maxFixtures).optional(),
  provenance: authoringProvenanceSchema.optional(),
  kind: z.enum(["flow", "text"]).optional(),
  hasChildren: z.boolean().optional(),
}

function validateAuthoringCollisions(
  value: {
    props?: Array<{ name: string; options?: string[] }>
    slots?: Array<{ name: string }>
    assets?: Array<{ path: string }>
    fixtures?: string[]
  },
  context: z.RefinementCtx,
): void {
  const check = (values: readonly string[], path: string): void => {
    const seen = new Set<string>()
    values.forEach((entry, index) => {
      if (seen.has(entry)) {
        context.addIssue({
          code: z.ZodIssueCode.custom,
          path: [path, index],
          message: `Duplicate ${path} value ${entry}`,
        })
      }
      seen.add(entry)
    })
  }
  check(value.props?.map((prop) => prop.name) ?? [], "props")
  check(value.slots?.map((slot) => slot.name) ?? [], "slots")
  check(value.assets?.map((asset) => asset.path) ?? [], "assets")
  check(value.fixtures ?? [], "fixtures")
  value.props?.forEach((prop, index) => {
    const options = prop.options ?? []
    if (new Set(options).size !== options.length) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["props", index, "options"],
        message: "Prop options must be unique",
      })
    }
  })
  try {
    assertDeclarative(value)
  } catch (error) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      message: error instanceof Error ? error.message : "Executable metadata",
    })
  }
}

export const authoringMetadataSchema = z.object(authoringFields).strict().superRefine(validateAuthoringCollisions)
export const normalizedAuthoringMetadataSchema = z
  .object({
    ...authoringFields,
    logicalId: safeNameSchema,
    mdxName: boundedString.regex(SAFE_MDX_NAME),
    displayName: boundedString,
    runtime: z.enum(["client", "server", "astro"]),
    props: z.array(authoringPropSchema).max(REGISTRY_LIMITS.maxProps),
    slots: z.array(authoringSlotSchema).max(REGISTRY_LIMITS.maxSlots),
    assets: z.array(authoringAssetSchema).max(REGISTRY_LIMITS.maxAssets),
    fixtures: z.array(relativePathSchema).max(REGISTRY_LIMITS.maxFixtures),
    provenance: authoringProvenanceSchema,
    kind: z.enum(["flow", "text"]),
  })
  .strict()
  .superRefine(validateAuthoringCollisions)

export const repoPressMetadataSchema = z
  .object({
    apiVersion: z.literal(1),
    version: semanticVersionSchema,
    authoring: authoringMetadataSchema,
  })
  .strict()
  .superRefine((value, context) => {
    try {
      assertDeclarative(value)
    } catch (error) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: error instanceof Error ? error.message : "Executable metadata",
      })
    }
  })

const registryFileSchema = z
  .object({
    path: relativePathSchema,
    type: z.enum([
      "registry:base",
      "registry:block",
      "registry:component",
      "registry:font",
      "registry:hook",
      "registry:item",
      "registry:lib",
      "registry:page",
      "registry:file",
      "registry:style",
      "registry:theme",
      "registry:ui",
    ]),
    target: relativePathSchema.optional(),
    content: z.string().max(REGISTRY_LIMITS.maxStringBytes).optional(),
  })
  .strict()

const registryFontSchema = z
  .object({
    family: boundedString,
    provider: z.literal("google"),
    import: boundedString,
    variable: boundedString,
    weight: z.array(boundedString).max(32).optional(),
    subsets: z.array(boundedString).max(32).optional(),
    selector: boundedString.optional(),
    dependency: boundedString.optional(),
  })
  .strict()

const rawRegistryItemSchema = z
  .object({
    $schema: z.literal("https://ui.shadcn.com/schema/registry-item.json").optional(),
    name: safeNameSchema,
    type: registryFileSchema.shape.type,
    extends: boundedString.optional(),
    title: boundedString.optional(),
    author: boundedString.optional(),
    description: boundedString.optional(),
    dependencies: z.array(boundedString).max(REGISTRY_LIMITS.maxDependencies).optional(),
    devDependencies: z.array(boundedString).max(REGISTRY_LIMITS.maxDependencies).optional(),
    registryDependencies: z.array(registryAddressSchema).max(REGISTRY_LIMITS.maxDependencies).optional(),
    files: z.array(registryFileSchema).max(REGISTRY_LIMITS.maxFiles).optional(),
    tailwind: jsonLiteralSchema.optional(),
    cssVars: jsonLiteralSchema.optional(),
    css: jsonLiteralSchema.optional(),
    envVars: z.record(z.string().max(REGISTRY_LIMITS.maxStringBytes)).optional(),
    meta: z.record(jsonLiteralSchema),
    docs: boundedString.optional(),
    categories: z.array(boundedString).max(128).optional(),
    config: jsonLiteralSchema.optional(),
    font: registryFontSchema.optional(),
  })
  .strict()
  .superRefine((value, context) => {
    if (value.type === "registry:font" && !value.font) {
      context.addIssue({ code: z.ZodIssueCode.custom, path: ["font"], message: "registry:font requires font metadata" })
    }
    if (value.type !== "registry:font" && value.font) {
      context.addIssue({ code: z.ZodIssueCode.custom, path: ["font"], message: "font is only valid for registry:font" })
    }
    if (value.type !== "registry:base" && value.config) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["config"],
        message: "config is only valid for registry:base",
      })
    }
    value.files?.forEach((file, index) => {
      if ((file.type === "registry:file" || file.type === "registry:page") && !file.target) {
        context.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["files", index, "target"],
          message: `${file.type} requires a target`,
        })
      }
    })
    const filePaths = value.files?.map((file) => file.path) ?? []
    if (new Set(filePaths).size !== filePaths.length) {
      context.addIssue({ code: z.ZodIssueCode.custom, path: ["files"], message: "Registry file paths must be unique" })
    }
    const registryDependencies = value.registryDependencies ?? []
    if (new Set(registryDependencies).size !== registryDependencies.length) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["registryDependencies"],
        message: "Registry dependencies must be unique",
      })
    }
    const repoPress = value.meta.repopress
    const result = repoPressMetadataSchema.safeParse(repoPress)
    if (!result.success) {
      for (const issue of result.error.issues) {
        context.addIssue({ ...issue, path: ["meta", "repopress", ...issue.path] })
      }
    }
  })
  .transform((value) => {
    const repoPress = repoPressMetadataSchema.parse(value.meta.repopress)
    const meta: Record<string, unknown> & { repopress: typeof repoPress } = { ...value.meta, repopress: repoPress }
    return { ...value, meta }
  })

export const registryItemSchema = jsonBoundary(rawRegistryItemSchema)
export type RegistryItem = z.infer<typeof registryItemSchema>
export type AuthoringMetadata = z.infer<typeof authoringMetadataSchema>
export type NormalizedAuthoringMetadata = z.infer<typeof normalizedAuthoringMetadataSchema>
export type RepoPressMetadata = z.infer<typeof repoPressMetadataSchema>
