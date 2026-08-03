import { existsSync, readFileSync, readdirSync } from "node:fs"
import { join, relative, resolve } from "node:path"

const appRoot = resolve(import.meta.dirname, "..")
const contentRoot = join(appRoot, "content")

const requiredPages = [
  "index.mdx",
  "guides/getting-started.md",
  "guides/how-it-works.md",
  "guides/connect-repository.md",
  "studio/editor.md",
  "platform/architecture.md",
  "components/authoring.md",
  "platform/preview-security.md",
  "tutorials/connect-an-mdx-repository.md",
  "tutorials/component-extension.md",
]

const forbiddenSegments = ["plans", "reviews", "runbooks", "handoffs"]
const failures = []

function collectContentFiles(directory) {
  if (!existsSync(directory)) return []

  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const path = join(directory, entry.name)
    return entry.isDirectory() ? collectContentFiles(path) : [path]
  })
}

for (const page of requiredPages) {
  if (!existsSync(join(contentRoot, page))) failures.push(`Missing public page: ${page}`)
}

const contentFiles = collectContentFiles(contentRoot)
const publicPaths = contentFiles.map((file) => relative(contentRoot, file))

for (const path of publicPaths) {
  const segments = path.split(/[\\/]/)
  const forbidden = forbiddenSegments.find((segment) => segments.includes(segment))
  if (forbidden) failures.push(`Internal ${forbidden} content is publicly routable: ${path}`)
}

const markdown = contentFiles
  .filter((file) => /\.mdx?$/.test(file))
  .map((file) => readFileSync(file, "utf8"))
  .join("\n")

if (!markdown.includes("named slots") || !markdown.includes("not currently")) {
  failures.push("The current named-slot authoring limitation is undocumented")
}

if (!markdown.includes("does not fetch") || !markdown.includes("fixture")) {
  failures.push("The current fixture-loading limitation is undocumented")
}

if (failures.length > 0) {
  console.error(failures.join("\n"))
  process.exit(1)
}

console.log(`Validated ${publicPaths.length} public documentation files.`)
