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
    <section id="demo" className="border-t border-border px-6 py-24">
      <div className="mx-auto max-w-[1120px]">
        <div className="grid gap-10 lg:grid-cols-[0.88fr_1.12fr] lg:gap-16">
          {/* Left — description */}
          <div className="flex flex-col gap-6">
            <div className="space-y-4">
              <p className="rp-overline">Interactive demo</p>
              <h2 className="rp-display max-w-[16ch] text-[clamp(1.75rem,4vw,2.5rem)] text-balance">
                Paste a repo. See what RepoPress would detect.
              </h2>
              <p className="max-w-xl text-base leading-7 text-muted-foreground">
                The scanner is a lightweight product demo: paste a GitHub repo URL and RepoPress will map a likely
                content root, framework, and publishing recommendation before you even open the studio.
              </p>
            </div>

            <div className="space-y-3">
              <p className="rp-overline">Try a sample repo</p>
              <div className="flex flex-wrap gap-2">
                {sampleRepos.map(({ url, label }) => {
                  const isActive = input === url
                  return (
                    <button
                      key={url}
                      type="button"
                      onClick={() => handleSampleSelect(url)}
                      className={cn(
                        "rounded-full border px-3 py-1.5 text-xs font-medium tracking-[-0.01em] transition-colors",
                        isActive
                          ? "border-primary/40 bg-primary/8 text-foreground"
                          : "border-border bg-background text-muted-foreground hover:border-border hover:text-foreground",
                      )}
                    >
                      {url.replace("https://github.com/", "")}
                      <span
                        className={cn("ml-1.5 font-normal", isActive ? "text-primary" : "text-muted-foreground/60")}
                      >
                        · {label}
                      </span>
                    </button>
                  )
                })}
              </div>
            </div>

            <div className="rounded-lg border border-border bg-background p-5">
              <div className="flex items-start gap-3">
                <ScanSearch className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
                <div>
                  <h3 className="text-sm font-medium tracking-[-0.01em] text-foreground">What makes it different?</h3>
                  <p className="mt-1 text-sm leading-6 text-muted-foreground">
                    This demo reflects RepoPress&apos;s product promise: framework-aware onboarding without a CMS
                    migration ritual.
                  </p>
                </div>
              </div>
            </div>
          </div>

          {/* Right — scanner panel */}
          <div className="rounded-lg border border-border bg-background p-6 sm:p-7">
            <div className="mb-6 flex flex-col gap-1">
              <div className="flex items-center justify-between">
                <p className="rp-overline">Repo scanner</p>
                <p className="font-mono text-[0.6rem] text-muted-foreground/50">demo · no network requests</p>
              </div>
              <h3 className="text-xl font-medium tracking-[-0.03em] text-foreground">Framework-aware setup preview</h3>
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
                  className="h-10 px-3"
                />
                <Button type="submit" disabled={isScanning} className="h-10 px-5">
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
                className="mt-6 rounded-md border border-destructive/20 bg-destructive/5 p-4 text-sm text-destructive"
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
                <div className="flex flex-wrap items-center justify-between gap-3 rounded-md border border-border bg-muted/40 px-4 py-3">
                  <div>
                    <p className="rp-overline mb-1">Detected repo</p>
                    <p className="text-sm font-medium tracking-[-0.02em] text-foreground">
                      {result.owner}/{result.repo}
                    </p>
                  </div>
                  <div className="rounded-full border border-primary/20 bg-primary/10 px-3 py-1 font-mono text-[0.6rem] uppercase tracking-[0.16em] text-primary">
                    {result.framework}
                  </div>
                </div>

                <div className="grid gap-3 sm:grid-cols-3">
                  {[
                    { label: "Collections", value: result.collections },
                    { label: "Documents", value: result.documents },
                    { label: "Assets", value: result.assets },
                  ].map((stat) => (
                    <div key={stat.label} className="rounded-md border border-border bg-background p-4">
                      <p className="rp-overline mb-2">{stat.label}</p>
                      <p className="text-2xl font-semibold tracking-[-0.04em] text-foreground">{stat.value}</p>
                    </div>
                  ))}
                </div>

                <div className="grid gap-4 xl:grid-cols-[1.1fr_0.9fr]">
                  <div className="rounded-md border border-border bg-background p-5">
                    <p className="rp-overline mb-4">Scanner output</p>
                    <div className="space-y-4">
                      <div>
                        <p className="text-sm font-medium tracking-[-0.01em] text-foreground">Suggested content root</p>
                        <p className="mt-1 font-mono text-xs uppercase tracking-[0.16em] text-muted-foreground">
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

                  <div className="rounded-md border border-border bg-muted/30 p-5">
                    <p className="rp-overline mb-4">Detected structure</p>
                    <div className="space-y-3 text-sm text-muted-foreground">
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
      </div>
    </section>
  )
}
