export type RepoScannerDemoResult =
  | {
      owner: string
      repo: string
      framework: string
      contentRoot: string
      collections: number
      documents: number
      assets: number
      detectionBasis: string
      recommendedAction: string
    }
  | {
      error: string
    }

const DEFAULT_ERROR = "Enter a valid GitHub repository URL."

function selectScenario(owner: string, repo: string) {
  const haystack = `${owner}/${repo}`.toLowerCase()

  if (haystack.includes("docs") || haystack.includes("fumadocs") || haystack.includes("nextra")) {
    return {
      framework: "Fumadocs",
      contentRoot: "docs",
      collections: 6,
      documents: 148,
      assets: 38,
      detectionBasis: "Detected MDX docs, route groups, and shared UI components.",
      recommendedAction: "Create a docs project and keep drafts flowing through publish lanes.",
    }
  }

  if (haystack.includes("blog") || haystack.includes("content") || haystack.includes("astro")) {
    return {
      framework: "Astro Content Collections",
      contentRoot: "src/content/blog",
      collections: 3,
      documents: 42,
      assets: 64,
      detectionBasis: "Detected content collections, frontmatter-rich entries, and image-heavy posts.",
      recommendedAction: "Start with the blog collection and sync media assets into the gallery.",
    }
  }

  return {
    framework: "Next.js MDX",
    contentRoot: "content",
    collections: 4,
    documents: 27,
    assets: 19,
    detectionBasis:
      "Matched MDX routes and a lightweight docs/blog split. Best-guess based on common Next.js patterns.",
    recommendedAction: "Open the content root in the studio and start editing MDX pages.",
  }
}

export function buildRepoScannerDemo(input: string): RepoScannerDemoResult {
  const trimmed = input.trim()

  // Bare owner/repo with no domain (e.g. "acme/docs")
  if (/^[^/\s:]+\/[^/\s]+$/.test(trimmed)) {
    return { error: "Add the full URL — try: https://github.com/owner/repo" }
  }

  // Non-GitHub domain
  if (/^https?:\/\//i.test(trimmed) && !/github\.com/i.test(trimmed)) {
    return { error: "Only GitHub repositories are supported right now." }
  }

  // GitHub URL with extra path suffix (tree, blob, issues, etc.)
  if (/github\.com\/[^/\s]+\/[^/\s]+\/.+/i.test(trimmed)) {
    return { error: "Paste the repository root — remove everything after the repo name." }
  }

  const match = trimmed.match(/^(?:https?:\/\/)?(?:www\.)?github\.com\/([^/\s]+)\/([^/\s]+?)(?:\.git)?\/?$/i)

  if (!match) {
    return { error: DEFAULT_ERROR }
  }

  const [, owner, repo] = match

  return {
    owner,
    repo,
    ...selectScenario(owner, repo),
  }
}
