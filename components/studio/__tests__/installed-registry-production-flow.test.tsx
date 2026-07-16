import fs from "node:fs"
import path from "node:path"
import { cleanup, fireEvent, render, screen } from "@testing-library/react"
import { afterEach, describe, expect, it, vi } from "vitest"
import { getBranchHeadSha, getTextFilesAtCommit } from "@/lib/github"
import { loadProjectLockAuthoringMetadata } from "@/lib/repopress/project-lock-snapshot"
import { normalizeRegistryAuthoringMetadata, registryItemSchema } from "@/lib/repopress/registry-schema"
import { buildStudioAuthoringCatalog } from "@/lib/studio/studio-authoring-catalog"
import { ComponentInsertModal } from "../component-insert-modal"
import { createStudioAdapterState, StudioAdapterProvider } from "../studio-adapter-context"
import { StudioProvider } from "../studio-context"

vi.mock("@/lib/github", () => ({
  getBranchHeadSha: vi.fn(),
  getTextFilesAtCommit: vi.fn(),
}))

function officialCalloutLock(): string {
  const registry = JSON.parse(fs.readFileSync(path.join(process.cwd(), "registry.json"), "utf8")) as {
    items: unknown[]
  }
  const item = registryItemSchema.parse(registry.items[0])
  const authoring = normalizeRegistryAuthoringMetadata(item)
  const integrity = authoring.provenance.integrity
  if (!integrity) throw new TypeError("Official Callout must have integrity")
  return JSON.stringify({
    lockfileVersion: 1,
    items: {
      [authoring.logicalId]: {
        resolved: {
          address: "https://registry.repopress.dev/callout/registry-item.json",
          sourceRef: "1.0.0",
          resolvedRef: "b".repeat(40),
        },
        integrity,
        dependencies: [],
        targets: [
          {
            path: "apps/docs/components/repopress/callout.tsx",
            digest: `sha256:${"c".repeat(64)}`,
          },
        ],
        managedCss: [],
        authoring,
        localModificationDigest: `sha256:${"d".repeat(64)}`,
      },
    },
  })
}

afterEach(() => {
  cleanup()
  vi.clearAllMocks()
})

describe("installed registry authoring in production Studio", () => {
  it("loads the authorized project lock at its exact head SHA and drives the real palette", async () => {
    const baseSha = "a".repeat(40)
    vi.mocked(getBranchHeadSha).mockResolvedValue(baseSha)
    vi.mocked(getTextFilesAtCommit).mockResolvedValue([
      { path: "apps/docs/repopress.lock.json", content: officialCalloutLock() },
    ])

    const installed = await loadProjectLockAuthoringMetadata({
      accessToken: "github-token",
      project: {
        repoOwner: "acme",
        repoName: "docs",
        branch: "release",
        contentRoot: "apps/docs/content",
      },
    })

    expect(getBranchHeadSha).toHaveBeenCalledWith("github-token", "acme", "docs", "release")
    expect(getTextFilesAtCommit).toHaveBeenCalledWith("github-token", "acme", "docs", baseSha, [
      "apps/docs/repopress.lock.json",
      "apps/repopress.lock.json",
      "repopress.lock.json",
    ])
    expect(installed.baseSha).toBe(baseSha)
    expect(installed.lockPath).toBe("apps/docs/repopress.lock.json")
    expect(installed.diagnostics).toEqual([])
    expect(Object.isFrozen(installed.metadata)).toBe(true)
    expect(Object.isFrozen(installed.metadata.Callout)).toBe(true)
    expect(Object.isFrozen(installed.metadata.Callout.props)).toBe(true)
    expect(installed.metadata.Callout).toMatchObject({
      logicalId: "@repopress/callout",
      mdxName: "Callout",
      schemaStatus: "complete",
      provenance: { source: "registry" },
    })

    const catalog = buildStudioAuthoringCatalog({
      projectMetadata: {
        Callout: { displayName: "Unsafe manual shadow", props: [], hasChildren: false },
      },
      installedRegistryMetadata: installed.metadata,
      framework: "next",
    })
    expect(catalog[0].displayName).toBe("Callout")
    expect(catalog[0].props.map((prop) => prop.name)).toEqual(["title", "titleId", "variant"])

    const adapterState = createStudioAdapterState({ authoringCatalog: catalog, nativeComponentNames: [] })
    render(
      <StudioProvider
        value={{
          owner: "acme",
          repo: "docs",
          branch: "release",
          contentRoot: "apps/docs/content",
          tree: [],
          role: "owner",
        }}
      >
        <StudioAdapterProvider value={adapterState}>
          <ComponentInsertModal open onOpenChange={vi.fn()} authoringCatalog={catalog} onInsert={vi.fn()} />
        </StudioAdapterProvider>
      </StudioProvider>,
    )
    fireEvent.click(screen.getByRole("button", { name: /Callout/i }))
    expect(await screen.findByRole("combobox", { name: "Variant" })).toHaveTextContent("default")
    expect(screen.getByRole("textbox", { name: "Children" })).toBeRequired()
  })
})
