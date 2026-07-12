import { describe, expect, it } from "vitest"
import { repoPressLockSchema } from "../lock-schema"

const integrity = "sha256-AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA="
const digest = `sha256:${"a".repeat(64)}`

function validLock() {
  return {
    lockfileVersion: 1,
    items: {
      "@repopress/icon": {
        resolved: {
          address: "https://registry.example/r/icon.json",
          sourceRef: "v1.0.0",
          resolvedRef: "1123456789abcdef0123456789abcdef01234567",
        },
        integrity,
        dependencies: [],
        targets: [{ path: "components/repopress/icon.tsx", digest }],
        authoring: {
          logicalId: "@repopress/icon",
          mdxName: "Icon",
          displayName: "Icon",
          version: "1.0.0",
          exportName: "Icon",
          runtime: "client",
          schemaStatus: "complete",
          kind: "text",
          props: [],
          slots: [],
          frameworks: ["next"],
          previewFixtures: [],
          assets: [],
          provenance: { source: "registry", registryItem: "@repopress/icon", version: "1.0.0", integrity },
        },
        localModificationDigest: digest,
      },
      "@repopress/callout": {
        resolved: {
          address: "github.com/repopress/registry/callout",
          sourceRef: "v1.0.0",
          resolvedRef: "0123456789abcdef0123456789abcdef01234567",
        },
        integrity,
        dependencies: ["@repopress/icon"],
        targets: [{ path: "components/repopress/callout.tsx", digest }],
        authoring: {
          logicalId: "@repopress/callout",
          mdxName: "Callout",
          displayName: "Callout",
          version: "1.0.0",
          exportName: "Callout",
          runtime: "client",
          schemaStatus: "complete",
          kind: "flow",
          props: [],
          slots: [{ name: "children", accepts: "mdx" }],
          frameworks: ["next", "fumadocs"],
          previewFixtures: ["registry/repopress/callout/fixture.mdx"],
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
    expect(result.items["@repopress/callout"].resolved.resolvedRef).toHaveLength(40)
    expect(result.items["@repopress/callout"].localModificationDigest).toBe(digest)
    expect(result.items["@repopress/callout"].targets[0].path).toBe("components/repopress/callout.tsx")
    expect(Object.isFrozen(result.items["@repopress/callout"].authoring)).toBe(true)
  })

  it.each([0, 2, "1"])("rejects lockfile version %p", (lockfileVersion) => {
    expect(repoPressLockSchema.safeParse({ ...validLock(), lockfileVersion }).success).toBe(false)
  })

  it("rejects unpinned refs, malformed integrity, and malformed digests", () => {
    const unpinned = validLock()
    unpinned.items["@repopress/callout"].resolved.sourceRef = "main"
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

    const canonicalCollision = validLock()
    canonicalCollision.items["@repopress/icon"].targets[0].path = "~/Components/Repopress/Callout.tsx"
    expect(repoPressLockSchema.safeParse(canonicalCollision).success).toBe(false)
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

  it("requires authoritative registry provenance bound to logical ID, version, integrity, and resolved refs", () => {
    for (const source of ["native", "manual"] as const) {
      const lock = validLock()
      lock.items["@repopress/callout"].authoring.provenance.source = source
      expect(repoPressLockSchema.safeParse(lock).success).toBe(false)
    }

    const itemMismatch = validLock()
    itemMismatch.items["@repopress/callout"].authoring.provenance.registryItem = "@repopress/other"
    expect(repoPressLockSchema.safeParse(itemMismatch).success).toBe(false)

    const versionMismatch = validLock()
    versionMismatch.items["@repopress/callout"].authoring.provenance.version = "2.0.0"
    expect(repoPressLockSchema.safeParse(versionMismatch).success).toBe(false)

    const authoringVersionMismatch = validLock()
    authoringVersionMismatch.items["@repopress/callout"].authoring.version = "2.0.0"
    expect(repoPressLockSchema.safeParse(authoringVersionMismatch).success).toBe(false)

    const missingVersion = validLock()
    delete (missingVersion.items["@repopress/callout"].authoring as { version?: string }).version
    expect(repoPressLockSchema.safeParse(missingVersion).success).toBe(false)

    const refMismatch = validLock()
    refMismatch.items["@repopress/callout"].resolved.sourceRef = "v2.0.0"
    expect(repoPressLockSchema.safeParse(refMismatch).success).toBe(false)
  })

  it("rejects nested authoring array accessors without invoking them", () => {
    const lock = validLock()
    const values: unknown[] = []
    let calls = 0
    Object.defineProperty(values, 0, {
      enumerable: true,
      get: () => {
        calls += 1
        return "unsafe"
      },
    })
    ;(lock.items["@repopress/callout"].authoring.props as unknown[]) = [
      { name: "data", type: "expression", default: values },
    ]
    expect(repoPressLockSchema.safeParse(lock).success).toBe(false)
    expect(calls).toBe(0)
  })

  it("canonicalizes lock ordering independently of input insertion order", () => {
    const firstInput = validLock()
    firstInput.items["@repopress/callout"].targets.push({ path: "styles/callout.css", digest })
    const secondInput = validLock()
    secondInput.items["@repopress/callout"].targets.unshift({ path: "styles/callout.css", digest })
    secondInput.items["@repopress/callout"].authoring.frameworks = ["fumadocs", "next", "next"]
    secondInput.items = {
      "@repopress/callout": secondInput.items["@repopress/callout"],
      "@repopress/icon": secondInput.items["@repopress/icon"],
    }

    const first = repoPressLockSchema.parse(firstInput)
    const second = repoPressLockSchema.parse(secondInput)
    expect(second).toStrictEqual(first)
    expect(JSON.stringify(second)).toBe(JSON.stringify(first))
  })
})
