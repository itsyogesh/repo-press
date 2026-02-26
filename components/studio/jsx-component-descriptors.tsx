import type { JsxComponentDescriptor } from '@mdxeditor/editor'

/**
 * JSX component descriptors for common MDX components.
 * These render as labeled editor boxes in WYSIWYG mode,
 * showing the component name, editable props, and rich-text children.
 */
export function getJsxComponentDescriptors(): JsxComponentDescriptor[] {
  return [
    {
      name: 'Callout',
      kind: 'flow',
      props: [
        { name: 'type', type: 'string' },
        { name: 'title', type: 'string' },
      ],
      hasChildren: true,
      Editor: ({ descriptor }) => (
        <div
          style={{
            padding: '12px 16px',
            border: '1px solid var(--studio-border)',
            borderRadius: '8px',
            background: 'var(--studio-canvas-inset)',
            margin: '8px 0',
          }}
        >
          <div
            style={{
              fontSize: '11px',
              fontWeight: 600,
              color: 'var(--studio-fg-muted)',
              marginBottom: '4px',
              textTransform: 'uppercase',
              letterSpacing: '0.05em',
            }}
          >
            📌 {descriptor.name}
          </div>
          <div>{descriptor.props.find(p => p.name === 'title')?.type || 'Callout'}</div>
        </div>
      ),
    },
    {
      name: 'Card',
      kind: 'flow',
      props: [
        { name: 'title', type: 'string' },
        { name: 'href', type: 'string' },
        { name: 'icon', type: 'string' },
      ],
      hasChildren: true,
      Editor: ({ descriptor }) => (
        <div
          style={{
            padding: '12px 16px',
            border: '1px solid var(--studio-border)',
            borderRadius: '8px',
            background: 'var(--studio-canvas-inset)',
            margin: '8px 0',
          }}
        >
          <div
            style={{
              fontSize: '11px',
              fontWeight: 600,
              color: 'var(--studio-fg-muted)',
              marginBottom: '4px',
              textTransform: 'uppercase',
              letterSpacing: '0.05em',
            }}
          >
            🃏 {descriptor.name}
          </div>
        </div>
      ),
    },
    {
      name: 'Tabs',
      kind: 'flow',
      props: [
        { name: 'items', type: 'expression' },
        { name: 'defaultValue', type: 'string' },
      ],
      hasChildren: true,
      Editor: ({ descriptor }) => (
        <div
          style={{
            padding: '12px 16px',
            border: '1px solid var(--studio-border)',
            borderRadius: '8px',
            background: 'var(--studio-canvas-inset)',
            margin: '8px 0',
          }}
        >
          <div
            style={{
              fontSize: '11px',
              fontWeight: 600,
              color: 'var(--studio-fg-muted)',
              marginBottom: '4px',
              textTransform: 'uppercase',
              letterSpacing: '0.05em',
            }}
          >
            📑 {descriptor.name}
          </div>
        </div>
      ),
    },
    {
      name: 'Steps',
      kind: 'flow',
      props: [],
      hasChildren: true,
      Editor: ({ descriptor }) => (
        <div
          style={{
            padding: '12px 16px',
            border: '1px dashed var(--studio-border)',
            borderRadius: '8px',
            background: 'var(--studio-canvas-inset)',
            margin: '8px 0',
          }}
        >
          <div
            style={{
              fontSize: '11px',
              fontWeight: 600,
              color: 'var(--studio-fg-muted)',
              textTransform: 'uppercase',
              letterSpacing: '0.05em',
            }}
          >
            🔢 {descriptor.name}
          </div>
        </div>
      ),
    },
    {
      name: 'Accordion',
      kind: 'flow',
      props: [{ name: 'title', type: 'string' }],
      hasChildren: true,
      Editor: ({ descriptor }) => (
        <div
          style={{
            padding: '12px 16px',
            border: '1px solid var(--studio-border)',
            borderRadius: '8px',
            background: 'var(--studio-canvas-inset)',
            margin: '8px 0',
          }}
        >
          <div
            style={{
              fontSize: '11px',
              fontWeight: 600,
              color: 'var(--studio-fg-muted)',
              textTransform: 'uppercase',
              letterSpacing: '0.05em',
            }}
          >
            🎵 {descriptor.name}
          </div>
        </div>
      ),
    },
  ]
}
