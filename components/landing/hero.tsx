import { ArrowRight, Github } from "lucide-react"
import Link from "next/link"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"

const frameworks = ["Next.js", "Astro", "Hugo", "Docusaurus", "Jekyll", "Fumadocs"]

export default function Hero() {
  return (
    <section className="relative">
      <div className="border-y border-border/40 bg-background/50 backdrop-blur-sm">
        <div className="container mx-auto px-4 flex max-w-[64rem] flex-col items-center gap-6 py-12 md:py-20 text-center">
          <h1 className="font-heading text-3xl sm:text-5xl md:text-6xl lg:text-7xl font-bold tracking-tight text-balance">
            Your repo is <br />
            <span className="text-muted-foreground">your CMS</span>
          </h1>

          <p className="max-w-[42rem] leading-normal text-muted-foreground sm:text-xl sm:leading-8 text-balance">
            Edit MDX, preview components, and publish — directly from your GitHub repo. Works with Next.js, Astro, Hugo,
            Docusaurus, and more.
          </p>

          <div className="flex flex-col sm:flex-row items-center gap-3">
            <Link href="/dashboard">
              <Button size="lg" className="h-12 rounded-full px-8">
                Start Writing <ArrowRight className="ml-2 h-4 w-4" />
              </Button>
            </Link>
            <a href="https://github.com/itsyogesh/repo-press" target="_blank" rel="noopener noreferrer">
              <Button size="lg" variant="outline" className="h-12 rounded-full px-8">
                <Github className="mr-2 h-4 w-4" />
                View on GitHub
              </Button>
            </a>
          </div>

          <div className="flex flex-col items-center gap-4 pt-4">
            <div className="flex flex-wrap items-center justify-center gap-2">
              <span className="text-sm text-muted-foreground">Works with</span>
              {frameworks.map((fw) => (
                <Badge key={fw} variant="secondary" className="rounded-full text-xs font-normal">
                  {fw}
                </Badge>
              ))}
            </div>
            <Badge variant="outline" className="rounded-full gap-1.5">
              <Github className="h-3 w-3" />
              Free &amp; Open Source
            </Badge>
          </div>
        </div>
      </div>

      <div className="container mx-auto px-4 flex flex-col items-center py-12 md:py-20">
        <div className="relative w-full max-w-5xl hidden md:block">
          <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 h-3/4 w-3/4 rounded-full bg-linear-to-r from-primary/15 via-primary/10 to-primary/5 blur-[120px] -z-10" />

          <div className="overflow-hidden rounded-xl border border-border/50 bg-zinc-950/95 shadow-2xl backdrop-blur-sm ring-1 ring-white/10">
            <div className="flex h-10 items-center border-b border-white/5 bg-white/5 px-4">
              <div className="flex gap-2">
                <div className="h-3 w-3 rounded-full bg-red-500/50" />
                <div className="h-3 w-3 rounded-full bg-yellow-500/50" />
                <div className="h-3 w-3 rounded-full bg-green-500/50" />
              </div>
            </div>
            <div className="flex h-[400px] text-left font-mono text-sm">
              {/* Left Pane: Code */}
              <div className="w-1/2 border-r border-white/5 bg-transparent p-6 text-zinc-300 overflow-hidden">
                <p>
                  <span className="text-purple-400">---</span>
                </p>
                <p>
                  <span className="text-blue-400">title:</span> "Hello World"
                </p>
                <p>
                  <span className="text-purple-400">---</span>
                </p>
                <br />
                <p>
                  <span className="text-yellow-400"># The Future of Docs</span>
                </p>
                <br />
                <p>
                  This is how we write now. <span className="text-green-400">{"<Button>Click me</Button>"}</span>
                </p>
              </div>

              {/* Right Pane: Preview */}
              <div className="w-1/2 bg-white p-6 text-zinc-900 overflow-hidden">
                <h1 className="text-3xl font-bold mb-4">The Future of Docs</h1>
                <p className="mb-4 text-zinc-600">This is how we write now.</p>
                <button type="button" className="bg-black text-white px-4 py-2 rounded-md text-xs">
                  Click me
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  )
}
