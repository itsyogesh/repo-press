import type { Metadata } from "next"
import Footer from "@/components/landing/footer"
import Navbar from "@/components/landing/navbar"

export const metadata: Metadata = {
  title: "Terms of Service - RepoPress",
  description: "Terms of service for RepoPress - the visual editor for content in GitHub repositories.",
}

export default function TermsPage() {
  return (
    <div className="flex min-h-screen flex-col bg-background">
      <Navbar />
      <main className="flex-1">
        <div className="container mx-auto px-4 py-16 md:py-24">
          <div className="max-w-3xl mx-auto">
            <h1 className="rp-display mb-8 text-3xl md:text-4xl">Terms of Service</h1>

            <p className="text-muted-foreground leading-relaxed mb-8">
              Welcome to RepoPress. By using our service, you agree to these terms. Please read them carefully.
            </p>

            {/* Acceptance of Terms */}
            <h2 className="rp-display text-xl mt-8 mb-4">Acceptance of Terms</h2>
            <p className="text-muted-foreground leading-relaxed">
              By accessing or using RepoPress, you agree to be bound by these Terms of Service. If you do not agree to
              these terms, you may not use the service. We may update these terms from time to time, and your continued
              use of RepoPress after any changes constitutes acceptance of the updated terms.
            </p>

            {/* Description of Service */}
            <h2 className="rp-display text-xl mt-8 mb-4">Description of Service</h2>
            <p className="text-muted-foreground leading-relaxed">
              RepoPress is a visual editor for content stored in your GitHub repositories. The service lets you create
              and edit Markdown and MDX files in a Studio interface, with all changes committed directly to your
              repository via the GitHub API.
            </p>

            {/* GitHub Integration */}
            <h2 className="rp-display text-xl mt-8 mb-4">GitHub Integration</h2>
            <p className="text-muted-foreground leading-relaxed mb-4">
              RepoPress requires you to authenticate with your GitHub account and grant access to repositories you
              choose to connect. By using RepoPress, you acknowledge that:
            </p>
            <ul className="list-disc list-inside space-y-2 text-muted-foreground">
              <li>RepoPress will read and write files in your connected repositories on your behalf</li>
              <li>All content changes are made as Git commits attributed to your GitHub account</li>
              <li>You are responsible for the repositories and content you connect to RepoPress</li>
              <li>
                Your use of GitHub through RepoPress is also subject to{" "}
                <a
                  href="https://docs.github.com/en/site-policy/github-terms/github-terms-of-service"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="underline hover:text-foreground transition-colors"
                >
                  GitHub&apos;s Terms of Service
                </a>
              </li>
            </ul>

            {/* User Content */}
            <h2 className="rp-display text-xl mt-8 mb-4">User Content</h2>
            <p className="text-muted-foreground leading-relaxed mb-4">
              Your content remains yours. RepoPress does not claim any ownership over the content you create, edit, or
              manage through our service.
            </p>
            <ul className="list-disc list-inside space-y-2 text-muted-foreground">
              <li>All content stays in your GitHub repository-we never copy or store it in our databases</li>
              <li>You retain all rights to your content, including intellectual property rights</li>
              <li>You are solely responsible for the content you publish through RepoPress</li>
              <li>If you stop using RepoPress, your content remains exactly where it is in your repository</li>
            </ul>

            {/* Acceptable Use */}
            <h2 className="rp-display text-xl mt-8 mb-4">Acceptable Use</h2>
            <p className="text-muted-foreground leading-relaxed mb-4">You agree not to use RepoPress to:</p>
            <ul className="list-disc list-inside space-y-2 text-muted-foreground">
              <li>Violate any applicable laws, regulations, or third-party rights</li>
              <li>Access repositories or data that you do not have authorization to access</li>
              <li>Interfere with or disrupt the service, servers, or networks connected to the service</li>
              <li>Attempt to gain unauthorized access to any part of the service or its related systems</li>
              <li>Use the service to distribute malware, spam, or other harmful content</li>
              <li>Abuse the GitHub API through excessive or automated requests beyond normal editorial use</li>
            </ul>

            {/* Intellectual Property */}
            <h2 className="rp-display text-xl mt-8 mb-4">Intellectual Property</h2>
            <p className="text-muted-foreground leading-relaxed mb-4">
              RepoPress is open-source software released under the{" "}
              <a
                href="https://github.com/itsyogesh/repo-press/blob/main/LICENSE"
                target="_blank"
                rel="noopener noreferrer"
                className="underline hover:text-foreground transition-colors"
              >
                MIT License
              </a>
              . This means:
            </p>
            <ul className="list-disc list-inside space-y-2 text-muted-foreground">
              <li>You are free to use, modify, and distribute the source code under the terms of the MIT License</li>
              <li>The RepoPress name, logo, and branding are trademarks and may not be used without permission</li>
              <li>Third-party libraries and services used by RepoPress are subject to their own licenses</li>
            </ul>

            {/* Limitation of Liability */}
            <h2 className="rp-display text-xl mt-8 mb-4">Limitation of Liability</h2>
            <p className="text-muted-foreground leading-relaxed mb-4">
              RepoPress is provided &ldquo;as is&rdquo; and &ldquo;as available&rdquo; without warranties of any kind,
              whether express or implied. To the fullest extent permitted by law:
            </p>
            <ul className="list-disc list-inside space-y-2 text-muted-foreground">
              <li>We do not warrant that the service will be uninterrupted, secure, or error-free</li>
              <li>We are not liable for any indirect, incidental, special, or consequential damages</li>
              <li>
                We are not responsible for any loss of data in your GitHub repositories resulting from the use of
                RepoPress
              </li>
              <li>
                Our total liability for any claims related to the service shall not exceed the amount you paid for the
                service (if any)
              </li>
            </ul>

            {/* Changes to Terms */}
            <h2 className="rp-display text-xl mt-8 mb-4">Changes to Terms</h2>
            <p className="text-muted-foreground leading-relaxed">
              We reserve the right to modify these terms at any time. We will notify users of material changes by
              updating the date at the bottom of this page and, where possible, providing notice through the service.
              Your continued use of RepoPress after changes are posted constitutes acceptance of the updated terms.
            </p>

            {/* Contact */}
            <h2 className="rp-display text-xl mt-8 mb-4">Contact</h2>
            <p className="text-muted-foreground leading-relaxed">
              If you have any questions about these terms, please open an issue on our{" "}
              <a
                href="https://github.com/itsyogesh/repo-press"
                target="_blank"
                rel="noopener noreferrer"
                className="underline hover:text-foreground transition-colors"
              >
                GitHub repository
              </a>{" "}
              or reach out to{" "}
              <a
                href="https://twitter.com/itsyogesh18"
                target="_blank"
                rel="noopener noreferrer"
                className="underline hover:text-foreground transition-colors"
              >
                @itsyogesh
              </a>{" "}
              on Twitter.
            </p>

            {/* Disclaimer */}
            <div className="mt-12 rounded-lg border border-border/60 bg-muted/50 p-4">
              <p className="text-sm text-muted-foreground">
                These terms of service were last updated on June 28, 2025. This is a template and does not constitute
                legal advice. Please consult a legal professional for your specific needs.
              </p>
            </div>
          </div>
        </div>
      </main>
      <Footer />
    </div>
  )
}
