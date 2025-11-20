import Navbar from "@/components/landing/navbar"
import Hero from "@/components/landing/hero"
import FeatureGrid from "@/components/landing/feature-grid"
import CTA from "@/components/landing/cta"
import Footer from "@/components/landing/footer"

export default function LandingPage() {
  return (
    <div className="flex min-h-screen flex-col bg-background bg-grid-small-black/[0.2] dark:bg-grid-small-white/[0.2]">
      <Navbar />
      <main className="flex-1">
        <Hero />
        <FeatureGrid />
        <CTA />
      </main>
      <Footer />
    </div>
  )
}
