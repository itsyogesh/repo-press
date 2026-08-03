import type { Metadata } from "next"
import Footer from "@/components/landing/footer"
import Navbar from "@/components/landing/navbar"
import { DocsSidebar } from "./docs-sidebar"

export const metadata: Metadata = {
  title: {
    template: "%s - RepoPress Docs",
    default: "Documentation - RepoPress",
  },
  description: "Learn how to use RepoPress, the Git-native headless CMS.",
}

export default function DocsLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-screen flex-col bg-background">
      <Navbar />
      <div className="container mx-auto flex-1 px-4">
        <div className="flex gap-8 py-8">
          <DocsSidebar />
          <main className="min-w-0 max-w-3xl flex-1">{children}</main>
        </div>
      </div>
      <Footer />
    </div>
  )
}
