import type { Metadata } from "next"
import Link from "next/link"

export const metadata: Metadata = {
  title: "Getting Started",
  description: "Set up RepoPress and connect your first repository in minutes.",
}

export default function GettingStartedPage() {
  return (
    <div>
      <h1 className="mb-6 text-3xl font-semibold tracking-tight">Getting Started</h1>

      <p className="mb-4 leading-relaxed text-muted-foreground">
        RepoPress makes it easy to manage your website&rsquo;s content directly from your GitHub repository. Follow
        these steps to get up and running in minutes.
      </p>

      {/* Prerequisites */}
      <h2 className="mb-4 mt-12 text-2xl font-semibold">Prerequisites</h2>
      <ul className="mb-4 list-inside list-disc space-y-2 text-muted-foreground">
        <li>A GitHub account</li>
        <li>A repository with MDX or Markdown content</li>
      </ul>

      {/* Step 1 */}
      <h2 className="mb-4 mt-12 text-2xl font-semibold">Step 1: Sign In</h2>
      <p className="mb-4 leading-relaxed text-muted-foreground">
        Visit{" "}
        <Link href="/" className="text-primary hover:underline">
          repopress.dev
        </Link>{" "}
        and click <span className="rounded bg-muted px-1.5 py-0.5 font-mono text-sm">Login with GitHub</span>.
        We&rsquo;ll ask for permission to read and write to your repositories.
      </p>

      {/* Step 2 */}
      <h2 className="mb-4 mt-12 text-2xl font-semibold">Step 2: Select Your Repository</h2>
      <p className="mb-4 leading-relaxed text-muted-foreground">
        From the dashboard, you&rsquo;ll see a list of your GitHub repositories. Select the one you want to manage with
        RepoPress.
      </p>

      {/* Step 3 */}
      <h2 className="mb-4 mt-12 text-2xl font-semibold">Step 3: Create a Project</h2>
      <p className="mb-4 leading-relaxed text-muted-foreground">
        RepoPress will auto-detect your framework (Next.js, Astro, Hugo, etc.) and suggest a content root directory.
        Confirm the settings and create your project.
      </p>

      {/* Step 4 */}
      <h2 className="mb-4 mt-12 text-2xl font-semibold">Step 4: Open the Studio</h2>
      <p className="mb-4 leading-relaxed text-muted-foreground">
        Click on your project to open the Studio editor. You&rsquo;ll see your file tree on the left and the editor on
        the right.
      </p>

      {/* Step 5 */}
      <h2 className="mb-4 mt-12 text-2xl font-semibold">Step 5: Start Editing</h2>
      <p className="mb-4 leading-relaxed text-muted-foreground">
        Click on any MDX or Markdown file to edit it. Changes are saved as drafts in RepoPress. When you&rsquo;re ready,
        hit <span className="rounded bg-muted px-1.5 py-0.5 font-mono text-sm">Publish</span> to commit back to your
        repository.
      </p>

      {/* What's Next */}
      <h2 className="mb-4 mt-12 text-2xl font-semibold">What&rsquo;s Next?</h2>
      <ul className="mb-4 list-inside list-disc space-y-2 text-muted-foreground">
        <li>
          Learn{" "}
          <Link href="/docs/how-it-works" className="text-primary hover:underline">
            How It Works
          </Link>
        </li>
        <li>
          Set up{" "}
          <Link href="/docs/connecting-a-repo" className="text-primary hover:underline">
            Connecting a Repository
          </Link>{" "}
          for advanced configuration
        </li>
        <li>
          Master the{" "}
          <Link href="/docs/studio-editor" className="text-primary hover:underline">
            Studio Editor
          </Link>
        </li>
      </ul>
    </div>
  )
}
