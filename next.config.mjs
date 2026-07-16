import { withSentryConfig } from "@sentry/nextjs"

function normalizeConfiguredOrigin(value) {
	if (!value) return null
	try {
		const url = new URL(value)
		return url.origin === "null" || url.username || url.password ? null : url.origin
	} catch {
		return null
	}
}

export function createPreviewSandboxHeaders(studioOriginValue) {
	const studioOrigin = normalizeConfiguredOrigin(studioOriginValue)
	const frameAncestor = studioOrigin ?? "'none'"
	const headers = [
		{ key: "Cache-Control", value: "no-store" },
		{
			key: "Content-Security-Policy",
			value: [
				"default-src 'none'",
				"script-src 'self' 'unsafe-inline'",
				"script-src-attr 'none'",
				"style-src 'self' 'unsafe-inline'",
				"img-src 'none'",
				"font-src 'none'",
				"media-src 'none'",
				"connect-src 'none'",
				"worker-src 'none'",
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
		{ key: "X-Robots-Tag", value: "noindex, nofollow, noarchive" },
		{ key: "Vary", value: "Origin" },
	]
	if (studioOrigin) headers.push({ key: "Access-Control-Allow-Origin", value: studioOrigin })
	return headers
}

/** @type {import('next').NextConfig} */
export const nextConfig = {
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
				headers: createPreviewSandboxHeaders(process.env.NEXT_PUBLIC_APP_URL),
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
