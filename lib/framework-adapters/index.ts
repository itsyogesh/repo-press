// Top-level barrel exports for the framework adapter system

export { allAdapters } from "./adapters"

export { UNIVERSAL_FIELDS } from "./fields"

export {
  detectFramework,
  getFrameworkAdapter,
  getFrameworkConfig,
  getRegisteredAdapters,
  registerAdapter,
  unregisterAdapter,
} from "./registry"

export type { MergedFieldDef } from "./resolve"

export {
  buildGitHubRawUrl,
  buildMergedFieldList,
  findActualFieldName,
  findExtraFields,
  inferFieldDef,
  inferType,
  normalizeDate,
  normalizeFrontmatterDates,
  resolveFieldValue,
} from "./resolve"
export type {
  ContentArchitectureInfo,
  ContentType,
  DetectionContext,
  DetectionResult,
  FieldGroup,
  FieldSemanticRole,
  FieldVariantMap,
  FrameworkAdapter,
  FrameworkConfig,
  FrontmatterFieldDef,
  FrontmatterFieldType,
  GroupedField,
  NamingStrategy,
} from "./types"
