export interface BlogPost {
  slug: string
  title: string
  date: string
  excerpt: string
  content: string
}

export const blogPosts: BlogPost[] = [
  {
    slug: "introducing-repopress",
    title: "Introducing RepoPress: Edit Your GitHub Content Without Touching Code",
    date: "2025-01-15",
    excerpt:
      "RepoPress is a visual editor that connects to your GitHub repository. Edit docs and blog posts, see a live preview, and publish changes - all without opening a terminal.",
    content: `If your website runs on GitHub, updating content usually means opening a code editor, writing Markdown by hand, and pushing a commit. That works fine for developers, but it shuts out everyone else on the team.

RepoPress changes that. It connects to your GitHub repository and gives you a visual editor with a live preview. You see your files, click to edit, and publish when you are ready. Your content stays as standard files in your repo - we never move it to a separate database.

## What you can do with RepoPress

- **Edit visually** - Write in a clean editor with formatting tools and a live preview. No Markdown syntax to memorize.
- **Automatic setup** - Connect your repo and RepoPress detects your framework (Next.js, Astro, Hugo, Docusaurus, Jekyll, and more) and configures itself.
- **Draft before you publish** - Every edit is saved as a draft. Nothing changes on your live site until you hit Publish.
- **Full version history** - Every save is tracked. Roll back to any previous version.

## How it works

1. Sign in with GitHub
2. Select your repository
3. RepoPress detects your framework and finds your content files
4. Start editing in the visual Studio

When you publish, RepoPress commits your changes directly to your repository. No proprietary database, no lock-in. Your content is always in your repo, in standard file formats.

## What's next

We're building real-time collaboration, advanced search, and custom workflow plugins. Star us on GitHub to follow along.`,
  },
  {
    slug: "framework-auto-detection",
    title: "How RepoPress Detects Your Framework Automatically",
    date: "2025-01-10",
    excerpt:
      "When you connect a repository, RepoPress figures out what framework you use and sets itself up. Here is how that works.",
    content: `What sets RepoPress apart is automatic framework detection. You connect your repository, and RepoPress configures itself - no manual setup required.

## What happens when you connect a repo

RepoPress looks at three things in your repository:

1. **Your dependencies** - It checks your package.json for framework-specific packages (like blume, next, or astro).
2. **Configuration files** - It looks for files like blume.config.ts, next.config.js, astro.config.mjs, or hugo.toml.
3. **Content structure** - It identifies where your content files live based on the conventions your framework uses.

## Supported frameworks

RepoPress currently supports:

- **Blume**
- **Next.js** (including Fumadocs and Nextra)
- **Astro**
- **Hugo**
- **Docusaurus**
- **Jekyll**
- **Any Markdown or MDX project**

Each framework gets its own set of frontmatter fields. For example, Fumadocs projects get title, description, icon, and full fields. Hugo projects get weight, draft, and tags. You can always customize these.

## What if your framework isn't detected?

If RepoPress doesn't recognize your setup, you can choose a content folder and configure file types manually during project setup. Any project with Markdown or MDX files will work - the framework detection just makes initial setup faster.`,
  },
  {
    slug: "why-git-native",
    title: "Why Your Content Should Stay in GitHub",
    date: "2025-01-05",
    excerpt:
      "Most CMS tools copy your content into their own database. RepoPress takes a different approach: your files stay in your GitHub repository.",
    content: `When we built RepoPress, we had a choice: build another CMS with its own database, or build something that works with files already in your repository. We chose the second option.

## The problem with most CMS tools

Most content management platforms store your content in their database. That creates a few issues:

- **Your content is locked in** - Moving to a different tool means exporting data and hoping the format is compatible.
- **No real version history** - You lose the detailed change tracking that Git provides.
- **Separate workflows** - Developers work in GitHub, content writers work in the CMS, and the two worlds rarely meet.
- **Migration headaches** - Switching platforms means data exports, format conversions, and broken links.

## How RepoPress is different

RepoPress reads files directly from your GitHub repository and commits changes back when you publish. Here's what that means in practice:

- **Your content stays in your repo** - Standard Markdown and MDX files, right where they've always been.
- **Real version history** - Every publish creates a Git commit. You can see who changed what and when.
- **One workflow for everyone** - Writers use the visual editor, developers review pull requests. Same repository, same process.
- **Nothing to migrate** - Your content is already in the right place. There's nothing to export if you stop using RepoPress.

## How it works under the hood

The key idea is simple: your Markdown and MDX files are already structured content. RepoPress adds a visual editing layer on top:

1. **Read** - Your files are fetched from GitHub when you open a project.
2. **Edit** - You write in the visual Studio editor with a live preview.
3. **Save** - Drafts are stored temporarily so you can work without affecting your live site.
4. **Publish** - Your content is committed back to your repository.

The draft storage handles the editing workflow (saving progress, version snapshots, review status), but the published content always lives in your Git repository.

## The best of both worlds

RepoPress gives you a visual editor that anyone on your team can use, with the ownership and version control that Git provides. No compromise.`,
  },
]

export function getPost(slug: string): BlogPost | undefined {
  return blogPosts.find((p) => p.slug === slug)
}

export function getAllPosts(): BlogPost[] {
  return [...blogPosts].sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())
}
