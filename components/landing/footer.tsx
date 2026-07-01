import { Github } from "lucide-react"
import Link from "next/link"
import { Logo } from "@/components/brand/logo"

const productLinks = [
  { href: "/#features", label: "Features" },
  { href: "/dashboard", label: "Dashboard" },
  { href: "/docs", label: "Docs" },
  { href: "/blog", label: "Blog" },
]

const resourceLinks = [
  { href: "https://github.com/itsyogesh/repo-press", label: "GitHub", external: true },
  { href: "/blog", label: "Changelog", external: false },
  { href: "https://github.com/itsyogesh/repo-press/blob/main/CONTRIBUTING.md", label: "Contributing", external: true },
]

const legalLinks = [
  { href: "/privacy", label: "Privacy" },
  { href: "/terms", label: "Terms" },
]

export default function Footer() {
  return (
    <footer className="border-t border-border">
      <div className="mx-auto max-w-[1120px] px-6 py-12">
        <div className="grid gap-10 lg:grid-cols-[1.5fr_0.8fr_0.8fr_0.8fr]">
          <div className="flex flex-col gap-4">
            <Link href="/" aria-label="RepoPress home">
              <Logo />
            </Link>
            <p className="max-w-sm text-sm leading-6 text-muted-foreground">
              A visual editor for anyone managing content in GitHub repositories — no terminal required.
            </p>
            <a
              href="https://github.com/itsyogesh/repo-press"
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex w-fit items-center gap-2 text-sm font-medium text-muted-foreground transition-colors hover:text-foreground"
            >
              <Github className="h-4 w-4" />
              View on GitHub
            </a>
          </div>

          <div>
            <p className="font-mono text-[0.6875rem] font-medium uppercase tracking-[0.2em] text-muted-foreground mb-4">
              Product
            </p>
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
            <p className="font-mono text-[0.6875rem] font-medium uppercase tracking-[0.2em] text-muted-foreground mb-4">
              Resources
            </p>
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
            <p className="font-mono text-[0.6875rem] font-medium uppercase tracking-[0.2em] text-muted-foreground mb-4">
              Legal
            </p>
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

        <div className="mt-12 flex flex-col gap-4 border-t border-border pt-6 text-sm text-muted-foreground sm:flex-row sm:items-center sm:justify-between">
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
