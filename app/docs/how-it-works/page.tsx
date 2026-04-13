import type { Metadata } from "next"
import Link from "next/link"

export const metadata: Metadata = {
  title: "How It Works",
  description: "How RepoPress connects to your GitHub repository and manages content.",
}

export default function HowItWorksPage() {
  return (
    <div>
      <h1 className="mb-6 text-3xl font-semibold tracking-tight">How It Works</h1>

      <p className="mb-4 leading-relaxed text-muted-foreground">
        RepoPress is a visual editor that works directly with your GitHub repository. Instead of copying your content
        into a separate database, it reads your files from GitHub and commits changes back when you publish.
        Here&rsquo;s how that works in practice.
      </p>

      {/* Architecture */}
      <h2 className="mb-4 mt-12 text-2xl font-semibold">What happens behind the scenes</h2>
      <p className="mb-4 leading-relaxed text-muted-foreground">
        Three pieces work together to give you a smooth editing experience:
      </p>
      <ul className="mb-4 list-inside list-disc space-y-2 text-muted-foreground">
        <li>
          <strong className="text-foreground">The editor</strong> — The Studio interface you see in your browser. It
          loads your files, lets you edit them visually, and shows a live preview.
        </li>
        <li>
          <strong className="text-foreground">A real-time backend</strong> — Stores your drafts and project settings so
          you can work without affecting your live site until you are ready to publish.
        </li>
        <li>
          <strong className="text-foreground">Your GitHub repository</strong> — The source of truth. RepoPress reads
          your files from GitHub and commits changes back when you hit publish.
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

      <h3 className="mb-3 mt-8 text-lg font-semibold">3. Save as a draft</h3>
      <p className="mb-4 leading-relaxed text-muted-foreground">
        Every edit is automatically saved as a draft. Drafts are separate from your live site — nothing changes in your
        repository until you explicitly publish. You can work on multiple pages without worrying about incomplete
        updates.
      </p>

      <h3 className="mb-3 mt-8 text-lg font-semibold">4. Publish back to GitHub</h3>
      <p className="mb-4 leading-relaxed text-muted-foreground">
        When you&rsquo;re ready, hit Publish. RepoPress commits your changes to the branch you chose when setting up the
        project. You can customize the commit message before publishing.
      </p>

      {/* Framework Detection */}
      <h2 className="mb-4 mt-12 text-2xl font-semibold">Automatic setup</h2>
      <p className="mb-4 leading-relaxed text-muted-foreground">
        When you connect a repository, RepoPress detects your site framework by looking at configuration files like{" "}
        <span className="rounded bg-muted px-1.5 py-0.5 font-mono text-sm">next.config.js</span>,{" "}
        <span className="rounded bg-muted px-1.5 py-0.5 font-mono text-sm">astro.config.mjs</span>, or{" "}
        <span className="rounded bg-muted px-1.5 py-0.5 font-mono text-sm">hugo.toml</span>. Based on what it finds, it
        suggests the right content folder (for example,{" "}
        <span className="rounded bg-muted px-1.5 py-0.5 font-mono text-sm">content/</span> or{" "}
        <span className="rounded bg-muted px-1.5 py-0.5 font-mono text-sm">src/content/</span>) so you can start editing
        right away.
      </p>

      {/* Document Lifecycle */}
      <h2 className="mb-4 mt-12 text-2xl font-semibold">Content workflow</h2>
      <p className="mb-4 leading-relaxed text-muted-foreground">Every document moves through a clear workflow:</p>
      <ul className="mb-4 list-inside list-disc space-y-2 text-muted-foreground">
        <li>
          <strong className="text-foreground">Draft</strong> — You are editing. Changes are saved automatically but have
          not been published yet.
        </li>
        <li>
          <strong className="text-foreground">Review</strong> — Optionally share the document with your team for
          feedback before publishing.
        </li>
        <li>
          <strong className="text-foreground">Approved</strong> — Reviewed and ready to go live.
        </li>
        <li>
          <strong className="text-foreground">Published</strong> — Committed to your GitHub repository. The changes are
          live.
        </li>
        <li>
          <strong className="text-foreground">Archived</strong> — No longer active, but still in your repository history
          if you need it.
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
