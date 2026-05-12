// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest"
import { fireEvent, render, screen, waitFor } from "@testing-library/react"
import { beforeEach, describe, expect, it, vi } from "vitest"
import { FolderPickerDialog } from "../folder-picker-dialog"

// Mock the server action
const { fetchRepoDirsActionMock } = vi.hoisted(() => ({
  fetchRepoDirsActionMock: vi.fn(),
}))

vi.mock("@/app/dashboard/[owner]/[repo]/actions", () => ({
  fetchRepoDirsAction: fetchRepoDirsActionMock,
}))

const DEFAULT_DIRS = [
  { name: "content", path: "content" },
  { name: "src", path: "src" },
  { name: "lib", path: "lib" },
]

function setupMock(
  result?: { success: true; dirs: { name: string; path: string }[] } | { success: false; error: string },
) {
  if (!result) {
    result = { success: true, dirs: DEFAULT_DIRS }
  }
  fetchRepoDirsActionMock.mockResolvedValue(result)
}

describe("FolderPickerDialog", () => {
  const defaultProps = {
    open: true,
    onOpenChange: vi.fn(),
    onSelect: vi.fn(),
    owner: "acme",
    repo: "docs",
    branch: "main",
  }

  beforeEach(() => {
    vi.clearAllMocks()
    setupMock()
  })

  it("renders repo root option", () => {
    render(<FolderPickerDialog {...defaultProps} />)

    // Get the first occurrence of "(repo root)" - it's in the folder selection list
    expect(screen.getAllByText("(repo root)")[0]).toBeInTheDocument()
  })

  it("loads and displays root directories", async () => {
    render(<FolderPickerDialog {...defaultProps} />)

    await waitFor(() => {
      expect(screen.getAllByText("content")[0]).toBeInTheDocument()
      expect(screen.getAllByText("src")[0]).toBeInTheDocument()
      expect(screen.getAllByText("lib")[0]).toBeInTheDocument()
    })

    expect(fetchRepoDirsActionMock).toHaveBeenCalledWith("acme", "docs", "", "main")
  })

  it("selects a folder and calls onSelect on confirm", async () => {
    render(<FolderPickerDialog {...defaultProps} />)

    // Wait for initial load
    await waitFor(() => {
      expect(screen.getAllByText("content")[0]).toBeInTheDocument()
    })

    // Find the content folder row and click the folder button (not the chevron)
    // The folder name is in a button with the folder icon - use getByText to get the button directly
    const contentFolderButton = screen.getByRole("button", {
      name: /content/i,
    })
    fireEvent.click(contentFolderButton)

    // Click Confirm
    const confirmButton = screen.getByRole("button", { name: /confirm/i })
    fireEvent.click(confirmButton)

    expect(defaultProps.onSelect).toHaveBeenCalledWith("content")
    expect(defaultProps.onOpenChange).toHaveBeenCalledWith(false)
  })

  it("selects repo root by default when clicking Confirm without selecting a folder", async () => {
    render(<FolderPickerDialog {...defaultProps} />)

    // Wait for initial load
    await waitFor(() => {
      expect(screen.getAllByText("content")[0]).toBeInTheDocument()
    })

    // Click Confirm without selecting any folder
    const confirmButton = screen.getByRole("button", { name: /confirm/i })
    fireEvent.click(confirmButton)

    expect(defaultProps.onSelect).toHaveBeenCalledWith("")
  })

  it("shows error state when fetch fails", async () => {
    fetchRepoDirsActionMock.mockResolvedValue({
      success: false,
      error: "Failed to fetch directories",
    } as const)

    render(<FolderPickerDialog {...defaultProps} />)

    await waitFor(() => {
      expect(screen.getByText("Failed to fetch directories")).toBeInTheDocument()
    })

    expect(screen.getByRole("button", { name: /retry/i })).toBeInTheDocument()
  })

  it("expands folder to load children", async () => {
    // First call returns dirs with children, second call returns subdirs
    const subDirs = [
      { name: "nested", path: "content/nested" },
      { name: "other", path: "content/other" },
    ]

    let callCount = 0
    fetchRepoDirsActionMock.mockImplementation(() => {
      callCount++
      if (callCount === 1) {
        return Promise.resolve({ success: true, dirs: DEFAULT_DIRS })
      }
      return Promise.resolve({ success: true, dirs: subDirs })
    })

    render(<FolderPickerDialog {...defaultProps} />)

    // Wait for initial load
    await waitFor(() => {
      expect(screen.getAllByText("content")[0]).toBeInTheDocument()
    })

    // Find the content row and click it to expand (clicking the row toggles expansion)
    const contentButtons = screen.getAllByText("content")
    const contentButton = contentButtons[0]
    const contentRow = contentButton.closest("[role='button']") as HTMLElement

    if (contentRow) {
      fireEvent.click(contentRow)
    }

    // Wait for children to load
    await waitFor(() => {
      expect(screen.getByText("nested")).toBeInTheDocument()
    })

    expect(fetchRepoDirsActionMock).toHaveBeenCalledWith("acme", "docs", "content", "main")
  })

  it("does not re-fetch when dialog is closed", () => {
    const { rerender } = render(<FolderPickerDialog {...defaultProps} open={false} />)

    // No calls should have been made since open=false
    expect(fetchRepoDirsActionMock).not.toHaveBeenCalled()

    // Even re-rendering with open=false should not trigger fetch
    rerender(<FolderPickerDialog {...defaultProps} open={false} />)
    expect(fetchRepoDirsActionMock).not.toHaveBeenCalled()
  })
})
