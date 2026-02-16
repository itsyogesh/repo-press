import CTA from "@/components/landing/cta"
import FeatureGrid from "@/components/landing/feature-grid"
import Footer from "@/components/landing/footer"
import Hero from "@/components/landing/hero"
import Navbar from "@/components/landing/navbar"

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
