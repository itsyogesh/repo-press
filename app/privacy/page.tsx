import type { Metadata } from "next"
import Footer from "@/components/landing/footer"
import Navbar from "@/components/landing/navbar"

export const metadata: Metadata = {
  title: "Privacy Policy - RepoPress",
  description: "Privacy policy for RepoPress - the visual editor for content in GitHub repositories.",
}

export default function PrivacyPage() {
  return (
    <div className="flex min-h-screen flex-col bg-background">
      <Navbar />
      <main className="flex-1">
        <div className="container mx-auto px-4 py-16 md:py-24">
          <div className="max-w-3xl mx-auto">
            <h1 className="text-3xl md:text-4xl font-semibold tracking-tight text-foreground mb-8">Privacy Policy</h1>

            <p className="text-muted-foreground leading-relaxed mb-8">
              Your privacy matters. This policy explains what information RepoPress collects, how we use it, and the
              choices you have. We believe in transparency and keeping your data where it belongs-in your Git
              repositories.
            </p>

            {/* Information We Collect */}
            <h2 className="text-xl font-semibold text-foreground mt-8 mb-4">Information We Collect</h2>
            <p className="text-muted-foreground leading-relaxed mb-4">
              When you sign in to RepoPress via GitHub OAuth, we receive and store the following information from your
              GitHub account:
            </p>
            <ul className="list-disc list-inside space-y-2 text-muted-foreground mb-4">
              <li>
                <strong className="text-foreground">GitHub profile information:</strong> Your username, display name,
                email address, and avatar URL
              </li>
              <li>
                <strong className="text-foreground">Repository access:</strong> Metadata about the repositories you
                choose to connect to RepoPress (name, owner, visibility)
              </li>
              <li>
                <strong className="text-foreground">OAuth tokens:</strong> Access tokens required to interact with the
                GitHub API on your behalf
              </li>
            </ul>
            <p className="text-muted-foreground leading-relaxed">
              We do <strong className="text-foreground">not</strong> store your repository content. Your Markdown, MDX,
              and other files remain in your GitHub repository at all times. RepoPress reads and writes content through
              the GitHub API directly.
            </p>

            {/* How We Use Your Information */}
            <h2 className="text-xl font-semibold text-foreground mt-8 mb-4">How We Use Your Information</h2>
            <p className="text-muted-foreground leading-relaxed mb-4">We use the information we collect to:</p>
            <ul className="list-disc list-inside space-y-2 text-muted-foreground">
              <li>Authenticate you and maintain your session</li>
              <li>Read and write content to your connected GitHub repositories on your behalf</li>
              <li>Display your repositories, branches, and files within the RepoPress Studio interface</li>
              <li>Store operational state such as connected repositories and editor preferences</li>
            </ul>

            {/* Data Storage */}
            <h2 className="text-xl font-semibold text-foreground mt-8 mb-4">Data Storage</h2>
            <p className="text-muted-foreground leading-relaxed mb-4">RepoPress uses a two-tier approach to data:</p>
            <ul className="list-disc list-inside space-y-2 text-muted-foreground">
              <li>
                <strong className="text-foreground">Your content:</strong> Stays in your GitHub repository. We never
                copy or store your content in our own databases.
              </li>
              <li>
                <strong className="text-foreground">Operational state:</strong> Session data, connected repository
                metadata, and user preferences are stored in{" "}
                <a
                  href="https://convex.dev"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="underline hover:text-foreground transition-colors"
                >
                  Convex
                </a>
                , our backend database provider.
              </li>
            </ul>

            {/* Third-Party Services */}
            <h2 className="text-xl font-semibold text-foreground mt-8 mb-4">Third-Party Services</h2>
            <p className="text-muted-foreground leading-relaxed mb-4">
              RepoPress integrates with the following third-party services:
            </p>
            <ul className="list-disc list-inside space-y-2 text-muted-foreground">
              <li>
                <strong className="text-foreground">GitHub API:</strong> For authentication and repository access.
                Subject to{" "}
                <a
                  href="https://docs.github.com/en/site-policy/privacy-policies/github-general-privacy-statement"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="underline hover:text-foreground transition-colors"
                >
                  GitHub&apos;s Privacy Statement
                </a>
                .
              </li>
              <li>
                <strong className="text-foreground">Convex:</strong> For backend data storage and real-time sync.
                Subject to{" "}
                <a
                  href="https://www.convex.dev/legal/privacy"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="underline hover:text-foreground transition-colors"
                >
                  Convex&apos;s Privacy Policy
                </a>
                .
              </li>
              <li>
                <strong className="text-foreground">Vercel:</strong> For application hosting and deployment. Subject to{" "}
                <a
                  href="https://vercel.com/legal/privacy-policy"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="underline hover:text-foreground transition-colors"
                >
                  Vercel&apos;s Privacy Policy
                </a>
                .
              </li>
            </ul>

            {/* Cookies */}
            <h2 className="text-xl font-semibold text-foreground mt-8 mb-4">Cookies</h2>
            <p className="text-muted-foreground leading-relaxed">
              RepoPress uses cookies strictly for session management. We use a session token cookie to keep you signed
              in and identify your authenticated session. We do not use cookies for advertising, tracking, or analytics
              purposes.
            </p>

            {/* Your Rights */}
            <h2 className="text-xl font-semibold text-foreground mt-8 mb-4">Your Rights</h2>
            <p className="text-muted-foreground leading-relaxed mb-4">You have the right to:</p>
            <ul className="list-disc list-inside space-y-2 text-muted-foreground">
              <li>
                <strong className="text-foreground">Access your data:</strong> Request a copy of the personal
                information we hold about you
              </li>
              <li>
                <strong className="text-foreground">Delete your account:</strong> Request deletion of your account and
                associated data at any time
              </li>
              <li>
                <strong className="text-foreground">Revoke access:</strong> Disconnect RepoPress from your GitHub
                account via your{" "}
                <a
                  href="https://github.com/settings/applications"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="underline hover:text-foreground transition-colors"
                >
                  GitHub application settings
                </a>
              </li>
              <li>
                <strong className="text-foreground">Data portability:</strong> Your content is always in your Git
                repository-there&apos;s nothing to export
              </li>
            </ul>

            {/* Contact */}
            <h2 className="text-xl font-semibold text-foreground mt-8 mb-4">Contact</h2>
            <p className="text-muted-foreground leading-relaxed">
              If you have any questions about this privacy policy or how we handle your data, please open an issue on
              our{" "}
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
                This privacy policy was last updated on June 28, 2025. This is a template and does not constitute legal
                advice. Please consult a legal professional for your specific needs.
              </p>
            </div>
          </div>
        </div>
      </main>
      <Footer />
    </div>
  )
}
