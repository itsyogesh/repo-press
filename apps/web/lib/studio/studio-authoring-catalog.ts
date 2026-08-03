import { type AuthoringCatalog, type AuthoringComponentMetadata, buildAuthoringCatalog } from "./authoring-catalog"

export function buildStudioAuthoringCatalog({
  projectMetadata,
  installedRegistryMetadata,
  framework,
}: {
  projectMetadata?: Readonly<Record<string, AuthoringComponentMetadata>> | null
  installedRegistryMetadata?: Readonly<Record<string, AuthoringComponentMetadata>> | null
  framework?: string
}): AuthoringCatalog {
  const projectCatalog = buildAuthoringCatalog({ metadata: projectMetadata, framework })
  const registryCatalog = buildAuthoringCatalog({ metadata: installedRegistryMetadata, framework })
  const merged: Record<string, AuthoringComponentMetadata> = Object.create(null)
  for (const component of projectCatalog) merged[component.mdxName] = component
  // Ratified catalog precedence: an installed, integrity-bound registry schema
  // wins over optional project/config metadata for the same MDX component name.
  for (const component of registryCatalog) merged[component.mdxName] = component
  return buildAuthoringCatalog({ metadata: merged, framework })
}
