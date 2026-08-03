import { defineConfig } from "blume"

export default defineConfig({
  title: "RepoPress",
  description: "Build a Git-native content workflow for Markdown and MDX repositories.",
  logo: {
    image: "/logo.svg",
    text: "RepoPress",
  },
  content: {
    root: "content",
  },
  github: {
    owner: "itsyogesh",
    repo: "repo-press",
    branch: "main",
    dir: "apps/docs",
  },
  navigation: {
    sidebar: [
      "/",
      {
        label: "Guides",
        collapsed: false,
        items: ["/guides/getting-started", "/guides/how-it-works", "/guides/connect-repository"],
      },
      {
        label: "Studio",
        collapsed: false,
        items: ["/studio/editor"],
      },
      {
        label: "Platform",
        items: ["/platform/architecture", "/platform/preview-security"],
      },
      {
        label: "Components",
        items: ["/components/authoring"],
      },
      {
        label: "Tutorials",
        items: ["/tutorials/connect-an-mdx-repository", "/tutorials/component-extension"],
      },
    ],
  },
  search: {
    provider: "orama",
  },
  ai: {
    llmsTxt: true,
    mcp: {
      enabled: false,
    },
  },
  markdown: {
    imageZoom: true,
    code: {
      icons: true,
      wrap: false,
    },
  },
  deployment: {
    output: "static",
    site: "https://docs.repopress.org",
  },
})
