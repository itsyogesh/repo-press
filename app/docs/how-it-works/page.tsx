import type { Metadata } from "next"
import Link from "next/link"

export const metadata: Metadata = {
  title: "How It Works",
  description: "Understand RepoPress's three-layer architecture and content lifecycle.",
}

export default function HowItWorksPage() {
  return (
    <div>
      <h1 className="mb-6 text-3xl font-bold tracking-tight">How It Works</h1>

      <p className="mb-4 leading-relaxed text-muted-foreground">
        RepoPress is a Git-native headless CMS. Instead of storing your content in a proprietary database, it reads from
        and writes directly to your GitHub repositories. Here&rsquo;s how the system is structured.
      </p>

      {/* Architecture */}
      <h2 className="mb-4 mt-12 text-2xl font-semibold">Three-Layer Architecture</h2>
      <p className="mb-4 leading-relaxed text-muted-foreground">
        RepoPress is built on three interconnected layers that work together to provide a seamless editing experience:
      </p>
      <ul className="mb-4 list-inside list-disc space-y-2 text-muted-foreground">
        <li>
          <strong className="text-foreground">Next.js Frontend</strong> — The Studio UI, dashboard, and all user-facing
          pages. Built with the App Router and React Server Components for fast, streaming page loads.
        </li>
        <li>
          <strong className="text-foreground">Convex Backend</strong> — A real-time database layer that stores drafts,
          project metadata, and user sessions. Changes sync instantly across all connected clients.
        </li>
        <li>
          <strong className="text-foreground">GitHub API</strong> — The source of truth. RepoPress reads your
          repository&rsquo;s file tree and content via the GitHub API and commits changes back when you publish.
        </li>
      </ul>

      {/* Content Flow */}
      <h2 className="mb-4 mt-12 text-2xl font-semibold">Content Flow</h2>
      <p className="mb-4 leading-relaxed text-muted-foreground">
        Content moves through four stages as you work with it in RepoPress:
      </p>

      <h3 className="mb-3 mt-8 text-lg font-semibold">1. Read from Git</h3>
      <p className="mb-4 leading-relaxed text-muted-foreground">
        When you open a project, RepoPress fetches your repository&rsquo;s file tree and content from GitHub. The file
        tree is displayed in the Studio sidebar, and file contents are loaded on demand when you select a file.
      </p>

      <h3 className="mb-3 mt-8 text-lg font-semibold">2. Edit in Studio</h3>
      <p className="mb-4 leading-relaxed text-muted-foreground">
        The Studio editor provides a rich editing experience for MDX and Markdown files. You can edit frontmatter
        fields, write content with a visual toolbar, and preview your changes in real time.
      </p>

      <h3 className="mb-3 mt-8 text-lg font-semibold">3. Draft in Convex</h3>
      <p className="mb-4 leading-relaxed text-muted-foreground">
        Every edit you make is automatically saved as a draft in Convex. Drafts are separate from your Git history —
        they won&rsquo;t affect your repository until you explicitly publish. This means you can work on multiple
        changes without worrying about incomplete commits.
      </p>

      <h3 className="mb-3 mt-8 text-lg font-semibold">4. Publish Back to Git</h3>
      <p className="mb-4 leading-relaxed text-muted-foreground">
        When you&rsquo;re ready, hit Publish. RepoPress commits your changes directly to the configured branch in your
        GitHub repository. The commit message, author, and branch are all configurable.
      </p>

      {/* Framework Detection */}
      <h2 className="mb-4 mt-12 text-2xl font-semibold">Framework Detection</h2>
      <p className="mb-4 leading-relaxed text-muted-foreground">
        When you connect a repository, RepoPress scans for configuration files like{" "}
        <span className="rounded bg-muted px-1.5 py-0.5 font-mono text-sm">next.config.js</span>,{" "}
        <span className="rounded bg-muted px-1.5 py-0.5 font-mono text-sm">astro.config.mjs</span>, or{" "}
        <span className="rounded bg-muted px-1.5 py-0.5 font-mono text-sm">hugo.toml</span> to determine your framework.
        Based on the framework, it suggests a sensible default content root (e.g.,{" "}
        <span className="rounded bg-muted px-1.5 py-0.5 font-mono text-sm">content/</span> or{" "}
        <span className="rounded bg-muted px-1.5 py-0.5 font-mono text-sm">src/content/</span>
        ).
      </p>

      {/* Document Lifecycle */}
      <h2 className="mb-4 mt-12 text-2xl font-semibold">Document Lifecycle</h2>
      <p className="mb-4 leading-relaxed text-muted-foreground">
        Every document in RepoPress goes through a defined lifecycle:
      </p>
      <ul className="mb-4 list-inside list-disc space-y-2 text-muted-foreground">
        <li>
          <strong className="text-foreground">Draft</strong> — Initial state when you create or edit a document. Stored
          in Convex, not yet committed to Git.
        </li>
        <li>
          <strong className="text-foreground">Review</strong> — Optionally mark a document for team review before
          publishing. Useful for collaborative workflows.
        </li>
        <li>
          <strong className="text-foreground">Approved</strong> — A reviewed document that has been approved and is
          ready for publishing.
        </li>
        <li>
          <strong className="text-foreground">Published</strong> — The document has been committed back to your GitHub
          repository and is live.
        </li>
        <li>
          <strong className="text-foreground">Archived</strong> — Documents that are no longer active but remain in your
          Git history for reference.
        </li>
      </ul>

      <p className="mb-4 leading-relaxed text-muted-foreground">
        Ready to set up your repository?{" "}
        <Link href="/docs/connecting-a-repo" className="text-primary hover:underline">
          Learn about connecting a repository →
        </Link>
      </p>
    </div>
  )
}
