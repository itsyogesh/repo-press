import { Github } from "lucide-react"
import Link from "next/link"

const productLinks = [
  { href: "/#features", label: "Features" },
  { href: "/dashboard", label: "Dashboard" },
  { href: "/docs", label: "Docs" },
  { href: "/blog", label: "Blog" },
]

const resourceLinks = [
  {
    href: "https://github.com/itsyogesh/repo-press",
    label: "GitHub",
    external: true,
  },
  { href: "/blog", label: "Changelog", external: false },
  {
    href: "https://github.com/itsyogesh/repo-press/blob/main/CONTRIBUTING.md",
    label: "Contributing",
    external: true,
  },
]

const legalLinks = [
  { href: "/privacy", label: "Privacy" },
  { href: "/terms", label: "Terms" },
]

export default function Footer() {
  return (
    <footer className="px-4 pb-10 pt-6">
      <div className="mx-auto max-w-6xl rounded-[2rem] border border-border/70 bg-muted/35 px-6 py-10 sm:px-8">
        <div className="grid gap-10 lg:grid-cols-[1.2fr_0.8fr_0.8fr_0.8fr]">
          <div className="flex flex-col gap-4">
            <Link href="/" className="flex items-center gap-3">
              <span className="inline-flex size-10 items-center justify-center rounded-xl border border-border/70 bg-background/80 font-mono text-[0.72rem] font-semibold uppercase tracking-[0.24em] text-foreground">
                RP
              </span>
              <div className="flex flex-col">
                <span className="text-sm font-semibold tracking-[-0.03em] text-foreground">RepoPress</span>
                <span className="font-mono text-[0.65rem] uppercase tracking-[0.22em] text-muted-foreground">
                  Git-native studio
                </span>
              </div>
            </Link>
            <p className="max-w-sm text-sm leading-6 text-muted-foreground">
              A visual editor for anyone managing content in GitHub repositories — no terminal required.
            </p>
            <a
              href="https://github.com/itsyogesh/repo-press"
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex w-fit items-center gap-2 rounded-full border border-border/70 bg-background px-3 py-2 text-sm font-medium tracking-[-0.01em] text-foreground"
            >
              <Github className="h-4 w-4" />
              View on GitHub
            </a>
          </div>

          <div>
            <h3 className="mb-4 text-sm font-semibold tracking-[-0.01em] text-foreground">Product</h3>
            <ul className="flex flex-col gap-3">
              {productLinks.map((link) => (
                <li key={link.href + link.label}>
                  <Link
                    href={link.href}
                    className="text-sm text-muted-foreground transition-colors hover:text-foreground"
                  >
                    {link.label}
                  </Link>
                </li>
              ))}
            </ul>
          </div>

          <div>
            <h3 className="mb-4 text-sm font-semibold tracking-[-0.01em] text-foreground">Resources</h3>
            <ul className="flex flex-col gap-3">
              {resourceLinks.map((link) => (
                <li key={link.href + link.label}>
                  {link.external ? (
                    <a
                      href={link.href}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-sm text-muted-foreground transition-colors hover:text-foreground"
                    >
                      {link.label}
                    </a>
                  ) : (
                    <Link
                      href={link.href}
                      className="text-sm text-muted-foreground transition-colors hover:text-foreground"
                    >
                      {link.label}
                    </Link>
                  )}
                </li>
              ))}
            </ul>
          </div>

          <div>
            <h3 className="mb-4 text-sm font-semibold tracking-[-0.01em] text-foreground">Legal</h3>
            <ul className="flex flex-col gap-3">
              {legalLinks.map((link) => (
                <li key={link.href}>
                  <Link
                    href={link.href}
                    className="text-sm text-muted-foreground transition-colors hover:text-foreground"
                  >
                    {link.label}
                  </Link>
                </li>
              ))}
            </ul>
          </div>
        </div>

        <div className="mt-10 flex flex-col gap-4 border-t border-border/70 pt-6 text-sm text-muted-foreground sm:flex-row sm:items-center sm:justify-between">
          <p>© {new Date().getFullYear()} RepoPress. Visual editing for content in GitHub.</p>
          <div className="flex items-center gap-4">
            <a
              href="https://github.com/itsyogesh/repo-press"
              target="_blank"
              rel="noopener noreferrer"
              className="transition-colors hover:text-foreground"
            >
              GitHub
            </a>
            <Link href="/privacy" className="transition-colors hover:text-foreground">
              Privacy
            </Link>
            <Link href="/terms" className="transition-colors hover:text-foreground">
              Terms
            </Link>
          </div>
        </div>
      </div>
    </footer>
  )
}
