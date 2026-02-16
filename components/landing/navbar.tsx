import { Box, Github } from "lucide-react"
import Link from "next/link"
import { Button } from "@/components/ui/button"

export default function Navbar() {
  return (
    <nav className="sticky top-0 z-50 w-full border-b border-border/40 bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60">
      <div className="container mx-auto px-4 flex h-16 items-center justify-between">
        <div className="flex items-center gap-2 text-xl">
          <Box className="h-6 w-6" />
          <div className="flex items-baseline">
            <span className="font-bold">Repo</span>
            <span className="font-normal">press</span>
          </div>
        </div>
        <div className="flex items-center gap-4">
          <Link href="/dashboard">
            <Button size="sm" className="rounded-full px-6">
              <Github className="mr-2 h-4 w-4" />
              Login with GitHub
            </Button>
          </Link>
        </div>
      </div>
    </nav>
  )
}
