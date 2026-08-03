import { withSentryConfig } from "@sentry/nextjs"
import path from "node:path"

const monorepoRoot = path.resolve(import.meta.dirname, "../..")

function normalizeConfiguredOrigin(value, environment) {
	if (!value) return null
	try {
		const trimmed = value.trim()
		const url = new URL(trimmed)
		const normalizedInput = trimmed.endsWith("/") ? trimmed.slice(0, -1) : trimmed
		if (
			(url.protocol !== "https:" && url.protocol !== "http:") ||
			(environment === "production" && url.protocol !== "https:") ||
			url.origin === "null" ||
			url.username ||
			url.password ||
			url.search ||
			url.hash ||
			(url.pathname !== "/" && url.pathname !== "") ||
			normalizedInput !== url.origin
		) {
			return null
		}
		return url.origin
	} catch {
		return null
	}
}

export function createPreviewSandboxHeaders(studioOriginValue, environment = process.env.NODE_ENV) {
	const studioOrigin = normalizeConfiguredOrigin(studioOriginValue, environment)
	const frameAncestor = studioOrigin ?? (environment === "production" ? "'none'" : "'self'")
	const headers = [
		{ key: "Cache-Control", value: "no-store" },
		{
			key: "Content-Security-Policy",
			value: [
				"default-src 'none'",
				// Repository code executes only in a one-shot blob worker created by this
				// opaque route. Worker evaluation requires unsafe-eval; connect-src remains none.
				"script-src 'self' 'unsafe-inline' 'unsafe-eval'",
				"script-src-attr 'none'",
				"style-src 'self' 'unsafe-inline'",
				// Image bytes arrive only through the authenticated parent MessagePort.
				"img-src blob:",
				"font-src 'none'",
				"media-src 'none'",
				"connect-src 'none'",
				// The opaque sandbox can launch only RepoPress-owned, self-contained blob workers.
				"worker-src blob:",
				"child-src 'none'",
				"frame-src 'none'",
				"object-src 'none'",
				"base-uri 'none'",
				"form-action 'none'",
				`frame-ancestors ${frameAncestor}`,
			].join("; "),
		},
		{ key: "Referrer-Policy", value: "no-referrer" },
		{ key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=(), payment=(), usb=()" },
		{ key: "X-Content-Type-Options", value: "nosniff" },
		{ key: "X-DNS-Prefetch-Control", value: "off" },
		{ key: "X-Robots-Tag", value: "noindex, nofollow, noarchive" },
		{ key: "Vary", value: "Origin" },
	]
	if (studioOrigin) headers.push({ key: "Access-Control-Allow-Origin", value: studioOrigin })
	return headers
}

/** @type {import('next').NextConfig} */
export const nextConfig = {
  // Dependencies and the sole lockfile live at the npm workspace root.
  outputFileTracingRoot: monorepoRoot,
  turbopack: {
    root: monorepoRoot,
  },
  async redirects() {
    return [
      {
        source: "/docs",
        destination: "https://docs.repopress.org",
        permanent: true,
      },
      {
        source: "/docs/:path*",
        destination: "https://docs.repopress.org/:path*",
        permanent: true,
      },
    ]
  },
  async headers() {
    return [
      {
        source: "/(.*)",
        headers: [
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
			{
				source: "/((?!preview/sandbox$).*)",
				headers: [
					{
						key: "X-Frame-Options",
						value: "DENY",
					},
				],
			},
			{
				source: "/preview/sandbox",
				headers: createPreviewSandboxHeaders(process.env.NEXT_PUBLIC_APP_URL, process.env.NODE_ENV),
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
