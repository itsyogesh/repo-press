import type { Metadata } from "next"
import Link from "next/link"

export const metadata: Metadata = {
  title: "Studio Editor",
  description: "Write and publish with the RepoPress Studio - visual editing, live preview, and version history.",
}

export default function StudioEditorPage() {
  return (
    <div>
      <h1 className="mb-6 text-3xl font-semibold tracking-tight">Studio Editor</h1>

      <p className="mb-4 leading-relaxed text-muted-foreground">
        The Studio is the heart of RepoPress - a visual editor for MDX and Markdown files that commits directly to your
        GitHub repository. This guide covers every part of the editing experience.
      </p>

      {/* Editor Layout */}
      <h2 className="mb-4 mt-12 text-2xl font-semibold">Editor Layout</h2>
      <p className="mb-4 leading-relaxed text-muted-foreground">The Studio is organized into three resizable panels:</p>
      <ul className="mb-4 list-inside list-disc space-y-2 text-muted-foreground">
        <li>
          <strong className="text-foreground">File Tree (Left)</strong> - Browse your repository&rsquo;s content
          directory. Click any file to open it in the editor. Directories are collapsible, and the current file is
          highlighted.
        </li>
        <li>
          <strong className="text-foreground">Editor (Center)</strong> - The main editing area. Edit frontmatter fields
          at the top and content below. A formatting toolbar provides quick access to headings, bold, italic, links,
          images, and code blocks.
        </li>
        <li>
          <strong className="text-foreground">Preview (Right)</strong> - A real-time rendered preview of your MDX
          content. As you type, the preview updates instantly so you can see exactly how your content will look.
        </li>
      </ul>
      <p className="mb-4 leading-relaxed text-muted-foreground">
        You can resize each panel by dragging the dividers, or collapse the file tree and preview panels to focus on
        writing.
      </p>

      {/* MDX Editing */}
      <h2 className="mb-4 mt-12 text-2xl font-semibold">MDX Editing with Frontmatter</h2>
      <p className="mb-4 leading-relaxed text-muted-foreground">
        RepoPress understands MDX frontmatter natively. When you open a file with frontmatter (the YAML block between{" "}
        <span className="rounded bg-muted px-1.5 py-0.5 font-mono text-sm">---</span> delimiters), the Studio displays
        each field as a structured form input:
      </p>
      <ul className="mb-4 list-inside list-disc space-y-2 text-muted-foreground">
        <li>
          <strong className="text-foreground">Text fields</strong> - For{" "}
          <span className="rounded bg-muted px-1.5 py-0.5 font-mono text-sm">title</span>,{" "}
          <span className="rounded bg-muted px-1.5 py-0.5 font-mono text-sm">description</span>, and other string values
        </li>
        <li>
          <strong className="text-foreground">Date pickers</strong> - For{" "}
          <span className="rounded bg-muted px-1.5 py-0.5 font-mono text-sm">date</span> and{" "}
          <span className="rounded bg-muted px-1.5 py-0.5 font-mono text-sm">publishedAt</span> fields
        </li>
        <li>
          <strong className="text-foreground">Tag inputs</strong> - For array fields like{" "}
          <span className="rounded bg-muted px-1.5 py-0.5 font-mono text-sm">tags</span> and{" "}
          <span className="rounded bg-muted px-1.5 py-0.5 font-mono text-sm">categories</span>
        </li>
        <li>
          <strong className="text-foreground">Toggles</strong> - For boolean fields like{" "}
          <span className="rounded bg-muted px-1.5 py-0.5 font-mono text-sm">draft</span>
        </li>
      </ul>
      <p className="mb-4 leading-relaxed text-muted-foreground">
        The body content is edited below the frontmatter section using a full-featured MDX-aware editor with syntax
        highlighting.
      </p>

      {/* Saving Drafts */}
      <h2 className="mb-4 mt-12 text-2xl font-semibold">Saving Drafts</h2>
      <p className="mb-4 leading-relaxed text-muted-foreground">
        Every change you make in the Studio is automatically saved as a draft. Drafts are stored in Convex (not in your
        Git repository) so you can freely experiment without affecting your live content.
      </p>
      <ul className="mb-4 list-inside list-disc space-y-2 text-muted-foreground">
        <li>
          <strong className="text-foreground">Auto-save</strong> - Drafts are saved automatically as you type, with a
          brief debounce to avoid excessive writes.
        </li>
        <li>
          <strong className="text-foreground">Draft indicator</strong> - A status indicator in the editor header shows
          whether your changes are saved, saving, or unsaved.
        </li>
        <li>
          <strong className="text-foreground">Discard changes</strong> - You can discard a draft at any time to revert
          to the last published version from Git.
        </li>
      </ul>

      {/* Publishing Workflow */}
      <h2 className="mb-4 mt-12 text-2xl font-semibold">Publishing Workflow</h2>
      <p className="mb-4 leading-relaxed text-muted-foreground">
        When your content is ready, the publishing workflow guides you through committing changes back to your
        repository:
      </p>

      <h3 className="mb-3 mt-8 text-lg font-semibold">Draft → Review</h3>
      <p className="mb-4 leading-relaxed text-muted-foreground">
        Mark a document for review to signal to collaborators that it&rsquo;s ready for feedback. Documents in review
        are visible to all project members but are not yet committed to Git.
      </p>

      <h3 className="mb-3 mt-8 text-lg font-semibold">Review → Publish</h3>
      <p className="mb-4 leading-relaxed text-muted-foreground">
        Once reviewed (or if you skip the review step), click{" "}
        <span className="rounded bg-muted px-1.5 py-0.5 font-mono text-sm">Publish</span> to commit the changes.
        You&rsquo;ll be prompted to enter a commit message. RepoPress then creates a commit on the configured branch of
        your repository via the GitHub API.
      </p>

      <h3 className="mb-3 mt-8 text-lg font-semibold">Publish → Live</h3>
      <p className="mb-4 leading-relaxed text-muted-foreground">
        Once published, your changes are live in the repository. If your site has CI/CD (e.g., Vercel, Netlify), it will
        pick up the commit and redeploy automatically.
      </p>

      {/* Version History */}
      <h2 className="mb-4 mt-12 text-2xl font-semibold">Version History</h2>
      <p className="mb-4 leading-relaxed text-muted-foreground">
        Since all published content is committed to Git, you get full version history for free. RepoPress shows the
        commit history for the current file, including:
      </p>
      <ul className="mb-4 list-inside list-disc space-y-2 text-muted-foreground">
        <li>Commit message and timestamp</li>
        <li>Author information</li>
        <li>Ability to view previous versions and compare changes</li>
      </ul>
      <p className="mb-4 leading-relaxed text-muted-foreground">
        You can view any previous version and optionally restore it by creating a new draft from that version&rsquo;s
        content.
      </p>

      {/* Keyboard Shortcuts */}
      <h2 className="mb-4 mt-12 text-2xl font-semibold">Keyboard Shortcuts</h2>
      <p className="mb-4 leading-relaxed text-muted-foreground">
        The Studio supports keyboard shortcuts for common editing actions:
      </p>
      <div className="mb-4 overflow-hidden rounded-lg border border-border">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-border bg-muted/50">
              <th className="px-4 py-2 text-left font-medium text-foreground">Action</th>
              <th className="px-4 py-2 text-left font-medium text-foreground">Shortcut</th>
            </tr>
          </thead>
          <tbody className="text-muted-foreground">
            <tr className="border-b border-border">
              <td className="px-4 py-2">Bold</td>
              <td className="px-4 py-2">
                <span className="rounded bg-muted px-1.5 py-0.5 font-mono text-sm">⌘ + B</span>
              </td>
            </tr>
            <tr className="border-b border-border">
              <td className="px-4 py-2">Italic</td>
              <td className="px-4 py-2">
                <span className="rounded bg-muted px-1.5 py-0.5 font-mono text-sm">⌘ + I</span>
              </td>
            </tr>
            <tr className="border-b border-border">
              <td className="px-4 py-2">Insert Link</td>
              <td className="px-4 py-2">
                <span className="rounded bg-muted px-1.5 py-0.5 font-mono text-sm">⌘ + K</span>
              </td>
            </tr>
            <tr className="border-b border-border">
              <td className="px-4 py-2">Save Draft</td>
              <td className="px-4 py-2">
                <span className="rounded bg-muted px-1.5 py-0.5 font-mono text-sm">⌘ + S</span>
              </td>
            </tr>
            <tr>
              <td className="px-4 py-2">Toggle Preview</td>
              <td className="px-4 py-2">
                <span className="rounded bg-muted px-1.5 py-0.5 font-mono text-sm">⌘ + Shift + P</span>
              </td>
            </tr>
          </tbody>
        </table>
      </div>

      {/* Next Steps */}
      <p className="mt-12 leading-relaxed text-muted-foreground">
        That covers the essentials of the Studio editor. If you haven&rsquo;t already, head back to{" "}
        <Link href="/docs/getting-started" className="text-primary hover:underline">
          Getting Started
        </Link>{" "}
        or learn more about{" "}
        <Link href="/docs/how-it-works" className="text-primary hover:underline">
          How It Works
        </Link>{" "}
        under the hood.
      </p>
    </div>
  )
}
