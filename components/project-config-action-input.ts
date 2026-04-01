import type { NewProjectDef } from "@/lib/repopress/config-writer"

function slugify(str: string): string {
  return str
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
}

type ContentType = "blog" | "docs" | "pages" | "changelog" | "custom"

export function buildAddProjectActionInput({
  defaultBranch,
  name,
  contentRoot,
  framework,
  contentType,
  branchInput,
}: {
  defaultBranch: string
  name: string
  contentRoot: string
  framework: string
  contentType: ContentType
  branchInput: string
}): {
  configBranch: string
  project: NewProjectDef
} {
  const trimmedBranch = branchInput.trim()

  return {
    configBranch: defaultBranch,
    project: {
      id: slugify(name),
      name: name.trim(),
      contentRoot: contentRoot.trim(),
      framework,
      contentType,
      ...(trimmedBranch ? { branch: trimmedBranch } : {}),
    },
  }
}

export function buildUpdateProjectActionInput({
  configProjectId,
  defaultBranch,
  name,
  framework,
  contentType,
  branchInput,
}: {
  configProjectId: string
  defaultBranch: string
  name: string
  framework: string
  contentType: ContentType
  branchInput: string
}): {
  configBranch: string
  configProjectId: string
  updates: {
    name: string
    framework: string
    contentType: ContentType
    branch?: string
  }
} {
  const trimmedBranch = branchInput.trim()

  return {
    configBranch: defaultBranch,
    configProjectId,
    updates: {
      name: name.trim(),
      framework,
      contentType,
      ...(trimmedBranch ? { branch: trimmedBranch } : {}),
    },
  }
}
