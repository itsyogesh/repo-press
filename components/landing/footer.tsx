import { Box, Github, Twitter } from "lucide-react"
import Link from "next/link"

const productLinks = [
  { href: "/#features", label: "Features" },
  { href: "/dashboard", label: "Studio" },
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
    <footer className="border-t border-border/40 bg-background">
      {/* Top section */}
      <div className="container mx-auto px-4 py-12 md:py-16">
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-10 lg:gap-16">
          {/* Brand column */}
          <div className="lg:col-span-2 flex flex-col gap-4">
            <Link href="/" className="flex items-center gap-2 text-xl">
              <Box className="h-6 w-6" />
              <div className="flex items-baseline">
                <span className="font-bold">Repo</span>
                <span className="font-normal">press</span>
              </div>
            </Link>
            <p className="text-sm text-muted-foreground max-w-xs">
              Git-native headless CMS. Edit content directly in your GitHub repos with a powerful visual studio.
            </p>
            <a
              href="https://github.com/itsyogesh/repo-press"
              target="_blank"
              rel="noopener noreferrer"
              className="mt-1 w-fit"
            >
              <img
                src="https://img.shields.io/github/stars/itsyogesh/repo-press?style=social"
                alt="GitHub Stars"
                className="h-5"
              />
            </a>
          </div>

          {/* Product column */}
          <div>
            <h3 className="text-sm font-semibold text-foreground mb-4">Product</h3>
            <ul className="flex flex-col gap-3">
              {productLinks.map((link) => (
                <li key={link.href + link.label}>
                  <Link
                    href={link.href}
                    className="text-sm text-muted-foreground hover:text-foreground transition-colors"
                  >
                    {link.label}
                  </Link>
                </li>
              ))}
            </ul>
          </div>

          {/* Resources column */}
          <div>
            <h3 className="text-sm font-semibold text-foreground mb-4">Resources</h3>
            <ul className="flex flex-col gap-3">
              {resourceLinks.map((link) => (
                <li key={link.href + link.label}>
                  {link.external ? (
                    <a
                      href={link.href}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-sm text-muted-foreground hover:text-foreground transition-colors"
                    >
                      {link.label}
                    </a>
                  ) : (
                    <Link
                      href={link.href}
                      className="text-sm text-muted-foreground hover:text-foreground transition-colors"
                    >
                      {link.label}
                    </Link>
                  )}
                </li>
              ))}
            </ul>
          </div>

          {/* Legal column */}
          <div>
            <h3 className="text-sm font-semibold text-foreground mb-4">Legal</h3>
            <ul className="flex flex-col gap-3">
              {legalLinks.map((link) => (
                <li key={link.href}>
                  <Link
                    href={link.href}
                    className="text-sm text-muted-foreground hover:text-foreground transition-colors"
                  >
                    {link.label}
                  </Link>
                </li>
              ))}
            </ul>
          </div>
        </div>
      </div>

      {/* Bottom bar */}
      <div className="border-t border-border/40">
        <div className="container mx-auto px-4 py-6 flex flex-col sm:flex-row items-center justify-between gap-4">
          <div className="flex flex-col sm:flex-row items-center gap-2 text-sm text-muted-foreground">
            <span>© {new Date().getFullYear()} RepoPress. All rights reserved.</span>
            <span className="hidden sm:inline">·</span>
            <span>
              Made with ❤️ by{" "}
              <a
                href="https://twitter.com/itsyogesh18"
                target="_blank"
                rel="noopener noreferrer"
                className="font-medium text-foreground hover:underline"
              >
                itsyogesh
              </a>{" "}
              and{" "}
              <a
                href="https://v0.dev"
                target="_blank"
                rel="noopener noreferrer"
                className="font-medium text-foreground hover:underline"
              >
                v0
              </a>
            </span>
          </div>

          {/* Social icons */}
          <div className="flex items-center gap-4">
            <a
              href="https://twitter.com/itsyogesh18"
              target="_blank"
              rel="noopener noreferrer"
              className="text-muted-foreground hover:text-foreground transition-colors"
            >
              <Twitter className="h-5 w-5" />
              <span className="sr-only">Twitter</span>
            </a>
            <a
              href="https://github.com/itsyogesh/repo-press"
              target="_blank"
              rel="noopener noreferrer"
              className="text-muted-foreground hover:text-foreground transition-colors"
            >
              <Github className="h-5 w-5" />
              <span className="sr-only">GitHub</span>
            </a>
          </div>
        </div>
      </div>
    </footer>
  )
}
