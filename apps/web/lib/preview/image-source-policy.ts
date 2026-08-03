import {
  hasAcceptedPreviewImageHttpsAuthority,
  PREVIEW_IMAGE_SOURCE_MAX_BYTES,
} from "@/lib/preview/preview-capabilities"

const URI_SCHEME_PATTERN = /^[A-Za-z][A-Za-z0-9+.-]*:/
const RELATIVE_TRAVERSAL_PATTERN = /(?:^|\/)\.{1,2}(?:\/|$)/
const ENCODED_AMBIGUOUS_DELIMITER_PATTERN = /%(?:2f|5c|3f|23|3a|40)/i
const MAX_IMAGE_SOURCE_DECODE_ROUNDS = 2

function utf8BytesWithin(value: string, limit: number): number | null {
  if (value.length > limit) return null
  let bytes = 0
  for (let index = 0; index < value.length; index += 1) {
    const unit = value.charCodeAt(index)
    if (unit <= 0x7f) bytes += 1
    else if (unit <= 0x7ff) bytes += 2
    else if (unit >= 0xd800 && unit <= 0xdbff) {
      const next = value.charCodeAt(index + 1)
      if (next >= 0xdc00 && next <= 0xdfff) {
        bytes += 4
        index += 1
      } else bytes += 3
    } else bytes += 3
    if (bytes > limit) return null
  }
  return bytes
}

function containsControlCharacter(value: string): boolean {
  for (let index = 0; index < value.length; index += 1) {
    const unit = value.charCodeAt(index)
    if (unit <= 0x1f || (unit >= 0x7f && unit <= 0x9f)) return true
  }
  return false
}

function decodeImageSourceForms(value: string): readonly string[] | null {
  const forms = [value]
  let current = value
  for (let round = 0; round < MAX_IMAGE_SOURCE_DECODE_ROUNDS; round += 1) {
    if (ENCODED_AMBIGUOUS_DELIMITER_PATTERN.test(current)) return null
    let decoded: string
    try {
      decoded = decodeURIComponent(current)
    } catch {
      return null
    }
    if (decoded === current) return forms
    forms.push(decoded)
    current = decoded
  }
  if (ENCODED_AMBIGUOUS_DELIMITER_PATTERN.test(current)) return null
  try {
    return decodeURIComponent(current) === current ? forms : null
  } catch {
    return null
  }
}

function isValidRelativeImageSource(value: string): boolean {
  if (value.startsWith("//") || URI_SCHEME_PATTERN.test(value) || /[?#:\s]/.test(value)) return false
  const relative = value.startsWith("./") ? value.slice(2) : value.startsWith("/") ? value.slice(1) : value
  return relative.length > 0 && !relative.includes("//") && !RELATIVE_TRAVERSAL_PATTERN.test(relative)
}

/** Validates references only. Resolution and all network access remain host-owned. */
export function sanitizeCompatibleImageSource(input: unknown): string | null {
  if (typeof input !== "string" || utf8BytesWithin(input, PREVIEW_IMAGE_SOURCE_MAX_BYTES) === null) return null
  if (input.length === 0 || input.trim() !== input || containsControlCharacter(input) || input.includes("\\")) {
    return null
  }
  const forms = decodeImageSourceForms(input)
  if (!forms) return null
  const absolute = URI_SCHEME_PATTERN.test(input)
  for (const form of forms) {
    if (containsControlCharacter(form) || form.includes("\\")) return null
    if (absolute ? !hasAcceptedPreviewImageHttpsAuthority(form) : !isValidRelativeImageSource(form)) return null
  }
  return input
}
