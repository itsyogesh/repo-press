// Top-level barrel exports for the framework adapter system

export { allAdapters } from "./adapters"
export { FIELD_GROUP_MAP, GROUP_LABELS, groupFields, groupMergedFields } from "./field-groups"
export { EXTENDED_UNIVERSAL_FIELDS, SEO_SCHEMA_FIELDS, UNIVERSAL_FIELDS } from "./fields"
export {
  detectFramework,
  detectFrameworkFromContext,
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
