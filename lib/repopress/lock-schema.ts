import { z } from "zod"
import { integritySchema, jsonBoundary, normalizedAuthoringMetadataSchema, relativePathSchema } from "./registry-schema"

const digestSchema = z.string().regex(/^sha256:[a-f0-9]{64}$/, "Expected a full SHA-256 digest")
const immutableRefSchema = z
  .string()
  .min(1)
  .max(128)
  .regex(
    /^(?:[a-f0-9]{40}|[a-f0-9]{64}|v?\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?)$/,
    "Expected a full commit SHA or semantic version",
  )
const resolvedAddressSchema = z
  .string()
  .min(1)
  .max(2_048)
  .refine((value) => {
    if (value.startsWith("https://")) {
      try {
        const url = new URL(value)
        return url.protocol === "https:" && !url.username && !url.password && !url.search && !url.hash
      } catch {
        return false
      }
    }
    if (!/^github\.com\/[A-Za-z0-9._-]+\/[A-Za-z0-9._-]+\/[A-Za-z0-9._/-]+$/.test(value)) return false
    return !value.split("/").some((segment) => segment === "." || segment === "..")
  }, "Expected an absolute resolved registry address")

const lockEntrySchema = z
  .object({
    resolved: z.object({ address: resolvedAddressSchema, ref: immutableRefSchema }).strict(),
    integrity: integritySchema,
    dependencies: z.array(z.string().min(1).max(256)).max(256),
    targets: z
      .array(z.object({ path: relativePathSchema, digest: digestSchema }).strict())
      .min(1)
      .max(512),
    authoring: normalizedAuthoringMetadataSchema,
    localModificationDigest: digestSchema,
  })
  .strict()

const rawLockSchema = z
  .object({
    lockfileVersion: z.literal(1),
    items: z.record(z.string().min(1).max(256), lockEntrySchema),
  })
  .strict()
  .superRefine((lock, context) => {
    if (Object.keys(lock.items).length > 512) {
      context.addIssue({ code: z.ZodIssueCode.custom, path: ["items"], message: "Lockfile exceeds item count limit" })
    }
    const itemNames = new Set(Object.keys(lock.items))
    const targets = new Map<string, string>()
    for (const [itemName, item] of Object.entries(lock.items)) {
      if (item.authoring.logicalId !== itemName) {
        context.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["items", itemName, "authoring", "logicalId"],
          message: "Lock key must match authoring logicalId",
        })
      }
      if (item.authoring.provenance.integrity !== item.integrity) {
        context.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["items", itemName, "authoring", "provenance", "integrity"],
          message: "Authoring provenance integrity must match the locked item integrity",
        })
      }
      const uniqueDependencies = new Set<string>()
      for (const dependency of item.dependencies) {
        if (!itemNames.has(dependency)) {
          context.addIssue({
            code: z.ZodIssueCode.custom,
            path: ["items", itemName, "dependencies"],
            message: `Unknown dependency ${dependency}`,
          })
        }
        if (uniqueDependencies.has(dependency)) {
          context.addIssue({
            code: z.ZodIssueCode.custom,
            path: ["items", itemName, "dependencies"],
            message: `Duplicate dependency ${dependency}`,
          })
        }
        uniqueDependencies.add(dependency)
      }
      for (const target of item.targets) {
        const owner = targets.get(target.path)
        if (owner) {
          context.addIssue({
            code: z.ZodIssueCode.custom,
            path: ["items", itemName, "targets"],
            message: `Target ${target.path} collides with ${owner}`,
          })
        } else targets.set(target.path, itemName)
      }
    }

    const visiting = new Set<string>()
    const visited = new Set<string>()
    const visit = (itemName: string): void => {
      if (visiting.has(itemName)) {
        context.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["items", itemName, "dependencies"],
          message: "Dependency graph contains a cycle",
        })
        return
      }
      if (visited.has(itemName)) return
      visiting.add(itemName)
      for (const dependency of lock.items[itemName]?.dependencies ?? []) {
        if (itemNames.has(dependency)) visit(dependency)
      }
      visiting.delete(itemName)
      visited.add(itemName)
    }
    for (const itemName of itemNames) visit(itemName)
  })

export const repoPressLockSchema = jsonBoundary(rawLockSchema)
export type RepoPressLock = z.infer<typeof repoPressLockSchema>
export type RepoPressLockEntry = z.infer<typeof lockEntrySchema>
