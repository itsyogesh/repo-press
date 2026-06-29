import { ArrowRight } from "lucide-react"
import type { Metadata } from "next"
import Link from "next/link"
import Footer from "@/components/landing/footer"
import Navbar from "@/components/landing/navbar"
import { getAllPosts } from "@/lib/blog-data"

export const metadata: Metadata = {
  title: "Blog - RepoPress",
  description: "News, updates, and insights from the RepoPress team.",
}

function formatDate(dateString: string): string {
  return new Date(dateString).toLocaleDateString("en-US", {
    year: "numeric",
    month: "long",
    day: "numeric",
  })
}

export default function BlogIndexPage() {
  const posts = getAllPosts()

  return (
    <div className="flex min-h-screen flex-col bg-background">
      <Navbar />
      <main className="flex-1">
        {/* Header */}
        <section className="border-b border-border/40 py-16 md:py-24">
          <div className="container mx-auto px-4">
            <h1 className="text-section-heading">Blog</h1>
            <p className="mt-4 text-section-subheading max-w-2xl">
              News, updates, and insights from the RepoPress team.
            </p>
          </div>
        </section>

        {/* Post grid */}
        <section className="py-12 md:py-16">
          <div className="container mx-auto px-4">
            <div className="grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-3">
              {posts.map((post) => (
                <Link
                  key={post.slug}
                  href={`/blog/${post.slug}`}
                  className="group flex flex-col bg-card border border-border rounded-lg p-6 hover:border-primary/50 transition-colors"
                >
                  <time dateTime={post.date} className="text-caption">
                    {formatDate(post.date)}
                  </time>
                  <h2 className="mt-3 text-xl font-semibold text-foreground group-hover:text-primary transition-colors">
                    {post.title}
                  </h2>
                  <p className="mt-2 flex-1 text-muted-foreground text-sm leading-relaxed">{post.excerpt}</p>
                  <span className="mt-4 inline-flex items-center gap-1 text-sm font-medium text-primary">
                    Read more
                    <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-0.5" />
                  </span>
                </Link>
              ))}
            </div>
          </div>
        </section>
      </main>
      <Footer />
    </div>
  )
}
