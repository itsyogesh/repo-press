"use client"

import { Box, Github, Menu } from "lucide-react"
import Link from "next/link"
import { useState } from "react"
import { Button } from "@/components/ui/button"
import { Sheet, SheetContent, SheetTrigger } from "@/components/ui/sheet"

const navLinks = [
  { href: "#features", label: "Features", external: false },
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
    <nav className="sticky top-0 z-50 w-full border-b border-border/40 bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60">
      <div className="container mx-auto px-4 flex h-16 items-center justify-between">
        {/* Logo */}
        <Link href="/" className="flex items-center gap-2 text-xl">
          <Box className="h-6 w-6" />
          <div className="flex items-baseline">
            <span className="font-bold">Repo</span>
            <span className="font-normal">press</span>
          </div>
        </Link>

        {/* Desktop nav links */}
        <div className="hidden md:flex items-center gap-6">
          {navLinks.map((link) =>
            link.external ? (
              <a
                key={link.href}
                href={link.href}
                target="_blank"
                rel="noopener noreferrer"
                className="text-sm font-medium text-muted-foreground hover:text-foreground transition-colors"
              >
                {link.label}
              </a>
            ) : (
              <Link
                key={link.href}
                href={link.href}
                className="text-sm font-medium text-muted-foreground hover:text-foreground transition-colors"
              >
                {link.label}
              </Link>
            ),
          )}
        </div>

        {/* Desktop CTA button */}
        <div className="hidden md:flex items-center">
          <Link href="/dashboard">
            <Button size="sm" className="rounded-full px-6">
              <Github className="mr-2 h-4 w-4" />
              Login with GitHub
            </Button>
          </Link>
        </div>

        {/* Mobile hamburger menu */}
        <div className="flex md:hidden">
          <Sheet open={open} onOpenChange={setOpen}>
            <SheetTrigger asChild>
              <Button variant="ghost" size="icon" className="text-foreground">
                <Menu className="h-5 w-5" />
                <span className="sr-only">Toggle menu</span>
              </Button>
            </SheetTrigger>
            <SheetContent side="right" className="w-72 bg-background p-6">
              <div className="flex flex-col gap-6 mt-8">
                {navLinks.map((link) =>
                  link.external ? (
                    <a
                      key={link.href}
                      href={link.href}
                      target="_blank"
                      rel="noopener noreferrer"
                      onClick={() => setOpen(false)}
                      className="text-base font-medium text-muted-foreground hover:text-foreground transition-colors"
                    >
                      {link.label}
                    </a>
                  ) : (
                    <Link
                      key={link.href}
                      href={link.href}
                      onClick={() => setOpen(false)}
                      className="text-base font-medium text-muted-foreground hover:text-foreground transition-colors"
                    >
                      {link.label}
                    </Link>
                  ),
                )}
                <Link href="/dashboard" onClick={() => setOpen(false)}>
                  <Button className="w-full rounded-full">
                    <Github className="mr-2 h-4 w-4" />
                    Login with GitHub
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
