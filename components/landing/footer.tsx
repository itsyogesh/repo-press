import Link from "next/link"
import { Box, Github, Twitter } from "lucide-react"

export default function Footer() {
  return (
    <footer className="border-t border-border/40 bg-background">
      <div className="container mx-auto px-4 py-8">
        <div className="flex flex-col md:flex-row justify-between items-center gap-6">
          {/* Logo */}
          <div className="flex items-center gap-2 text-xl">
            <Box className="h-6 w-6" />
            <div className="flex items-baseline">
              <span className="font-bold">Repo</span>
              <span className="font-normal">press</span>
            </div>
          </div>

          {/* Copyright / Made with */}
          <div className="text-sm text-muted-foreground text-center md:text-left order-3 md:order-2">
            Made with ❤️ by{" "}
            <Link
              href="https://twitter.com/itsyogesh18"
              target="_blank"
              className="font-medium text-foreground hover:underline"
            >
              itsyogesh
            </Link>{" "}
            and{" "}
            <Link href="https://v0.dev" target="_blank" className="font-medium text-foreground hover:underline">
              v0
            </Link>
          </div>

          {/* Social Icons */}
          <div className="flex items-center gap-6 order-2 md:order-3">
            <Link
              href="https://twitter.com/itsyogesh18"
              target="_blank"
              className="text-muted-foreground hover:text-foreground transition-colors"
            >
              <Twitter className="h-5 w-5" />
              <span className="sr-only">Twitter</span>
            </Link>
            <Link
              href="https://github.com/itsyogesh/repo-press"
              target="_blank"
              className="text-muted-foreground hover:text-foreground transition-colors"
            >
              <Github className="h-5 w-5" />
              <span className="sr-only">GitHub</span>
            </Link>
          </div>
        </div>
      </div>
    </footer>
  )
}
