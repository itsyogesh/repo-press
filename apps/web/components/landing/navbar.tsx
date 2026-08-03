"use client"

import { Github, Menu } from "lucide-react"
import Link from "next/link"
import { useEffect, useState } from "react"
import { Logo } from "@/components/brand/logo"
import { Button } from "@/components/ui/button"
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle, SheetTrigger } from "@/components/ui/sheet"
import { cn } from "@/lib/utils"

const navLinks = [
  { href: "/#features", label: "Features", external: false },
  { href: "/#demo", label: "Demo", external: false },
  { href: "https://docs.repopress.org", label: "Docs", external: true },
  { href: "/blog", label: "Blog", external: false },
  { href: "https://github.com/itsyogesh/repo-press", label: "GitHub", external: true },
]

export default function Navbar() {
  const [scrolled, setScrolled] = useState(false)
  const [open, setOpen] = useState(false)

  useEffect(() => {
    const handler = () => setScrolled(window.scrollY > 8)
    window.addEventListener("scroll", handler, { passive: true })
    handler()
    return () => window.removeEventListener("scroll", handler)
  }, [])

  return (
    <nav
      className={cn(
        "sticky top-0 z-50 w-full bg-background/95 backdrop-blur-sm transition-[border-color] duration-200",
        scrolled ? "border-b border-border" : "border-b border-transparent",
      )}
    >
      <div className="mx-auto flex h-14 max-w-[1120px] items-center justify-between px-6">
        <Link href="/" aria-label="RepoPress home">
          <Logo />
        </Link>

        <div className="hidden items-center gap-7 md:flex">
          {navLinks.map((link) =>
            link.external ? (
              <a
                key={link.href}
                href={link.href}
                target="_blank"
                rel="noopener noreferrer"
                className="text-sm font-medium tracking-[-0.01em] text-muted-foreground transition-colors hover:text-foreground"
              >
                {link.label}
              </a>
            ) : (
              <Link
                key={link.href}
                href={link.href}
                className="text-sm font-medium tracking-[-0.01em] text-muted-foreground transition-colors hover:text-foreground"
              >
                {link.label}
              </Link>
            ),
          )}
        </div>

        <div className="hidden items-center md:flex">
          <Link href="/login">
            <Button size="sm">
              <Github className="mr-2 h-4 w-4" />
              Sign in with GitHub
            </Button>
          </Link>
        </div>

        <div className="flex md:hidden">
          <Sheet open={open} onOpenChange={setOpen}>
            <SheetTrigger asChild>
              <Button variant="ghost" size="icon" className="size-10 text-foreground">
                <Menu className="h-5 w-5" />
                <span className="sr-only">Toggle menu</span>
              </Button>
            </SheetTrigger>
            <SheetContent
              side="right"
              className="w-[min(22rem,calc(100vw-1rem))] border-l border-border bg-background p-0 shadow-none"
            >
              <SheetHeader className="sr-only">
                <SheetTitle>Navigation menu</SheetTitle>
                <SheetDescription>Browse RepoPress pages and sign in options.</SheetDescription>
              </SheetHeader>
              <div className="flex h-full flex-col p-6">
                <Logo className="mb-8" />
                <div className="flex flex-1 flex-col gap-1">
                  {navLinks.map((link) =>
                    link.external ? (
                      <a
                        key={link.href}
                        href={link.href}
                        target="_blank"
                        rel="noopener noreferrer"
                        onClick={() => setOpen(false)}
                        className="rounded-md px-3 py-2.5 text-base font-medium text-muted-foreground transition-colors hover:bg-muted/50 hover:text-foreground"
                      >
                        {link.label}
                      </a>
                    ) : (
                      <Link
                        key={link.href}
                        href={link.href}
                        onClick={() => setOpen(false)}
                        className="rounded-md px-3 py-2.5 text-base font-medium text-muted-foreground transition-colors hover:bg-muted/50 hover:text-foreground"
                      >
                        {link.label}
                      </Link>
                    ),
                  )}
                </div>
                <Link href="/login" onClick={() => setOpen(false)} className="mt-6">
                  <Button className="w-full">
                    <Github className="mr-2 h-4 w-4" />
                    Sign in with GitHub
                  </Button>
                </Link>
              </div>
            </SheetContent>
          </Sheet>
        </div>
      </div>
    </nav>
  )
}
