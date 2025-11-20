import { FileText, Github, Layers, Zap, GitBranch, Code2, Globe, Lock } from "lucide-react"
import { Button } from "@/components/ui/button"
import Link from "next/link"

export default function FeatureGrid() {
  return (
    <section className="container mx-auto px-4 py-24 space-y-8">
      <div className="mx-auto flex max-w-[58rem] flex-col items-center space-y-4 text-center">
        <h2 className="text-4xl font-bold tracking-tight sm:text-5xl text-balance">
          Everything you need to manage content
        </h2>
        <p className="max-w-[85%] leading-normal text-muted-foreground sm:text-lg sm:leading-7 text-balance">
          RepoPress transforms your GitHub repository into a powerful headless CMS. Edit MDX blogs, documentation, legal
          files, and more without leaving your browser.
        </p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6 max-w-7xl mx-auto">
        {/* Large Card: Visual MDX Editor */}
        <div className="md:col-span-2 row-span-2 rounded-3xl bg-zinc-50 dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 p-8 flex flex-col justify-between overflow-hidden relative group">
          <div className="relative z-10">
            <div className="h-12 w-12 rounded-2xl bg-blue-500/10 flex items-center justify-center mb-6">
              <FileText className="h-6 w-6 text-blue-600" />
            </div>
            <h3 className="text-2xl font-semibold mb-2">Visual MDX Editor</h3>
            <p className="text-muted-foreground max-w-md">
              Write content with a Notion-like experience. We render your custom React components live in the editor, so
              you can see exactly what you're shipping.
            </p>
          </div>

          {/* Mock Editor UI */}
          <div className="mt-8 rounded-t-xl border border-zinc-200 dark:border-zinc-800 bg-background shadow-sm p-4 h-64 relative transform transition-transform group-hover:scale-[1.01] origin-bottom">
            <div className="flex items-center gap-2 mb-4 border-b border-zinc-100 dark:border-zinc-800 pb-2">
              <div className="w-3 h-3 rounded-full bg-red-400/80" />
              <div className="w-3 h-3 rounded-full bg-yellow-400/80" />
              <div className="w-3 h-3 rounded-full bg-green-400/80" />
              <div className="ml-4 text-xs text-muted-foreground font-mono">blog-post.mdx</div>
            </div>
            <div className="space-y-3">
              <div className="h-8 w-3/4 bg-zinc-100 dark:bg-zinc-800 rounded-md" />
              <div className="h-4 w-full bg-zinc-50 dark:bg-zinc-900 rounded-md" />
              <div className="h-4 w-5/6 bg-zinc-50 dark:bg-zinc-900 rounded-md" />
              <div className="h-32 w-full bg-blue-50/50 dark:bg-blue-900/10 rounded-lg border border-blue-100 dark:border-blue-900/20 flex items-center justify-center overflow-hidden">
                <span className="text-xs text-blue-500 font-mono">{"<CustomComponent />"}</span>
              </div>
            </div>
          </div>
        </div>

        {/* Card: Open Source */}
        <div className="rounded-3xl bg-zinc-900 text-white p-8 flex flex-col justify-between relative overflow-hidden group">
          <div className="absolute top-0 right-0 p-4 opacity-10 group-hover:opacity-20 transition-opacity">
            <Github className="h-32 w-32" />
          </div>
          <div>
            <div className="h-12 w-12 rounded-2xl bg-white/10 flex items-center justify-center mb-6">
              <Code2 className="h-6 w-6 text-white" />
            </div>
            <h3 className="text-xl font-semibold mb-2">100% Open Source</h3>
            <p className="text-zinc-400 text-sm">
              Built by developers, for developers. Host it yourself or deploy on Vercel in seconds.
            </p>
          </div>
          <Button variant="secondary" className="mt-6 w-full rounded-full" asChild>
            <Link href="https://github.com/itsyogesh/repo-press" target="_blank">
              Star on GitHub
            </Link>
          </Button>
        </div>

        {/* Card: Content Types */}
        <div className="rounded-3xl bg-zinc-50 dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 p-8 flex flex-col">
          <div className="h-12 w-12 rounded-2xl bg-purple-500/10 flex items-center justify-center mb-6">
            <Layers className="h-6 w-6 text-purple-600" />
          </div>
          <h3 className="text-xl font-semibold mb-2">Any Content Type</h3>
          <p className="text-muted-foreground text-sm mb-6">
            Perfect for modern documentation, engineering blogs, and legal policies.
          </p>
          <div className="grid grid-cols-2 gap-2 mt-auto">
            <div className="flex items-center gap-2 text-xs font-medium p-2 rounded-lg bg-white dark:bg-zinc-800 border border-zinc-100 dark:border-zinc-700">
              <Globe className="h-3 w-3 text-blue-500" /> Blog
            </div>
            <div className="flex items-center gap-2 text-xs font-medium p-2 rounded-lg bg-white dark:bg-zinc-800 border border-zinc-100 dark:border-zinc-700">
              <FileText className="h-3 w-3 text-orange-500" /> Docs
            </div>
            <div className="flex items-center gap-2 text-xs font-medium p-2 rounded-lg bg-white dark:bg-zinc-800 border border-zinc-100 dark:border-zinc-700">
              <Lock className="h-3 w-3 text-green-500" /> Legal
            </div>
            <div className="flex items-center gap-2 text-xs font-medium p-2 rounded-lg bg-white dark:bg-zinc-800 border border-zinc-100 dark:border-zinc-700">
              <Zap className="h-3 w-3 text-yellow-500" /> API
            </div>
          </div>
        </div>

        {/* Card: Git Native */}
        <div className="md:col-span-2 rounded-3xl bg-zinc-50 dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 p-8 flex flex-col md:flex-row items-center gap-8 overflow-hidden">
          <div className="flex-1">
            <div className="h-12 w-12 rounded-2xl bg-orange-500/10 flex items-center justify-center mb-6">
              <GitBranch className="h-6 w-6 text-orange-600" />
            </div>
            <h3 className="text-2xl font-semibold mb-2">Git Native Workflow</h3>
            <p className="text-muted-foreground">
              No database to manage. We read directly from your repository and commit changes back as standard Git
              commits. You own your data, forever.
            </p>
          </div>
          <div className="w-full md:w-1/2 bg-white dark:bg-zinc-800 rounded-xl border border-zinc-200 dark:border-zinc-700 p-4 shadow-sm">
            <div className="flex items-center gap-3 text-sm font-mono text-muted-foreground mb-2">
              <GitBranch className="h-4 w-4" />
              <span>main</span>
            </div>
            <div className="pl-2 border-l-2 border-zinc-200 dark:border-zinc-700 ml-2 space-y-4 py-2">
              <div className="flex items-center gap-2 text-xs">
                <div className="w-2 h-2 rounded-full bg-blue-500" />
                <span className="text-foreground font-medium">feat: update pricing page</span>
              </div>
              <div className="flex items-center gap-2 text-xs">
                <div className="w-2 h-2 rounded-full bg-blue-500" />
                <span className="text-foreground font-medium">docs: add installation guide</span>
              </div>
            </div>
          </div>
        </div>

        {/* Card: Zero Config */}
        <div className="rounded-3xl bg-gradient-to-br from-blue-50 to-indigo-50 dark:from-blue-950/30 dark:to-indigo-950/30 border border-blue-100 dark:border-blue-900/50 p-8 flex flex-col justify-center items-center text-center">
          <div className="h-16 w-16 rounded-full bg-white dark:bg-blue-900/50 shadow-sm flex items-center justify-center mb-4">
            <Zap className="h-8 w-8 text-blue-600 dark:text-blue-400 fill-current" />
          </div>
          <h3 className="text-xl font-semibold mb-2 text-blue-900 dark:text-blue-100">Zero Config</h3>
          <p className="text-blue-700 dark:text-blue-300 text-sm">
            Connect your repo and start editing in seconds. No config files required.
          </p>
        </div>
      </div>
    </section>
  )
}
