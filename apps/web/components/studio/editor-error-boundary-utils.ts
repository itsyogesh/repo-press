export function shouldResetEditorBoundary(
  hasError: boolean,
  previousResetKey: string,
  currentResetKey: string,
): boolean {
  return hasError && previousResetKey !== currentResetKey
}
