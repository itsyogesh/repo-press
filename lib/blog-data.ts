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
    title: "Introducing RepoPress: Your Repo is Your CMS",
    date: "2025-01-15",
    excerpt:
      "Today we're launching RepoPress — a Git-native headless CMS that turns any GitHub repository into a visual content editor.",
    content: `RepoPress is a new kind of content management system. Instead of storing your content in a proprietary database, RepoPress reads directly from your GitHub repository and commits changes back as standard Git commits.

## Why RepoPress?

Traditional headless CMS platforms require you to migrate your content to their database, learn their proprietary APIs, and accept vendor lock-in. RepoPress takes a different approach:

- **Your repo is your CMS** — content stays in Git, where it belongs
- **Framework auto-detection** — connect your repo and we'll configure everything automatically
- **Visual MDX editor** — write with a live preview, including custom React components
- **Editorial workflows** — draft, review, approve, and publish with full version history

## How It Works

1. Sign in with GitHub
2. Select your repository
3. RepoPress detects your framework (Next.js, Astro, Hugo, Docusaurus, Jekyll, etc.)
4. Start editing with the visual Studio editor

Every save creates a version snapshot. When you publish, RepoPress commits directly to your repository. No database, no lock-in, no compromise.

## What's Next

We're just getting started. Upcoming features include real-time collaboration, advanced search, and plugin system for custom workflows. Star us on GitHub and follow along!`,
  },
  {
    slug: "framework-auto-detection",
    title: "How Framework Auto-Detection Works",
    date: "2025-01-10",
    excerpt:
      "RepoPress automatically detects your framework and configures itself. Here's how we built the detection engine.",
    content: `One of RepoPress's most unique features is framework auto-detection. When you connect a repository, we automatically identify your framework and configure the CMS accordingly.

## The Detection Process

Our detection engine scans your repository for telltale signs:

1. **Package.json analysis** — we check dependencies for framework-specific packages
2. **Config file detection** — we look for framework config files (next.config.js, astro.config.mjs, hugo.toml, etc.)
3. **Content structure mapping** — we identify where your content lives based on framework conventions

## Supported Frameworks

Currently, RepoPress supports:

- **Next.js** (including Fumadocs and Nextra)
- **Astro**
- **Hugo**
- **Docusaurus**
- **Jekyll**
- **Any MDX/Markdown project**

Each framework gets custom frontmatter field definitions. For example, Fumadocs projects get \`title\`, \`description\`, \`icon\`, and \`full\` fields, while Hugo projects get \`weight\`, \`draft\`, and \`tags\`.

## Universal Fields

Regardless of framework, every project gets universal fields: \`title\`, \`description\`, and \`draft\`. These are the baseline that every content framework needs.

## What Makes This Unique

No other Git-native CMS offers framework auto-detection. Tools like Decap CMS, TinaCMS, and Keystatic all require manual configuration. RepoPress just works.`,
  },
  {
    slug: "why-git-native",
    title: "Why We Chose Git-Native Over Traditional CMS",
    date: "2025-01-05",
    excerpt:
      "There are plenty of headless CMS options. Here's why we built RepoPress to keep content in Git instead of a proprietary database.",
    content: `When we started building RepoPress, we had a fundamental choice: build another database-backed CMS or build something that works with Git natively. We chose Git.

## The Problem with Traditional CMS

Most headless CMS platforms store your content in their database. This creates several problems:

- **Vendor lock-in** — your content is trapped in their system
- **No version control** — you lose Git's powerful history and branching
- **Separate workflow** — developers work in Git, content teams work in the CMS
- **Migration pain** — moving between platforms means data export/import headaches

## The Git-Native Approach

RepoPress reads directly from your GitHub repository and commits changes back as standard Git commits. This means:

- **Your content stays in your repo** — you own it, forever
- **Full Git history** — every change is tracked with proper commits
- **Branch workflows** — use branches for content staging just like code
- **No migration needed** — your content is already where it needs to be

## How We Make It Work

The key insight is that content management doesn't require a separate database. Your Markdown and MDX files are already structured data. RepoPress adds a visual layer on top:

1. **Read** — we fetch your content from GitHub's API
2. **Edit** — you write in our visual Studio editor with live preview
3. **Save** — drafts are stored temporarily in Convex (our operational database)
4. **Publish** — content is committed back to your repository

The operational state (drafts, workflow status, version history) lives in Convex, but the content of truth is always your Git repository.

## The Best of Both Worlds

RepoPress gives you the convenience of a visual CMS with the power and ownership of Git. No compromise necessary.`,
  },
]

export function getPost(slug: string): BlogPost | undefined {
  return blogPosts.find((p) => p.slug === slug)
}

export function getAllPosts(): BlogPost[] {
  return [...blogPosts].sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())
}
