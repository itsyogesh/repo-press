"use client"

import { motion, useReducedMotion } from "framer-motion"
import { ArrowRight, GitBranch, Github, Sparkles } from "lucide-react"
import Link from "next/link"
import { Button } from "@/components/ui/button"

const EASE_OUT = [0.22, 1, 0.36, 1] as const

/**
 * The publish caret in motion — the brand mark's Signal-Slate commit node
 * lifting off the caret tip and re-forming, reading as content shipping up to
 * `main`. This is the hero's signature moment; it replaces the generic
 * dot-kicker with the actual git-native brand story.
 */
function PublishCaret({ className }: { className?: string }) {
  const reduce = useReducedMotion()
  return (
    <svg viewBox="0 0 100 100" fill="none" role="img" aria-label="RepoPress publishes to main" className={className}>
      {/* faint branch rail the commit rises along */}
      <line x1="49" y1="46" x2="49" y2="10" className="stroke-primary/20" strokeWidth="2" strokeLinecap="round" />
      {/* the caret — ships content up */}
      <g
        className="stroke-foreground"
        strokeWidth="9"
        strokeLinecap="round"
        strokeLinejoin="miter"
        strokeMiterlimit="8"
      >
        <path d="M26 75 L49 48 L73 71" />
        <path d="M49 48 L49 42" />
      </g>
      {/* the commit node lifting off toward main */}
      <motion.circle
        cx="49"
        r="7.6"
        className="fill-primary"
        initial={{ cy: 30 }}
        animate={reduce ? { cy: 30 } : { cy: [30, 16, 30], opacity: [1, 0.65, 1] }}
        transition={{ duration: 2.6, repeat: Number.POSITIVE_INFINITY, ease: "easeInOut", repeatDelay: 0.4 }}
      />
    </svg>
  )
}

export default function Hero() {
  const reduce = useReducedMotion()

  // Entrance is a transform-only settle: opacity stays 1 so content is always
  // visible (robust to no-JS, SEO, backgrounded tabs). Motion is enhancement.
  const rise = (y: number) => ({
    initial: reduce ? { y: 0 } : { y },
    animate: { y: 0 },
  })

  return (
    <section className="relative overflow-hidden px-6 pb-20 pt-24">
      {/* Committed Signal-Slate glow — the page is warm paper, this is the one chromatic focal point */}
      <div
        aria-hidden
        className="pointer-events-none absolute left-1/2 top-[-6rem] -z-10 h-[36rem] w-[52rem] -translate-x-1/2 rounded-full bg-primary/12 blur-[120px]"
      />
      {/* faint branch texture */}
      <div
        aria-hidden
        className="bg-grid-small-black pointer-events-none absolute inset-0 -z-10 opacity-[0.4] [mask-image:radial-gradient(ellipse_60%_50%_at_50%_0%,black,transparent)]"
      />

      <div className="mx-auto flex max-w-[1120px] flex-col items-center">
        {/* Branded animated opener — replaces the generic mono kicker */}
        <motion.div
          {...rise(10)}
          transition={{ duration: 0.6, ease: EASE_OUT }}
          className="flex flex-col items-center gap-3"
        >
          <PublishCaret className="h-14 w-14" />
          <span className="font-mono text-[0.6875rem] uppercase tracking-[0.22em] text-muted-foreground">
            Your repo is your CMS
          </span>
        </motion.div>

        <motion.h1
          {...rise(12)}
          transition={{ duration: 0.6, ease: EASE_OUT, delay: reduce ? 0 : 0.05 }}
          className="rp-display mt-6 max-w-[18ch] text-balance text-center text-[clamp(2.75rem,6vw,4.75rem)]"
        >
          Edit your docs and blog without touching code.
        </motion.h1>

        <motion.p
          {...rise(12)}
          transition={{ duration: 0.6, ease: EASE_OUT, delay: reduce ? 0 : 0.1 }}
          className="mt-6 max-w-[52ch] text-balance text-center text-lg leading-8 text-muted-foreground"
        >
          RepoPress gives you a visual editor for the Markdown and MDX files already in your repository. Edit, preview,
          and publish — changes go back to GitHub as pull requests.
        </motion.p>

        <motion.div
          {...rise(12)}
          transition={{ duration: 0.6, ease: EASE_OUT, delay: reduce ? 0 : 0.15 }}
          className="mt-9 flex flex-wrap items-center justify-center gap-3"
        >
          <Link href="/dashboard">
            <Button size="lg">
              Try the visual editor
              <ArrowRight className="ml-2 h-4 w-4" />
            </Button>
          </Link>
          <Link href="#how-it-works">
            <Button size="lg" variant="outline">
              See how it works
            </Button>
          </Link>
          <a href="https://github.com/itsyogesh/repo-press" target="_blank" rel="noopener noreferrer">
            <Button size="lg" variant="ghost">
              <Github className="mr-2 h-4 w-4" />
              GitHub
            </Button>
          </a>
        </motion.div>

        <div className="mt-6 flex flex-wrap items-center justify-center gap-x-5 gap-y-2 text-sm text-muted-foreground">
          <span className="flex items-center gap-1.5 font-medium text-primary">
            <GitBranch className="h-3.5 w-3.5" />
            Publishes via pull request
          </span>
          <span className="text-muted-foreground/40">·</span>
          <span className="flex items-center gap-1.5">
            <Github className="h-3.5 w-3.5" />
            Works with any GitHub repo
          </span>
          <span className="text-muted-foreground/40">·</span>
          <span className="flex items-center gap-1.5">
            <Sparkles className="h-3.5 w-3.5" />
            Live preview as you edit
          </span>
        </div>

        {/* Editor mock — the signature dark/light split, settling in (opacity always 1) */}
        <motion.div
          {...rise(28)}
          transition={{ duration: 0.7, ease: EASE_OUT, delay: reduce ? 0 : 0.2 }}
          className="relative mx-auto mt-16 w-full max-w-4xl"
        >
          <div className="overflow-hidden rounded-xl border border-border bg-background shadow-[var(--shadow-3)]">
            {/* Top bar */}
            <div className="flex items-center justify-between border-b border-border px-5 py-3.5">
              <div className="flex items-center gap-4">
                <div className="flex gap-1.5">
                  <span className="h-2.5 w-2.5 rounded-full bg-foreground/25" />
                  <span className="h-2.5 w-2.5 rounded-full bg-foreground/15" />
                  <span className="h-2.5 w-2.5 rounded-full bg-foreground/10" />
                </div>
                <div>
                  <p className="font-mono text-[0.6rem] uppercase tracking-[0.2em] text-muted-foreground">
                    Active document
                  </p>
                  <p className="font-mono text-sm tracking-[-0.01em] text-foreground">blog/getting-started.mdx</p>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <span className="rounded-full border border-border bg-muted/50 px-2.5 py-1 font-mono text-[0.6rem] uppercase tracking-[0.16em] text-muted-foreground">
                  Draft
                </span>
                <span className="rounded-full border border-primary/15 bg-primary/10 px-2.5 py-1 font-mono text-[0.6rem] uppercase tracking-[0.16em] text-primary">
                  Branch / docs-update
                </span>
              </div>
            </div>

            {/* Editor panes */}
            <div className="grid lg:grid-cols-2">
              {/* Code pane — dark */}
              <div className="border-b border-border/30 bg-foreground px-5 py-5 text-background lg:border-b-0 lg:border-r lg:border-r-border/20">
                <p className="mb-4 font-mono text-[0.6rem] uppercase tracking-[0.18em] text-background/50">
                  MDX editor
                </p>
                <div className="space-y-1.5 font-mono text-sm leading-7">
                  <p className="text-background/45">---</p>
                  <p>
                    <span className="text-primary/80">title:</span>{" "}
                    <span className="text-background">"Getting started with your blog"</span>
                  </p>
                  <p>
                    <span className="text-primary/80">status:</span> <span className="text-background">"draft"</span>
                  </p>
                  <p className="text-background/45">---</p>
                  <p className="pt-3 text-background"># Getting started with your blog</p>
                  <p className="text-background/72">A step-by-step guide to publishing your first post.</p>
                  <div className="mt-4 rounded-md border border-background/10 bg-background/5 p-3 text-xs text-background/75">
                    &lt;Callout variant="note"&gt;Ready to preview&lt;/Callout&gt;
                  </div>
                </div>
              </div>

              {/* Preview pane — light */}
              <div className="bg-background px-5 py-5">
                <div className="mb-4 flex items-center justify-between">
                  <p className="font-mono text-[0.6rem] uppercase tracking-[0.18em] text-muted-foreground">
                    Rendered preview
                  </p>
                  <span className="flex items-center gap-1 text-xs text-muted-foreground">
                    <Sparkles className="h-3.5 w-3.5 text-primary" />
                    Component-safe
                  </span>
                </div>
                <h2 className="mb-2 font-serif text-2xl tracking-[-0.01em] text-foreground">
                  Getting started with your blog
                </h2>
                <p className="text-sm leading-6 text-muted-foreground">
                  A step-by-step guide to publishing your first post using the visual editor.
                </p>
                <div className="mt-5 space-y-2">
                  <div className="rounded-md border border-border bg-muted/40 p-3 text-sm text-muted-foreground">
                    Auto-detected: <span className="font-mono text-xs text-foreground">blog/</span>
                  </div>
                  <div className="rounded-md border border-border bg-muted/40 p-3 text-sm text-muted-foreground">
                    <GitBranch className="mr-1.5 inline h-3.5 w-3.5 text-primary" />
                    Pull request ready when you publish
                  </div>
                </div>
              </div>
            </div>
          </div>
        </motion.div>
      </div>
    </section>
  )
}
