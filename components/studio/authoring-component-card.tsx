"use client"

import { Box, ImageOff } from "lucide-react"
import { Button } from "@/components/ui/button"
import type { AuthoringComponent, AuthoringProp } from "@/lib/studio/authoring-catalog"
import { isStudioMediaResolveUrl } from "@/lib/studio/media-resolve"
import { cn } from "@/lib/utils"

type LiteralValue = string | number | boolean
type LiteralValues = Readonly<Record<string, unknown>>

type AuthoringComponentCardProps = {
  component: AuthoringComponent
  attributes?: readonly unknown[]
  values?: LiteralValues
  onEdit?: () => void
  editDisabled?: boolean
  className?: string
  resolveImageSource?: (source: string) => string
}

const MAX_SUMMARIES = 4
const MAX_SUMMARY_LENGTH = 96
const MAX_IMAGE_SOURCE_LENGTH = 2_048
const NUMBER_LITERAL = /^-?(?:0|[1-9]\d*)(?:\.\d+)?(?:[eE][+-]?\d+)?$/u

function isDataRecord(value: unknown): value is Record<string, unknown> {
  if (value === null || typeof value !== "object" || Array.isArray(value)) return false
  const prototype = Object.getPrototypeOf(value)
  return prototype === Object.prototype || prototype === null
}

function ownDataValue(record: Record<string, unknown>, key: string): unknown {
  const descriptor = Object.getOwnPropertyDescriptor(record, key)
  return descriptor && "value" in descriptor ? descriptor.value : undefined
}

function canonicalExpressionLiteral(value: unknown): number | boolean | undefined {
  if (!isDataRecord(value) || ownDataValue(value, "type") !== "mdxJsxAttributeValueExpression") return undefined
  const source = ownDataValue(value, "value")
  if (source === "true") return true
  if (source === "false") return false
  if (typeof source !== "string" || !NUMBER_LITERAL.test(source)) return undefined
  const parsed = Number(source)
  return Number.isFinite(parsed) ? parsed : undefined
}

function attributeLiteral(prop: AuthoringProp, attribute: Record<string, unknown>): LiteralValue | undefined {
  const value = ownDataValue(attribute, "value")
  if (value === null || value === undefined) return prop.type === "boolean" ? true : undefined
  if (typeof value === "string") return prop.type === "string" || prop.type === "image" ? value : undefined
  const expression = canonicalExpressionLiteral(value)
  if (prop.type === "boolean" && typeof expression === "boolean") return expression
  if (prop.type === "number" && typeof expression === "number") return expression
  return undefined
}

function literalsFromAttributes(
  component: AuthoringComponent,
  attributes: readonly unknown[],
): Map<string, LiteralValue> {
  const declared = new Map(component.props.map((prop) => [prop.name, prop]))
  const values = new Map<string, LiteralValue>()
  const ambiguous = new Set<string>()

  for (const candidate of attributes) {
    if (!isDataRecord(candidate) || ownDataValue(candidate, "type") !== "mdxJsxAttribute") continue
    const name = ownDataValue(candidate, "name")
    if (typeof name !== "string") continue
    const prop = declared.get(name)
    if (!prop) continue
    if (values.has(name) || ambiguous.has(name)) {
      values.delete(name)
      ambiguous.add(name)
      continue
    }
    const literal = attributeLiteral(prop, candidate)
    if (literal !== undefined) values.set(name, literal)
  }

  return values
}

function literalsFromValues(component: AuthoringComponent, values: LiteralValues): Map<string, LiteralValue> {
  const literals = new Map<string, LiteralValue>()
  if (!isDataRecord(values)) return literals
  for (const prop of component.props) {
    if (prop.type === "expression") continue
    const value = ownDataValue(values, prop.name)
    if (prop.type === "boolean" && typeof value === "boolean") literals.set(prop.name, value)
    else if (prop.type === "number" && typeof value === "number" && Number.isFinite(value))
      literals.set(prop.name, value)
    else if ((prop.type === "string" || prop.type === "image") && typeof value === "string") {
      literals.set(prop.name, value)
    }
  }
  return literals
}

function providedPropNames(
  component: AuthoringComponent,
  attributes: readonly unknown[],
  values?: LiteralValues,
): Set<string> {
  const declared = new Set(component.props.map((prop) => prop.name))
  const provided = new Set<string>()
  if (values && isDataRecord(values)) {
    for (const prop of component.props) {
      if (Object.hasOwn(values, prop.name)) provided.add(prop.name)
    }
    return provided
  }
  for (const candidate of attributes) {
    if (!isDataRecord(candidate) || ownDataValue(candidate, "type") !== "mdxJsxAttribute") continue
    const name = ownDataValue(candidate, "name")
    if (typeof name === "string" && declared.has(name)) provided.add(name)
  }
  return provided
}

function isControlledMediaSource(source: string): boolean {
  if (!isStudioMediaResolveUrl(source) || source.length > MAX_IMAGE_SOURCE_LENGTH) return false
  try {
    const url = new URL(source, "https://repopress.invalid")
    return (
      url.origin === "https://repopress.invalid" &&
      url.pathname === "/api/media/resolve" &&
      url.searchParams.has("projectId") &&
      url.searchParams.has("path")
    )
  } catch {
    return false
  }
}

function safeImageSource(value: LiteralValue | undefined): string | null {
  if (typeof value !== "string") return null
  const source = value.trim()
  if (!source || source.length > MAX_IMAGE_SOURCE_LENGTH) return null
  for (const character of source) {
    const codePoint = character.codePointAt(0) ?? 0
    if (codePoint <= 0x1f || codePoint === 0x7f || character === "\\") return null
  }
  if (source.startsWith("/") && !source.startsWith("//")) return source
  if (/^(?:\.\.?\/|[A-Za-z0-9_@-])/u.test(source) && !source.includes(":")) return source
  if (!source.startsWith("https://")) return null
  try {
    const url = new URL(source)
    return url.protocol === "https:" && !url.username && !url.password ? source : null
  } catch {
    return null
  }
}

function readableValue(value: LiteralValue): string {
  if (typeof value === "boolean") return value ? "Yes" : "No"
  const rendered = String(value)
  return rendered.length > MAX_SUMMARY_LENGTH ? `${rendered.slice(0, MAX_SUMMARY_LENGTH - 1)}…` : rendered
}

/**
 * A non-executable representation of one authoring component instance.
 * Only canonically validated metadata and primitive literal values are shown.
 */
export function AuthoringComponentCard({
  component,
  attributes = [],
  values,
  onEdit,
  editDisabled = false,
  className,
  resolveImageSource,
}: AuthoringComponentCardProps) {
  const literals = values ? literalsFromValues(component, values) : literalsFromAttributes(component, attributes)
  const provided = providedPropNames(component, attributes, values)
  const imageProp = component.props.find((prop) => prop.type === "image")
  const literalImageSource = safeImageSource(imageProp ? literals.get(imageProp.name) : undefined)
  const resolvedImageCandidate =
    literalImageSource && resolveImageSource && !isStudioMediaResolveUrl(literalImageSource)
      ? safeImageSource(resolveImageSource(literalImageSource))
      : null
  const resolvedImageSource =
    resolvedImageCandidate && isControlledMediaSource(resolvedImageCandidate) ? resolvedImageCandidate : null
  const summaries = component.props
    .filter((prop) => prop.type !== "image" && prop.type !== "expression" && provided.has(prop.name))
    .slice(0, MAX_SUMMARIES)
    .map((prop) => ({
      name: prop.name,
      label: prop.label ?? prop.name,
      value: literals.has(prop.name)
        ? readableValue(literals.get(prop.name) as LiteralValue)
        : "Value unavailable in visual editor",
    }))

  return (
    <section
      aria-label={`${component.displayName} component`}
      className={cn(
        "not-typeset overflow-hidden rounded-lg border border-studio-border bg-studio-canvas shadow-sm",
        className,
      )}
    >
      {resolvedImageSource ? (
        // Only the RepoPress-owned resolver may turn authored paths into browser requests.
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={resolvedImageSource}
          alt={`${component.displayName} preview`}
          loading="lazy"
          decoding="async"
          referrerPolicy="no-referrer"
          className="h-36 w-full border-b border-studio-border object-cover"
        />
      ) : imageProp ? (
        <div className="flex h-24 items-center justify-center border-b border-studio-border bg-studio-canvas-inset">
          <ImageOff className="size-5 text-studio-fg-muted" aria-hidden="true" />
          <span className="sr-only">Image preview unavailable</span>
        </div>
      ) : null}

      <div className="space-y-3 p-4">
        <div className="flex items-start gap-3">
          <div className="flex size-8 shrink-0 items-center justify-center rounded-md border border-studio-border bg-studio-canvas-inset">
            <Box className="size-4 text-studio-fg-muted" aria-hidden="true" />
          </div>
          <div className="min-w-0 flex-1">
            <p className="text-sm font-semibold text-studio-fg">{component.displayName}</p>
            {component.description ? (
              <p className="mt-0.5 text-xs text-studio-fg-muted">{component.description}</p>
            ) : null}
          </div>
        </div>

        {summaries.length > 0 ? (
          <dl className="grid gap-1.5 text-xs">
            {summaries.map((summary) => (
              <div key={summary.name} className="flex min-w-0 gap-1.5">
                <dt className="shrink-0 font-medium text-studio-fg-muted">{summary.label}:</dt>
                <dd className="truncate text-studio-fg">{summary.value}</dd>
              </div>
            ))}
          </dl>
        ) : null}

        {onEdit ? (
          <Button type="button" variant="outline" size="sm" disabled={editDisabled} onClick={onEdit}>
            Edit {component.displayName}
          </Button>
        ) : null}
      </div>
    </section>
  )
}
