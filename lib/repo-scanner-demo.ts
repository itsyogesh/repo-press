export type RepoScannerDemoResult =
  | {
      owner: string
      repo: string
      framework: string
      contentRoot: string
      collections: number
      documents: number
      assets: number
      signal: string
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
      contentRoot: "apps/docs/content/docs",
      collections: 6,
      documents: 148,
      assets: 38,
      signal: "Detected MDX docs, route groups, and shared UI components.",
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
      signal: "Detected content collections, frontmatter-rich entries, and image-heavy posts.",
      recommendedAction: "Start with the blog collection and sync media assets into the gallery.",
    }
  }

  return {
    framework: "Next.js MDX",
    contentRoot: "content",
    collections: 4,
    documents: 27,
    assets: 19,
    signal: "Detected MDX routes, component imports, and a lightweight docs/blog split.",
    recommendedAction: "Import the content root and generate an editing workspace for MDX pages.",
  }
}

export function buildRepoScannerDemo(input: string): RepoScannerDemoResult {
  const match = input.trim().match(/^(?:https?:\/\/)?(?:www\.)?github\.com\/([^/\s]+)\/([^/\s]+?)(?:\.git)?\/?$/i)

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
