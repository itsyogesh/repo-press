import { ArrowLeft } from "lucide-react"
import type { Metadata } from "next"
import Link from "next/link"
import { notFound } from "next/navigation"
import Footer from "@/components/landing/footer"
import Navbar from "@/components/landing/navbar"
import { getAllPosts, getPost } from "@/lib/blog-data"

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const { slug } = await params
  const post = getPost(slug)
  if (!post) return { title: "Not Found" }
  return {
    title: `${post.title} - RepoPress Blog`,
    description: post.excerpt,
  }
}

export function generateStaticParams() {
  return getAllPosts().map((post) => ({ slug: post.slug }))
}

/* ---------------------------------------------------------------------------
 * Minimal Markdown-to-JSX renderer
 *
 * Supports the subset used in our static blog content:
 *   ## headings
 *   - **bold** list items
 *   1. ordered list items
 *   `inline code`
 *   **bold** and regular paragraphs
 * --------------------------------------------------------------------------- */

interface RenderedBlock {
  key: string
  element: React.ReactNode
}

function renderInline(text: string): React.ReactNode[] {
  // Handle **bold**, `code`, and plain text segments
  const parts: React.ReactNode[] = []
  // Regex: match **bold** or `code`
  const regex = /(\*\*(.+?)\*\*|`(.+?)`)/g
  let lastIndex = 0
  let match: RegExpExecArray | null = null

  // biome-ignore lint/suspicious/noAssignInExpressions: simple regex walker
  while ((match = regex.exec(text)) !== null) {
    // Push preceding plain text
    if (match.index > lastIndex) {
      parts.push(text.slice(lastIndex, match.index))
    }

    if (match[2]) {
      // **bold**
      parts.push(
        <strong key={match.index} className="font-semibold text-foreground">
          {match[2]}
        </strong>,
      )
    } else if (match[3]) {
      // `code`
      parts.push(
        <code key={match.index} className="rounded bg-muted px-1.5 py-0.5 font-mono text-sm text-foreground">
          {match[3]}
        </code>,
      )
    }

    lastIndex = match.index + match[0].length
  }

  // Remaining text
  if (lastIndex < text.length) {
    parts.push(text.slice(lastIndex))
  }

  return parts
}

function parseContent(content: string): RenderedBlock[] {
  const blocks = content.split("\n\n")
  const rendered: RenderedBlock[] = []

  for (let i = 0; i < blocks.length; i++) {
    const block = blocks[i].trim()
    if (!block) continue

    const key = `block-${i}`

    // Heading
    if (block.startsWith("## ")) {
      rendered.push({
        key,
        element: (
          <h2 key={key} className="mt-10 mb-4 text-2xl font-semibold tracking-tight text-foreground">
            {block.slice(3)}
          </h2>
        ),
      })
      continue
    }

    // Unordered list (lines starting with "- ")
    const lines = block.split("\n")
    if (lines.every((l) => l.startsWith("- "))) {
      rendered.push({
        key,
        element: (
          <ul key={key} className="my-4 space-y-2 pl-6 list-disc">
            {lines.map((line) => (
              <li key={`${key}-li-${line}`} className="text-muted-foreground leading-relaxed">
                {renderInline(line.slice(2))}
              </li>
            ))}
          </ul>
        ),
      })
      continue
    }

    // Ordered list (lines starting with "1. ", "2. ", etc.)
    if (lines.every((l) => /^\d+\.\s/.test(l))) {
      rendered.push({
        key,
        element: (
          <ol key={key} className="my-4 space-y-2 pl-6 list-decimal">
            {lines.map((line) => (
              <li key={`${key}-li-${line}`} className="text-muted-foreground leading-relaxed">
                {renderInline(line.replace(/^\d+\.\s/, ""))}
              </li>
            ))}
          </ol>
        ),
      })
      continue
    }

    // Default: paragraph
    rendered.push({
      key,
      element: (
        <p key={key} className="my-4 text-muted-foreground leading-relaxed">
          {renderInline(block)}
        </p>
      ),
    })
  }

  return rendered
}

function formatDate(dateString: string): string {
  return new Date(dateString).toLocaleDateString("en-US", {
    year: "numeric",
    month: "long",
    day: "numeric",
  })
}

export default async function BlogPostPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params
  const post = getPost(slug)
  if (!post) notFound()

  const blocks = parseContent(post.content)

  return (
    <div className="flex min-h-screen flex-col bg-background">
      <Navbar />
      <main className="flex-1">
        <article className="py-12 md:py-20">
          <div className="container mx-auto max-w-3xl px-4">
            {/* Back link */}
            <Link
              href="/blog"
              className="inline-flex items-center gap-1.5 text-sm font-medium text-muted-foreground hover:text-foreground transition-colors mb-8"
            >
              <ArrowLeft className="h-4 w-4" />
              Back to Blog
            </Link>

            {/* Post header */}
            <header>
              <time dateTime={post.date} className="text-caption">
                {formatDate(post.date)}
              </time>
              <h1 className="mt-3 text-3xl font-semibold tracking-tight text-foreground sm:text-4xl md:text-5xl">
                {post.title}
              </h1>
              <p className="mt-4 text-body-large">{post.excerpt}</p>
            </header>

            {/* Divider */}
            <hr className="my-8 border-border" />

            {/* Post body */}
            <div>{blocks.map((b) => b.element)}</div>
          </div>
        </article>
      </main>
      <Footer />
    </div>
  )
}
