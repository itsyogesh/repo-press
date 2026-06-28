import { withSentryConfig } from "@sentry/nextjs"

/** @type {import('next').NextConfig} */
const nextConfig = {
  // Pin the workspace root to this project — a stray pnpm-lock.yaml in the
  // home dir was otherwise inferred as the Turbopack root.
  turbopack: {
    root: import.meta.dirname,
  },
  async headers() {
    return [
      {
        source: "/(.*)",
        headers: [
          {
            key: "X-Frame-Options",
            value: "DENY",
          },
          {
            key: "X-Content-Type-Options",
            value: "nosniff",
          },
          {
            key: "Referrer-Policy",
            value: "strict-origin-when-cross-origin",
          },
          {
            key: "Permissions-Policy",
            value: "camera=(), microphone=(), geolocation=()",
          },
          {
            key: "X-DNS-Prefetch-Control",
            value: "on",
          },
          {
            key: "Strict-Transport-Security",
            value: "max-age=63072000; includeSubDomains; preload",
          },
        ],
      },
    ]
  },
}

export default withSentryConfig(nextConfig, {
	org: process.env.SENTRY_ORG,
	project: process.env.SENTRY_PROJECT,
	silent: !process.env.CI,
	widenClientFileUpload: true,
	disableLogger: true,
	automaticVercelMonitors: true,
})
