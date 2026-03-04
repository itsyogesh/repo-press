/**
 * Fix #9: Product-specific fallback data extracted from PreviewRuntime.
 *
 * This data provides fallback values for domain-registrar documentation
 * content that references DOCS_SETUP_MEDIA, FIXIE_IPS, and NAMECHEAP_URLS.
 * These should ideally be provided via the adapter system, but are kept here
 * as defaults for backward compatibility.
 */

const DOCS_BLOB_BASE = "https://7azoq5njibf6vkft.public.blob.vercel-storage.com"

export const FALLBACK_DOCS_SETUP_MEDIA: Record<string, any> = {
  cloudflare: {
    videoUrl: "https://youtu.be/WwCFLfigqpg?si=T90pqRb-zkW4fMuz",
    images: {
      "step-2-api-tokens-nav": `${DOCS_BLOB_BASE}/docs/setup/cloudflare/step-2-api-tokens-nav.webp`,
      "step-2-create-custom-token": `${DOCS_BLOB_BASE}/docs/setup/cloudflare/step-2-create-custom-token.webp`,
      "step-2-create-test-custom-token": `${DOCS_BLOB_BASE}/docs/setup/cloudflare/step-2-create-test-custom-token.webp`,
      "step-2-token-display": `${DOCS_BLOB_BASE}/docs/setup/cloudflare/step-2-token-display.webp`,
      "step-2-token-permissions": `${DOCS_BLOB_BASE}/docs/setup/cloudflare/step-2-token-permissions.webp`,
      "step-3-integration-form": `${DOCS_BLOB_BASE}/docs/setup/cloudflare/step-3-integration-form.webp`,
    },
  },
  gandi: {
    images: {
      "step-1-create-token": `${DOCS_BLOB_BASE}/docs/setup/gandi/step-1-create-token.webp`,
      "step-1-pat-section": `${DOCS_BLOB_BASE}/docs/setup/gandi/step-1-pat-section.webp`,
      "step-1-user-settings": `${DOCS_BLOB_BASE}/docs/setup/gandi/step-1-user-settings.webp`,
      "step-2-token-form": `${DOCS_BLOB_BASE}/docs/setup/gandi/step-2-token-form.webp`,
      "step-3-permissions": `${DOCS_BLOB_BASE}/docs/setup/gandi/step-3-permissions.webp`,
      "step-4-create-token": `${DOCS_BLOB_BASE}/docs/setup/gandi/step-4-create-token.webp`,
      "step-4-token-display": `${DOCS_BLOB_BASE}/docs/setup/gandi/step-4-token-display.webp`,
      "step-5-integration-form": `${DOCS_BLOB_BASE}/docs/setup/gandi/step-5-integration-form.webp`,
    },
  },
  godaddy: {
    videoUrl: "https://youtu.be/3WCzfVL-bRk?si=ncMNDQSc7RiedP1d",
    images: {
      "step-2-create-api-key": `${DOCS_BLOB_BASE}/docs/setup/godaddy/step-2-create-api-key.webp`,
      "step-3-environment-selection": `${DOCS_BLOB_BASE}/docs/setup/godaddy/step-3-environment-selection.webp`,
      "step-4-api-key-secret": `${DOCS_BLOB_BASE}/docs/setup/godaddy/step-4-api-key-secret.webp`,
      "step-6-integration-form": `${DOCS_BLOB_BASE}/docs/setup/godaddy/step-6-integration-form.webp`,
    },
  },
  namecheap: {
    videoUrl: "https://youtu.be/snbECrsUdp4?si=pAxyo0mEzTYBxmQR",
    images: {
      "step-1-api-access-nav": `${DOCS_BLOB_BASE}/docs/setup/namecheap/step-1-api-access-nav.webp`,
      "step-3-whitelist-ips": `${DOCS_BLOB_BASE}/docs/setup/namecheap/step-3-whitelist-ips.webp`,
      "step-5-integration-form": `${DOCS_BLOB_BASE}/docs/setup/namecheap/step-5-integration-form.webp`,
    },
  },
  namecom: {
    images: {
      "step-1-generate-token": `${DOCS_BLOB_BASE}/docs/setup/namecom/step-1-generate-token.webp`,
      "step-2-username-token": `${DOCS_BLOB_BASE}/docs/setup/namecom/step-2-username-token.webp`,
      "step-3-integration-form": `${DOCS_BLOB_BASE}/docs/setup/namecom/step-3-integration-form.webp`,
    },
  },
  porkbun: {
    videoUrl: "https://youtu.be/jLVBwxk4V6w?si=eZPfJwhKTiqwyTQI",
    images: {
      "step-1-api-access-nav": `${DOCS_BLOB_BASE}/docs/setup/porkbun/step-1-api-access-nav.webp`,
      "step-1-create-api-key": `${DOCS_BLOB_BASE}/docs/setup/porkbun/step-1-create-api-key.webp`,
      "step-1-api-credentials": `${DOCS_BLOB_BASE}/docs/setup/porkbun/step-1-api-credentials.webp`,
      "step-2-integration-form": `${DOCS_BLOB_BASE}/docs/setup/porkbun/step-2-integration-form.webp`,
    },
  },
  hostinger: {
    images: {
      "step-1-profile-nav": `${DOCS_BLOB_BASE}/docs/setup/hostinger/step-1-profile-nav.webp`,
      "step-2-api-access": `${DOCS_BLOB_BASE}/docs/setup/hostinger/step-2-api-access.webp`,
      "step-3-create-token": `${DOCS_BLOB_BASE}/docs/setup/hostinger/step-3-create-token.webp`,
    },
  },
}

export const FALLBACK_FIXIE_IPS = {
  PRIMARY: "52.5.155.132",
  SECONDARY: "52.87.82.133",
} as const

export const FALLBACK_NAMECHEAP_URLS = {
  API_SETTINGS: "https://ap.www.namecheap.com/settings/tools/",
  API_WHITELIST: "https://ap.www.namecheap.com/settings/tools/apiaccess/",
} as const
