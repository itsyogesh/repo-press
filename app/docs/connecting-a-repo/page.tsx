import type { Metadata } from "next"
import Link from "next/link"

export const metadata: Metadata = {
  title: "Connecting a Repository",
  description: "Connect your GitHub repository and choose a content folder to start editing.",
}

export default function ConnectingARepoPage() {
  return (
    <div>
      <h1 className="mb-6 text-3xl font-semibold tracking-tight">Connecting a Repository</h1>

      <p className="mb-4 leading-relaxed text-muted-foreground">
        RepoPress connects to your GitHub repositories to read and write content. This guide covers everything from
        initial authentication to advanced configuration.
      </p>

      {/* GitHub OAuth Permissions */}
      <h2 className="mb-4 mt-12 text-2xl font-semibold">What we ask for when you sign in</h2>
      <p className="mb-4 leading-relaxed text-muted-foreground">
        When you sign in with GitHub, RepoPress requests permission to:
      </p>
      <ul className="mb-4 list-inside list-disc space-y-2 text-muted-foreground">
        <li>
          <strong className="text-foreground">Read access</strong> to your repositories - to fetch file trees and
          content.
        </li>
        <li>
          <strong className="text-foreground">Write access</strong> to your repositories - to commit published changes
          back to Git.
        </li>
        <li>
          <strong className="text-foreground">User profile</strong> - to display your name and avatar in the dashboard.
        </li>
      </ul>
      <p className="mb-4 leading-relaxed text-muted-foreground">
        RepoPress never stores your GitHub password. We use short-lived access tokens that you can revoke at any time
        from your{" "}
        <a
          href="https://github.com/settings/applications"
          target="_blank"
          rel="noopener noreferrer"
          className="text-primary hover:underline"
        >
          GitHub Settings
        </a>
        .
      </p>

      {/* Selecting a Repository */}
      <h2 className="mb-4 mt-12 text-2xl font-semibold">Selecting a Repository</h2>
      <p className="mb-4 leading-relaxed text-muted-foreground">
        After signing in, navigate to the dashboard. You&rsquo;ll see a list of all repositories accessible to your
        GitHub account - both personal and organization repositories. Click on any repository to begin setting up a
        project.
      </p>

      {/* Content Root Configuration */}
      <h2 className="mb-4 mt-12 text-2xl font-semibold">Choosing a content folder</h2>
      <p className="mb-4 leading-relaxed text-muted-foreground">
        The content folder tells RepoPress where your editable files live. Common locations include:
      </p>
      <ul className="mb-4 list-inside list-disc space-y-2 text-muted-foreground">
        <li>
          <span className="rounded bg-muted px-1.5 py-0.5 font-mono text-sm">content/</span> - Hugo, Gatsby, and many
          static site generators
        </li>
        <li>
          <span className="rounded bg-muted px-1.5 py-0.5 font-mono text-sm">src/content/</span> - Astro content
          collections
        </li>
        <li>
          <span className="rounded bg-muted px-1.5 py-0.5 font-mono text-sm">app/</span> - Next.js co-located MDX pages
        </li>
        <li>
          <span className="rounded bg-muted px-1.5 py-0.5 font-mono text-sm">posts/</span> or{" "}
          <span className="rounded bg-muted px-1.5 py-0.5 font-mono text-sm">blog/</span> - Custom blog directories
        </li>
      </ul>
      <p className="mb-4 leading-relaxed text-muted-foreground">
        You can change the content folder at any time from project settings. Only files inside this folder appear in the
        Studio editor.
      </p>

      {/* Framework Auto-Detection */}
      <h2 className="mb-4 mt-12 text-2xl font-semibold">Automatic framework detection</h2>
      <p className="mb-4 leading-relaxed text-muted-foreground">
        RepoPress looks at your repository to identify which site framework you use. Currently supported:
      </p>
      <ul className="mb-4 list-inside list-disc space-y-2 text-muted-foreground">
        <li>
          <strong className="text-foreground">Next.js</strong> - Detected via{" "}
          <span className="rounded bg-muted px-1.5 py-0.5 font-mono text-sm">next.config.js</span> or{" "}
          <span className="rounded bg-muted px-1.5 py-0.5 font-mono text-sm">next.config.mjs</span>
        </li>
        <li>
          <strong className="text-foreground">Astro</strong> - Detected via{" "}
          <span className="rounded bg-muted px-1.5 py-0.5 font-mono text-sm">astro.config.mjs</span>
        </li>
        <li>
          <strong className="text-foreground">Hugo</strong> - Detected via{" "}
          <span className="rounded bg-muted px-1.5 py-0.5 font-mono text-sm">hugo.toml</span> or{" "}
          <span className="rounded bg-muted px-1.5 py-0.5 font-mono text-sm">config.toml</span>
        </li>
        <li>
          <strong className="text-foreground">Gatsby</strong> - Detected via{" "}
          <span className="rounded bg-muted px-1.5 py-0.5 font-mono text-sm">gatsby-config.js</span>
        </li>
      </ul>
      <p className="mb-4 leading-relaxed text-muted-foreground">
        If your framework is not detected automatically, you can set the content folder and file types manually during
        project setup.
      </p>

      {/* Multiple Projects */}
      <h2 className="mb-4 mt-12 text-2xl font-semibold">Multiple projects from one repository</h2>
      <p className="mb-4 leading-relaxed text-muted-foreground">
        You can create multiple RepoPress projects from the same GitHub repository. This is useful when you have
        different content areas - for example, a{" "}
        <span className="rounded bg-muted px-1.5 py-0.5 font-mono text-sm">blog/</span> directory and a{" "}
        <span className="rounded bg-muted px-1.5 py-0.5 font-mono text-sm">docs/</span> directory that you want to
        manage separately. Each project can have its own content root, collaborators, and publishing settings.
      </p>

      {/* Private Repo Support */}
      <h2 className="mb-4 mt-12 text-2xl font-semibold">Private repositories</h2>
      <p className="mb-4 leading-relaxed text-muted-foreground">
        RepoPress works with private repositories. If your GitHub account has access to the repository, you can connect
        it the same way you would a public one. Content is fetched through authenticated requests and is not stored on
        our servers beyond your current editing session.
      </p>

      <p className="mb-4 leading-relaxed text-muted-foreground">
        Now that your repository is connected, learn how to use the{" "}
        <Link href="/docs/studio-editor" className="text-primary hover:underline">
          Studio Editor →
        </Link>
      </p>
    </div>
  )
}
