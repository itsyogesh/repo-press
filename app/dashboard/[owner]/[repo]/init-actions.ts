"use server"

import { revalidatePath } from "next/cache"
import { getGitHubToken } from "@/lib/auth-server"
import { batchCommit } from "@/lib/github"

const DEFAULT_ADAPTER_SOURCE = `"use client"

import { DocsImage, Callout, DocsVideo } from "@/components/docs/doc-media"

export const adapter = {
  components: {
    DocsImage,
    Callout,
    DocsVideo,
  },
  scope: {
    // Shared constants for expressions
    DOCS_SETUP_MEDIA: {},
  },
  allowImports: {
    "@/components/docs/doc-media": { DocsImage, Callout, DocsVideo },
  }
}
`

export async function initRepoPressAction(
  owner: string,
  repo: string,
  branch: string,
  projectConfig: {
    id: string
    name: string
    contentRoot: string
    framework: string
    contentType: string
  },
) {
  const token = await getGitHubToken()
  if (!token) return { success: false, error: "Not authenticated" }

  const config = {
    version: 1,
    defaults: {
      branch,
      framework: "auto",
      preview: {
        entry: ".repopress/mdx-preview.tsx",
      },
    },
    projects: [
      {
        ...projectConfig,
        branch,
        components: {
          DocsImage: {
            props: [
              { name: "src", type: "image", label: "Source" },
              { name: "alt", type: "string", label: "Alt text" },
              { name: "caption", type: "string", label: "Caption" },
            ],
            hasChildren: false,
            kind: "flow",
          },
          DocsVideo: {
            props: [
              { name: "src", type: "string", label: "Source" },
              { name: "title", type: "string", label: "Title" },
            ],
            hasChildren: false,
            kind: "flow",
          },
          Callout: {
            props: [{ name: "type", type: "string", label: "Type", default: "info" }],
            hasChildren: true,
            kind: "flow",
          },
        },
      },
    ],
  }

  try {
    // Commit repopress.config.json and .repopress/mdx-preview.tsx atomically
    await batchCommit(
      token,
      owner,
      repo,
      branch,
      [
        {
          path: "repopress.config.json",
          content: JSON.stringify(config, null, 2),
          action: "create",
        },
        {
          path: ".repopress/mdx-preview.tsx",
          content: DEFAULT_ADAPTER_SOURCE,
          action: "create",
        },
      ],
      "chore: initialize RepoPress configuration and preview adapter",
    )

    revalidatePath(`/dashboard/${owner}/${repo}/setup`)
    return { success: true }
  } catch (error: any) {
    console.error("Failed to init RepoPress:", error)
    return { success: false, error: error.message }
  }
}
