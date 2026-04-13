"use client"

import { ArrowRight, FileImage, FileText, FolderTree, Github, Loader2, ScanSearch } from "lucide-react"
import { useState } from "react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { buildRepoScannerDemo } from "@/lib/repo-scanner-demo"
import { cn } from "@/lib/utils"

const sampleRepos = [
  { url: "https://github.com/fuma-nama/fumadocs", label: "Fumadocs" },
  { url: "https://github.com/withastro/blog-tutorial-demo", label: "Astro" },
  { url: "https://github.com/leerob/leerob.io", label: "Next.js" },
]

const defaultRepo = sampleRepos[0].url

export default function RepoScanner() {
  const [input, setInput] = useState(defaultRepo)
  const [result, setResult] = useState(() => buildRepoScannerDemo(defaultRepo))
  const [isScanning, setIsScanning] = useState(false)

  const runScan = (value: string) => {
    setIsScanning(true)
    setTimeout(() => {
      setResult(buildRepoScannerDemo(value))
      setIsScanning(false)
    }, 400)
  }

  const handleScan = () => runScan(input)

  const handleSampleSelect = (url: string) => {
    setInput(url)
    runScan(url)
  }

  const isError = "error" in result

  return (
    <section id="demo" className="px-4 py-24">
      <div className="mx-auto grid max-w-6xl gap-6 lg:grid-cols-[0.88fr_1.12fr]">
        <div className="flex flex-col gap-6">
          <div className="space-y-4">
            <p className="font-mono text-[0.72rem] uppercase tracking-[0.24em] text-muted-foreground">
              Interactive demo
            </p>
            <h2 className="max-w-[14ch] text-4xl font-semibold tracking-[-0.05em] text-balance text-foreground sm:text-5xl">
              Paste a repo. See what RepoPress would detect.
            </h2>
            <p className="max-w-xl text-base leading-7 text-muted-foreground sm:text-lg sm:leading-8">
              The scanner is a lightweight product demo: paste a GitHub repo URL and RepoPress will map a likely content
              root, framework, and publishing recommendation before you even open the studio.
            </p>
          </div>

          <div className="space-y-3">
            <p className="font-mono text-[0.68rem] uppercase tracking-[0.2em] text-muted-foreground">
              Try a sample repo
            </p>
            <div className="flex flex-wrap gap-2">
              {sampleRepos.map(({ url, label }) => {
                const isActive = input === url
                return (
                  <button
                    key={url}
                    type="button"
                    onClick={() => handleSampleSelect(url)}
                    className={cn(
                      "rounded-full border px-3 py-2 text-xs font-medium tracking-[-0.01em] transition-colors",
                      isActive
                        ? "border-primary/40 bg-primary/8 text-foreground"
                        : "border-border/70 bg-background text-muted-foreground hover:border-border hover:text-foreground",
                    )}
                  >
                    {url.replace("https://github.com/", "")}
                    <span className={cn("ml-1.5 font-normal", isActive ? "text-primary" : "text-muted-foreground/60")}>
                      · {label}
                    </span>
                  </button>
                )
              })}
            </div>
          </div>

          <div className="surface-card rounded-[1.5rem] border p-5">
            <div className="flex items-center gap-3">
              <span className="inline-flex size-10 items-center justify-center rounded-xl bg-primary/10 text-primary">
                <ScanSearch className="h-5 w-5" />
              </span>
              <div>
                <h3 className="text-base font-semibold tracking-[-0.02em] text-foreground">What makes it different?</h3>
                <p className="text-sm leading-6 text-muted-foreground">
                  This demo reflects RepoPress&apos;s product promise: framework-aware onboarding without a CMS
                  migration ritual.
                </p>
              </div>
            </div>
          </div>
        </div>

        <div className="surface-card rounded-[1.75rem] border p-6 sm:p-7">
          <div className="mb-6 flex flex-col gap-1.5">
            <div className="flex items-center justify-between">
              <p className="font-mono text-[0.68rem] uppercase tracking-[0.2em] text-muted-foreground">Repo scanner</p>
              <p className="font-mono text-[0.62rem] text-muted-foreground/50">demo · no network requests</p>
            </div>
            <h3 className="text-2xl font-semibold tracking-[-0.04em] text-foreground">Framework-aware setup preview</h3>
          </div>

          <form
            className="space-y-4"
            onSubmit={(event) => {
              event.preventDefault()
              handleScan()
            }}
          >
            <label htmlFor="repo-scanner-url" className="text-sm font-medium tracking-[-0.01em] text-foreground">
              GitHub repository URL
            </label>
            <div className="flex flex-col gap-3 sm:flex-row">
              <Input
                id="repo-scanner-url"
                value={input}
                onChange={(event) => setInput(event.target.value)}
                placeholder="https://github.com/acme/docs"
                aria-invalid={isError || undefined}
                aria-describedby={isError ? "repo-scanner-error" : undefined}
                className="h-12 rounded-xl px-4"
              />
              <Button type="submit" disabled={isScanning} className="h-12 rounded-xl px-5">
                {isScanning ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Scanning…
                  </>
                ) : (
                  "Scan repo"
                )}
              </Button>
            </div>
          </form>

          {isError ? (
            <div
              id="repo-scanner-error"
              className="mt-6 rounded-2xl border border-destructive/20 bg-destructive/5 p-4 text-sm text-destructive"
              aria-live="polite"
            >
              {result.error}
            </div>
          ) : (
            <div
              className={cn(
                "mt-6 space-y-4 transition-opacity duration-200",
                isScanning && "pointer-events-none opacity-40",
              )}
              aria-live="polite"
            >
              <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-border/70 bg-muted/35 px-4 py-3">
                <div>
                  <p className="font-mono text-[0.65rem] uppercase tracking-[0.18em] text-muted-foreground">
                    Detected repo
                  </p>
                  <p className="text-sm font-semibold tracking-[-0.02em] text-foreground">
                    {result.owner}/{result.repo}
                  </p>
                </div>
                <div className="rounded-full border border-primary/15 bg-primary/10 px-3 py-1 font-mono text-[0.65rem] uppercase tracking-[0.18em] text-primary">
                  {result.framework}
                </div>
              </div>

              <div className="grid gap-3 sm:grid-cols-3">
                <div className="rounded-2xl border border-border/70 bg-background p-4">
                  <p className="font-mono text-[0.62rem] uppercase tracking-[0.18em] text-muted-foreground">
                    Collections
                  </p>
                  <p className="mt-3 text-2xl font-semibold tracking-[-0.04em] text-foreground">{result.collections}</p>
                </div>
                <div className="rounded-2xl border border-border/70 bg-background p-4">
                  <p className="font-mono text-[0.62rem] uppercase tracking-[0.18em] text-muted-foreground">
                    Documents
                  </p>
                  <p className="mt-3 text-2xl font-semibold tracking-[-0.04em] text-foreground">{result.documents}</p>
                </div>
                <div className="rounded-2xl border border-border/70 bg-background p-4">
                  <p className="font-mono text-[0.62rem] uppercase tracking-[0.18em] text-muted-foreground">Assets</p>
                  <p className="mt-3 text-2xl font-semibold tracking-[-0.04em] text-foreground">{result.assets}</p>
                </div>
              </div>

              <div className="grid gap-4 xl:grid-cols-[1.1fr_0.9fr]">
                <div className="rounded-[1.5rem] border border-border/70 bg-background p-5">
                  <p className="font-mono text-[0.65rem] uppercase tracking-[0.18em] text-muted-foreground">
                    Scanner output
                  </p>
                  <div className="mt-4 space-y-4">
                    <div>
                      <p className="text-sm font-medium tracking-[-0.01em] text-foreground">Suggested content root</p>
                      <p className="mt-1 font-mono text-xs uppercase tracking-[0.18em] text-muted-foreground">
                        {result.contentRoot}
                      </p>
                    </div>
                    <div>
                      <p className="text-sm font-medium tracking-[-0.01em] text-foreground">Why we detected this</p>
                      <p className="mt-1 text-sm leading-6 text-muted-foreground">{result.detectionBasis}</p>
                    </div>
                    <div>
                      <p className="text-sm font-medium tracking-[-0.01em] text-foreground">Recommended action</p>
                      <p className="mt-1 text-sm leading-6 text-muted-foreground">{result.recommendedAction}</p>
                    </div>
                  </div>
                </div>

                <div className="rounded-[1.5rem] border border-border/70 bg-muted/35 p-5">
                  <p className="font-mono text-[0.65rem] uppercase tracking-[0.18em] text-muted-foreground">
                    Detected structure
                  </p>
                  <div className="mt-4 space-y-3 text-sm text-muted-foreground">
                    <div className="flex items-center gap-3">
                      <Github className="h-4 w-4 text-primary" />
                      <span className="font-medium text-foreground">{result.owner}</span>
                    </div>
                    <div className="flex items-center gap-3 pl-5">
                      <ArrowRight className="h-4 w-4 text-muted-foreground" />
                      <span>{result.repo}</span>
                    </div>
                    <div className="flex items-center gap-3 pl-5">
                      <FolderTree className="h-4 w-4 text-primary" />
                      <span>{result.contentRoot}</span>
                    </div>
                    <div className="flex items-center gap-3 pl-5">
                      <FileText className="h-4 w-4 text-primary" />
                      <span>{result.documents} documents ready to open in the studio</span>
                    </div>
                    <div className="flex items-center gap-3 pl-5">
                      <FileImage className="h-4 w-4 text-primary" />
                      <span>{result.assets} assets available for the media gallery</span>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </section>
  )
}
