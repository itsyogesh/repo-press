import { Fragment, type ReactNode } from "react"
import {
  ensureRendererSafeGenericRenderModel,
  type GenericBlock,
  type GenericInline,
  type GenericRenderModel,
} from "@/lib/preview/generic-render-model"

export function GenericPreview({
  model,
  resolveAssetUrl,
}: {
  model: GenericRenderModel
  resolveAssetUrl?: (path: string) => string
}) {
  const safeModel = ensureRendererSafeGenericRenderModel(model)
  return safeModel.blocks.map((block, index) => (
    <Fragment key={`${block.type}-${index}`}>{renderBlock(block, resolveAssetUrl)}</Fragment>
  ))
}

function renderBlock(block: GenericBlock, resolveAssetUrl?: (path: string) => string): ReactNode {
  switch (block.type) {
    case "heading":
      return createHeading(block.depth, renderInlines(block.children, resolveAssetUrl))
    case "paragraph":
      return <p>{renderInlines(block.children, resolveAssetUrl)}</p>
    case "list": {
      const List = block.ordered ? "ol" : "ul"
      return (
        <List start={block.ordered ? (block.start ?? undefined) : undefined}>
          {block.items.map((item, index) => (
            // biome-ignore lint/suspicious/noArrayIndexKey: immutable render-model children have no component state
            <li key={index} className={item.checked === null ? undefined : "task-list-item"}>
              {item.checked === null ? null : <input type="checkbox" checked={item.checked} disabled readOnly />}
              {item.blocks.map((child, childIndex) => (
                <Fragment key={`${child.type}-${childIndex}`}>{renderBlock(child, resolveAssetUrl)}</Fragment>
              ))}
            </li>
          ))}
        </List>
      )
    }
    case "blockquote":
      return (
        <blockquote>
          {block.blocks.map((child, index) => (
            <Fragment key={`${child.type}-${index}`}>{renderBlock(child, resolveAssetUrl)}</Fragment>
          ))}
        </blockquote>
      )
    case "code":
      return (
        <pre data-language={block.language ?? undefined}>
          <code>{block.value}</code>
        </pre>
      )
    case "table":
      return (
        <div className="typeset-scroll">
          <table>
            <thead>
              {block.rows.length > 0 ? renderTableRow(block.rows[0], block.align, true, 0, resolveAssetUrl) : null}
            </thead>
            <tbody>
              {block.rows
                .slice(1)
                .map((row, rowIndex) => renderTableRow(row, block.align, false, rowIndex + 1, resolveAssetUrl))}
            </tbody>
          </table>
        </div>
      )
    case "thematic-break":
      return <hr />
    case "component-placeholder":
      return <ComponentPlaceholder name={block.name} />
    case "diagnostic":
      return <DiagnosticPlaceholder code={block.code} message={block.message} />
  }
}

function DiagnosticPlaceholder({ code, message }: { code: string; message: string }) {
  return (
    <div
      className="not-typeset not-prose my-4 rounded-lg border border-dashed border-studio-attention/50 bg-studio-attention-muted/40 px-3 py-2 text-sm text-studio-fg"
      data-not-typeset
      data-preview-diagnostic={code}
    >
      <code className="font-mono text-xs">{code}</code>
      <p className="mt-1 text-studio-fg-muted">{message}</p>
    </div>
  )
}

function renderTableRow(
  row: Extract<GenericBlock, { type: "table" }>["rows"][number],
  align: Extract<GenericBlock, { type: "table" }>["align"],
  header: boolean,
  rowIndex: number,
  resolveAssetUrl?: (path: string) => string,
) {
  const Cell = header ? "th" : "td"
  return (
    <tr key={rowIndex}>
      {row.map((cell, cellIndex) => (
        // biome-ignore lint/suspicious/noArrayIndexKey: immutable render-model cells have no component state
        <Cell key={cellIndex} align={align[cellIndex] ?? undefined}>
          {renderInlines(cell.children, resolveAssetUrl)}
        </Cell>
      ))}
    </tr>
  )
}

function renderInlines(inlines: GenericInline[], resolveAssetUrl?: (path: string) => string): ReactNode[] {
  return inlines.map((inline, index) => {
    const key = `${inline.type}-${index}`
    switch (inline.type) {
      case "text":
        return <Fragment key={key}>{inline.value}</Fragment>
      case "strong":
        return <strong key={key}>{renderInlines(inline.children, resolveAssetUrl)}</strong>
      case "emphasis":
        return <em key={key}>{renderInlines(inline.children, resolveAssetUrl)}</em>
      case "delete":
        return <del key={key}>{renderInlines(inline.children, resolveAssetUrl)}</del>
      case "inline-code":
        return <code key={key}>{inline.value}</code>
      case "link":
        return (
          <a key={key} href={inline.url} title={inline.title ?? undefined}>
            {renderInlines(inline.children, resolveAssetUrl)}
          </a>
        )
      case "image":
        return (
          // Dynamic repository images cannot use next/image without knowing
          // their dimensions or remote host configuration ahead of time.
          <img
            key={key}
            src={resolveAssetUrl ? resolveAssetUrl(inline.url) : inline.url}
            alt={inline.alt}
            title={inline.title ?? undefined}
            loading="lazy"
          />
        )
      case "break":
        return <br key={key} />
      case "component-placeholder":
        return <ComponentPlaceholder key={key} name={inline.name} inline />
      default:
        return null
    }
  })
}

function ComponentPlaceholder({ name, inline = false }: { name: string; inline?: boolean }) {
  const Tag = inline ? "span" : "div"
  return (
    <Tag
      className="not-typeset not-prose my-4 rounded-lg border border-dashed border-studio-border bg-studio-canvas-inset/50 px-3 py-2 font-mono text-xs text-studio-fg-muted"
      data-component-name={name}
      data-not-typeset
    >
      {`<${name} />`}
    </Tag>
  )
}

function createHeading(depth: 1 | 2 | 3 | 4 | 5 | 6, children: ReactNode) {
  switch (depth) {
    case 1:
      return <h1>{children}</h1>
    case 2:
      return <h2>{children}</h2>
    case 3:
      return <h3>{children}</h3>
    case 4:
      return <h4>{children}</h4>
    case 5:
      return <h5>{children}</h5>
    case 6:
      return <h6>{children}</h6>
  }
}
