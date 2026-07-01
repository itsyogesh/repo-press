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
            <h1 className="rp-display text-4xl md:text-5xl">Blog</h1>
            <p className="mt-4 max-w-[52ch] text-lg leading-8 text-muted-foreground">
              News, updates, and insights from the RepoPress team.
            </p>
          </div>
        </section>

        {/* Post list */}
        <section className="py-12 md:py-16">
          <div className="container mx-auto px-4">
            <div className="border-t border-border">
              {posts.map((post) => (
                <Link
                  key={post.slug}
                  href={`/blog/${post.slug}`}
                  className="group flex items-center justify-between gap-6 border-b border-border py-6"
                >
                  <div className="min-w-0">
                    <time
                      dateTime={post.date}
                      className="font-mono text-[0.6875rem] uppercase tracking-[0.18em] text-muted-foreground/55"
                    >
                      {formatDate(post.date)}
                    </time>
                    <h2 className="mt-1.5 rp-display text-lg text-foreground transition-colors group-hover:text-primary">
                      {post.title}
                    </h2>
                    <p className="mt-1 line-clamp-2 text-sm leading-6 text-muted-foreground">{post.excerpt}</p>
                  </div>
                  <ArrowRight className="h-4 w-4 shrink-0 text-muted-foreground/40 transition-all group-hover:translate-x-0.5 group-hover:text-primary" />
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
