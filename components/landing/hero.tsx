import { ArrowRight } from "lucide-react"
import Link from "next/link"
import { Button } from "@/components/ui/button"

export default function Hero() {
  return (
    <section className="relative">
      <div className="border-y border-border/40 bg-background/50 backdrop-blur-sm">
        <div className="container mx-auto px-4 flex max-w-[64rem] flex-col items-center gap-6 py-12 md:py-20 text-center">
          <h1 className="font-heading text-3xl sm:text-5xl md:text-6xl lg:text-7xl font-bold tracking-tight text-balance">
            The Headless CMS <br />
            <span className="text-muted-foreground">you already have.</span>
          </h1>

          <p className="max-w-[42rem] leading-normal text-muted-foreground sm:text-xl sm:leading-8 text-balance">
            Edit MDX files, preview components, and manage your GitHub content without leaving the browser. No config
            files. No lock-in.
          </p>

          <div className="space-x-4">
            <Link href="/dashboard">
              <Button size="lg" className="h-12 rounded-full px-8">
                Start Writing <ArrowRight className="ml-2 h-4 w-4" />
              </Button>
            </Link>
          </div>
        </div>
      </div>

      <div className="container mx-auto px-4 flex flex-col items-center py-12 md:py-20">
        <div className="relative w-full max-w-5xl">
          <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-3/4 h-3/4 bg-gradient-to-r from-orange-500/20 via-pink-500/20 to-purple-500/20 blur-[120px] -z-10 rounded-full" />

          <div className="overflow-hidden rounded-xl border border-border/50 bg-zinc-900/90 shadow-2xl backdrop-blur-sm ring-1 ring-white/10">
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

        <div className="mt-12 flex flex-col items-center gap-2">
          <p className="text-sm text-muted-foreground">Join 80,000+ developers</p>
          <div className="flex -space-x-2">
            <div className="h-8 w-8 rounded-full border-2 border-background bg-gray-200 flex items-center justify-center text-[10px] font-bold text-gray-500">
              A
            </div>
            <div className="h-8 w-8 rounded-full border-2 border-background bg-gray-300 flex items-center justify-center text-[10px] font-bold text-gray-500">
              B
            </div>
            <div className="h-8 w-8 rounded-full border-2 border-background bg-gray-400 flex items-center justify-center text-[10px] font-bold text-gray-500">
              C
            </div>
            <div className="h-8 w-8 rounded-full border-2 border-background bg-gray-100 flex items-center justify-center text-[10px] font-bold text-gray-500">
              +
            </div>
          </div>
        </div>
      </div>
    </section>
  )
}
