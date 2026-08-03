export function handleStudioSaveShortcut(event: KeyboardEvent, canSave: boolean, saveDraft: () => void) {
  if (!(event.metaKey || event.ctrlKey) || event.shiftKey || event.key.toLowerCase() !== "s") return false

  event.preventDefault()
  if (canSave) saveDraft()
  return true
}
