import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react"
import { afterEach, describe, expect, it, vi } from "vitest"
import { buildAuthoringCatalog } from "@/lib/studio/authoring-catalog"
import { Editor } from "../editor"
import { createStudioAdapterState, StudioAdapterProvider } from "../studio-adapter-context"

const { editSourceReadMock, initialNormalizeMock } = vi.hoisted(() => ({
  editSourceReadMock: vi.fn(),
  initialNormalizeMock: vi.fn(),
}))

vi.mock("../component-edit-context", async () => {
  const React = await import("react")
  return {
    ComponentEditProvider: ({ getSource, children }: { getSource: () => string; children: React.ReactNode }) => {
      React.useEffect(() => editSourceReadMock(getSource()), [getSource])
      return children
    },
  }
})

vi.mock("../forward-ref-editor", async () => {
  const React = await import("react")
  return {
    ForwardRefEditor: React.forwardRef(function ForwardRefEditorMock(props: any, ref) {
      React.useImperativeHandle(ref, () => ({
        getMarkdown: () => `${props.markdown}\nMDXEditor-normalized`,
        setMarkdown: vi.fn(),
      }))
      React.useEffect(() => {
        initialNormalizeMock()
        props.onChange(`${props.markdown}\n`, true)
      }, [props.markdown, props.onChange])
      return (
        <textarea
          aria-label="MDX source editor"
          readOnly={props.readOnly}
          value={props.markdown}
          onChange={(event) => props.onChange(event.target.value)}
        />
      )
    }),
  }
})

afterEach(cleanup)

describe("Editor source preservation", () => {
  it("shows unsupported metadata as read-only and blocks editor and property callbacks", () => {
    const onChangeContent = vi.fn()
    const onChangeFrontmatter = vi.fn()
    const adapter = createStudioAdapterState({
      authoringCatalog: buildAuthoringCatalog({ metadata: {} }),
      nativeComponentNames: [],
    })

    render(
      <StudioAdapterProvider value={adapter}>
        <Editor
          content={"export const metadata = { title: makeTitle() }\n\n# Body\n"}
          frontmatter={{ title: "Preserved" }}
          onChangeContent={onChangeContent}
          onChangeFrontmatter={onChangeFrontmatter}
          onSaveDraft={vi.fn()}
          onPublish={vi.fn()}
          isSaving={false}
          isPublishing={false}
          canPublish={false}
          statusBadge={null}
          owner="acme"
          repo="docs"
          branch="main"
          readOnly
          sourceDiagnostic="UNSUPPORTED_METADATA_EXPORT"
        />
      </StudioAdapterProvider>,
    )

    expect(screen.getByRole("status")).toHaveTextContent("Metadata syntax not supported for visual editing")
    const sourceEditor = screen.getByRole("textbox", { name: "MDX source editor" })
    expect(sourceEditor).toHaveAttribute("readonly")
    expect(screen.getByRole("group", { name: "Read-only properties" })).toBeDisabled()

    fireEvent.change(sourceEditor, { target: { value: "# Changed" } })
    fireEvent.change(screen.getByLabelText("title"), { target: { value: "Changed" } })
    expect(onChangeContent).not.toHaveBeenCalled()
    expect(onChangeFrontmatter).not.toHaveBeenCalled()
  })

  it("ignores MDXEditor initial normalization but forwards a real user edit", async () => {
    initialNormalizeMock.mockClear()
    const onChangeContent = vi.fn()
    const adapter = createStudioAdapterState({
      authoringCatalog: buildAuthoringCatalog({ metadata: {} }),
      nativeComponentNames: [],
    })

    render(
      <StudioAdapterProvider value={adapter}>
        <Editor
          content="# Body"
          frontmatter={{}}
          onChangeContent={onChangeContent}
          onChangeFrontmatter={vi.fn()}
          onSaveDraft={vi.fn()}
          onPublish={vi.fn()}
          isSaving={false}
          isPublishing={false}
          canPublish={false}
          statusBadge={null}
          owner="acme"
          repo="docs"
          branch="main"
        />
      </StudioAdapterProvider>,
    )

    await waitFor(() => expect(initialNormalizeMock).toHaveBeenCalled())
    expect(onChangeContent).not.toHaveBeenCalled()
    fireEvent.change(screen.getByRole("textbox", { name: "MDX source editor" }), {
      target: { value: "# User edit" },
    })
    expect(onChangeContent).toHaveBeenCalledWith("# User edit")
  })

  it("keeps component prop edits on the application-authoritative source instead of MDXEditor serialization", async () => {
    editSourceReadMock.mockClear()
    const source = '<LetterPaper title="Classic">Keep __underscores__ exactly.</LetterPaper>'
    const adapter = createStudioAdapterState({
      authoringCatalog: buildAuthoringCatalog({
        metadata: {
          LetterPaper: {
            props: [{ name: "title", type: "string" }],
            slots: [{ name: "children", accepts: "mdx", required: true }],
          },
        },
      }),
      nativeComponentNames: [],
    })

    render(
      <StudioAdapterProvider value={adapter}>
        <Editor
          content={source}
          frontmatter={{}}
          onChangeContent={vi.fn()}
          onChangeFrontmatter={vi.fn()}
          onSaveDraft={vi.fn()}
          onPublish={vi.fn()}
          isSaving={false}
          isPublishing={false}
          canPublish={false}
          statusBadge={null}
          owner="acme"
          repo="docs"
          branch="main"
        />
      </StudioAdapterProvider>,
    )

    await waitFor(() => expect(editSourceReadMock).toHaveBeenCalled())
    expect(editSourceReadMock).toHaveBeenLastCalledWith(source)
  })
})
