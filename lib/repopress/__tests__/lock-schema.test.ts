import { describe, expect, it } from "vitest"
import { repoPressLockSchema } from "../lock-schema"

const integrity = "sha256-AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA="
const digest = `sha256:${"a".repeat(64)}`

function validLock() {
  return {
    lockfileVersion: 1,
    items: {
      "@repopress/icon": {
        resolved: { address: "https://registry.example/r/icon.json", ref: "v1.0.0" },
        integrity,
        dependencies: [],
        targets: [{ path: "components/repopress/icon.tsx", digest }],
        authoring: {
          logicalId: "@repopress/icon",
          mdxName: "Icon",
          displayName: "Icon",
          runtime: "client",
          kind: "text",
          props: [],
          slots: [],
          fixtures: [],
          assets: [],
          provenance: { source: "registry", registryItem: "@repopress/icon", version: "1.0.0", integrity },
        },
        localModificationDigest: digest,
      },
      "@repopress/callout": {
        resolved: { address: "github.com/repopress/registry/callout", ref: "0123456789abcdef0123456789abcdef01234567" },
        integrity,
        dependencies: ["@repopress/icon"],
        targets: [{ path: "components/repopress/callout.tsx", digest }],
        authoring: {
          logicalId: "@repopress/callout",
          mdxName: "Callout",
          displayName: "Callout",
          runtime: "client",
          kind: "flow",
          props: [],
          slots: [{ name: "children", accepts: "mdx" }],
          fixtures: ["registry/repopress/callout/fixture.mdx"],
          assets: [],
          provenance: { source: "registry", registryItem: "@repopress/callout", version: "1.0.0", integrity },
        },
        localModificationDigest: digest,
      },
    },
  }
}

describe("repoPressLockSchema", () => {
  it("normalizes a pinned dependency graph into detached frozen data", () => {
    const input = validLock()
    const result = repoPressLockSchema.parse(input)
    input.items["@repopress/callout"].dependencies[0] = "changed"

    expect(result.items["@repopress/callout"].dependencies).toEqual(["@repopress/icon"])
    expect(result.items["@repopress/callout"].resolved.ref).toHaveLength(40)
    expect(result.items["@repopress/callout"].localModificationDigest).toBe(digest)
    expect(Object.isFrozen(result.items["@repopress/callout"].authoring)).toBe(true)
  })

  it.each([0, 2, "1"])("rejects lockfile version %p", (lockfileVersion) => {
    expect(repoPressLockSchema.safeParse({ ...validLock(), lockfileVersion }).success).toBe(false)
  })

  it("rejects unpinned refs, malformed integrity, and malformed digests", () => {
    const unpinned = validLock()
    unpinned.items["@repopress/callout"].resolved.ref = "main"
    expect(repoPressLockSchema.safeParse(unpinned).success).toBe(false)

    const badIntegrity = validLock()
    badIntegrity.items["@repopress/callout"].integrity = ""
    expect(repoPressLockSchema.safeParse(badIntegrity).success).toBe(false)

    const badDigest = validLock()
    badDigest.items["@repopress/callout"].localModificationDigest = "sha256:"
    expect(repoPressLockSchema.safeParse(badDigest).success).toBe(false)

    const unresolved = validLock()
    unresolved.items["@repopress/callout"].resolved.address = "callout"
    expect(repoPressLockSchema.safeParse(unresolved).success).toBe(false)

    const ambiguous = validLock()
    ambiguous.items["@repopress/callout"].resolved.address = "https://registry.example/r/callout.json?token=secret"
    expect(repoPressLockSchema.safeParse(ambiguous).success).toBe(false)

    const inconsistent = validLock()
    inconsistent.items["@repopress/callout"].authoring.provenance.integrity =
      "sha256-AQAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA="
    expect(repoPressLockSchema.safeParse(inconsistent).success).toBe(false)
  })

  it("rejects missing dependencies, cycles, and colliding target paths", () => {
    const missing = validLock()
    missing.items["@repopress/callout"].dependencies = ["@repopress/missing"]
    expect(repoPressLockSchema.safeParse(missing).success).toBe(false)

    const cyclic = validLock()
    cyclic.items["@repopress/icon"].dependencies = ["@repopress/callout"] as never
    expect(repoPressLockSchema.safeParse(cyclic).success).toBe(false)

    const collision = validLock()
    collision.items["@repopress/icon"].targets[0].path = "components/repopress/callout.tsx"
    expect(repoPressLockSchema.safeParse(collision).success).toBe(false)
  })

  it("rejects unsafe targets, executable metadata, dangerous keys, and non-JSON input", () => {
    const unsafeTarget = validLock()
    unsafeTarget.items["@repopress/icon"].targets[0].path = "../outside.tsx"
    expect(repoPressLockSchema.safeParse(unsafeTarget).success).toBe(false)

    const executable = validLock()
    ;(executable.items["@repopress/icon"].authoring as Record<string, unknown>).render = "() => null"
    expect(repoPressLockSchema.safeParse(executable).success).toBe(false)

    const dangerous = validLock()
    Object.defineProperty(dangerous.items, "__proto__", { value: {}, enumerable: true })
    expect(repoPressLockSchema.safeParse(dangerous).success).toBe(false)

    const nonJson = validLock() as Record<string, unknown>
    nonJson.extra = () => null
    expect(repoPressLockSchema.safeParse(nonJson).success).toBe(false)

    const cycle = validLock() as Record<string, unknown>
    cycle.extra = cycle
    expect(repoPressLockSchema.safeParse(cycle).success).toBe(false)
  })
})
