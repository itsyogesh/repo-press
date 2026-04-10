import Comparison from "@/components/landing/comparison"
import CTA from "@/components/landing/cta"
import FAQ from "@/components/landing/faq"
import FeatureGrid from "@/components/landing/feature-grid"
import Footer from "@/components/landing/footer"
import Hero from "@/components/landing/hero"
import HowItWorks from "@/components/landing/how-it-works"
import Navbar from "@/components/landing/navbar"
import Pricing from "@/components/landing/pricing"
import { VideoPreview } from "@/components/landing/video-preview"

export default function LandingPage() {
  return (
    <div className="flex min-h-screen flex-col bg-background">
      <Navbar />
      <main className="flex-1">
        <Hero />
        <VideoPreview />
        <HowItWorks />
        <FeatureGrid />
        <Comparison />
        <FAQ />
        <Pricing />
        <CTA />
      </main>
      <Footer />
    </div>
  )
}
