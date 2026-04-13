"use client"

import { Github, Menu } from "lucide-react"
import Link from "next/link"
import { useState } from "react"
import { Button } from "@/components/ui/button"
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle, SheetTrigger } from "@/components/ui/sheet"

const navLinks = [
  { href: "/#features", label: "Features", external: false },
  { href: "/#demo", label: "Demo", external: false },
  { href: "/docs", label: "Docs", external: false },
  { href: "/blog", label: "Blog", external: false },
  {
    href: "https://github.com/itsyogesh/repo-press",
    label: "GitHub",
    external: true,
  },
]

export default function Navbar() {
  const [open, setOpen] = useState(false)

  return (
    <nav className="sticky top-0 z-50 w-full px-4 pt-4">
      <div className="glass-navbar mx-auto flex h-16 max-w-6xl items-center justify-between rounded-2xl px-4 sm:px-6">
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
            <Button size="sm" className="h-10 rounded-xl px-4">
              <Github className="mr-2 h-4 w-4" />
              Sign in with GitHub
            </Button>
          </Link>
        </div>

        <div className="flex md:hidden">
          <Sheet open={open} onOpenChange={setOpen}>
            <SheetTrigger asChild>
              <Button variant="ghost" size="icon" className="size-10 rounded-xl text-foreground">
                <Menu className="h-5 w-5" />
                <span className="sr-only">Toggle menu</span>
              </Button>
            </SheetTrigger>
            <SheetContent
              side="right"
              className="w-[min(24rem,calc(100vw-1rem))] border-0 bg-transparent p-2 shadow-none"
            >
              <SheetHeader className="sr-only">
                <SheetTitle>Navigation menu</SheetTitle>
                <SheetDescription>Browse RepoPress pages and sign in options.</SheetDescription>
              </SheetHeader>
              <div className="glass-panel flex h-full flex-col rounded-[1.5rem] p-6">
                <div className="mb-8 flex items-center gap-3">
                  <span className="inline-flex size-10 items-center justify-center rounded-xl border border-border/70 bg-background/70 font-mono text-[0.72rem] font-semibold uppercase tracking-[0.24em] text-foreground">
                    RP
                  </span>
                  <div className="flex flex-col">
                    <span className="text-sm font-semibold tracking-[-0.03em] text-foreground">RepoPress</span>
                    <span className="font-mono text-[0.65rem] uppercase tracking-[0.22em] text-muted-foreground">
                      Git-native studio
                    </span>
                  </div>
                </div>

                <div className="flex flex-1 flex-col gap-3">
                  {navLinks.map((link) =>
                    link.external ? (
                      <a
                        key={link.href}
                        href={link.href}
                        target="_blank"
                        rel="noopener noreferrer"
                        onClick={() => setOpen(false)}
                        className="rounded-xl border border-transparent px-3 py-2 text-base font-medium tracking-[-0.01em] text-muted-foreground transition-colors hover:border-border/70 hover:bg-background/50 hover:text-foreground"
                      >
                        {link.label}
                      </a>
                    ) : (
                      <Link
                        key={link.href}
                        href={link.href}
                        onClick={() => setOpen(false)}
                        className="rounded-xl border border-transparent px-3 py-2 text-base font-medium tracking-[-0.01em] text-muted-foreground transition-colors hover:border-border/70 hover:bg-background/50 hover:text-foreground"
                      >
                        {link.label}
                      </Link>
                    ),
                  )}
                </div>

                <Link href="/login" onClick={() => setOpen(false)} className="mt-6">
                  <Button className="h-12 w-full rounded-xl">
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
