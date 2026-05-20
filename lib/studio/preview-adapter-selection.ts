type RuntimeSelection = {
  entryPath?: string | null
  rootPath?: string | null
}

export function resolvePreviewAdapterPath(
  resolvedRuntime: RuntimeSelection | null | undefined,
  previewEntry: string | null | undefined,
) {
  if (resolvedRuntime) {
    return resolvedRuntime.entryPath ?? null
  }

  return previewEntry ?? null
}

export function resolvePreviewAdapterRoot(resolvedRuntime: RuntimeSelection | null | undefined) {
  if (!resolvedRuntime) return null
  return resolvedRuntime.rootPath ?? null
}
