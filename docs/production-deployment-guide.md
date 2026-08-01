# RepoPress - Production Deployment Guide

Step-by-step instructions for deploying RepoPress to production. This guide covers Convex, Vercel, GitHub OAuth, and DNS setup.

---

## Prerequisites

- [ ] A GitHub account with admin access to a GitHub OAuth App
- [ ] A Vercel account (Hobby or Pro)
- [ ] A Convex account
- [ ] A domain name (optional but recommended)
- [ ] The repo cloned with both branches merged to `main`

---

## Step 1: Create Production Convex Deployment

1. **Log in to the Convex dashboard**: https://dashboard.convex.dev
2. **Create a new project** (or use the existing one):
   - Go to your project → **Settings** → **Deployments**
   - You should see a `dev` deployment already. The `production` deployment is created automatically when you first deploy to it.

3. **Deploy to production**:
   ```bash
   npx convex deploy --prod
   ```
   This pushes your schema and functions to the production deployment.

4. **Set environment variables** in the Convex dashboard for the **production** deployment:

   | Variable | Value | Notes |
   |----------|-------|-------|
   | `GITHUB_CLIENT_ID` | Your GitHub OAuth App client ID | Must be a **separate** OAuth App from dev |
   | `GITHUB_CLIENT_SECRET` | Your GitHub OAuth App client secret | - |
   | `BETTER_AUTH_SECRET` | A new random 32+ character string | **Do NOT reuse the dev secret** |
   | `REPOPRESS_CAPABILITY_SECRET` | A new random 32+ character string | Also configure this exact value in Vercel; do not reuse `BETTER_AUTH_SECRET` |
   | `SITE_URL` | `https://<your-project>.convex.site` | Your Convex production site URL |

   Generate independent secrets for Better Auth and RepoPress capabilities:
   ```bash
   openssl rand -base64 32
   openssl rand -base64 32
   ```

5. **Note your production URLs** (from Convex dashboard → Settings):
   - Convex URL: `https://<your-project>.convex.cloud` (for `NEXT_PUBLIC_CONVEX_URL`)
   - Convex Site URL: `https://<your-project>.convex.site` (for `NEXT_PUBLIC_CONVEX_SITE_URL`)
   - Deployment name: `prod:<your-project>` (for `CONVEX_DEPLOYMENT`)

---

## Step 2: Configure GitHub OAuth App for Production

1. **Go to GitHub** → Settings → Developer settings → OAuth Apps
2. **Create a new OAuth App** (separate from dev):
   - **Application name**: `RepoPress` (or `RepoPress Production`)
   - **Homepage URL**: `https://your-domain.com`
   - **Authorization callback URL**: `https://<your-project>.convex.site/api/auth/callback/github`

   > ⚠️ The callback URL MUST point to your **Convex site URL**, not your Vercel domain. Better Auth runs inside Convex.

3. **Copy the Client ID and Client Secret** - you already set these in Step 1.

---

## Step 3: Deploy to Vercel

1. **Import the repo** on Vercel (or push to trigger auto-deploy if already connected).

2. **Set environment variables** in Vercel dashboard → Settings → Environment Variables:

   | Variable | Value | Scope |
   |----------|-------|-------|
   | `NEXT_PUBLIC_CONVEX_URL` | `https://<your-project>.convex.cloud` | Production |
   | `NEXT_PUBLIC_CONVEX_SITE_URL` | `https://<your-project>.convex.site` | Production |
   | `CONVEX_DEPLOYMENT` | `prod:<your-project>` | Production |
   | `NEXT_PUBLIC_APP_URL` | `https://your-domain.com` | Production |
   | `REPOPRESS_CAPABILITY_SECRET` | Same value configured in the production Convex deployment | Production |
   | `NEXT_PUBLIC_SENTRY_DSN` | Your Sentry DSN (optional) | Production |
   | `SENTRY_ORG` | Your Sentry org slug (optional) | Production |
   | `SENTRY_PROJECT` | Your Sentry project slug (optional) | Production |
   | `SENTRY_AUTH_TOKEN` | Sentry auth token for source maps (optional) | Production |

3. **Trigger a deploy** (push to main or manual deploy from Vercel dashboard).

4. **Verify**: Visit `https://your-domain.com` - the landing page should load.

---

## Step 4: Configure Custom Domain (Optional)

1. **In Vercel** → Settings → Domains → Add your domain
2. **Update DNS records** at your registrar:
   - `A` record: `76.76.21.21` (Vercel)
   - `CNAME` for `www`: `cname.vercel-dns.com`
3. **Wait for DNS propagation** (can take up to 48 hours, usually minutes)
4. **Update** `NEXT_PUBLIC_APP_URL` in Vercel to your custom domain
5. **Redeploy** to pick up the new URL for `metadataBase`

---

## Step 5: Set Up Sentry (Optional but Recommended)

1. **Create a Sentry project** at https://sentry.io:
   - Platform: Next.js
   - Note the DSN from Project Settings → Client Keys
2. **Create an auth token** at https://sentry.io/settings/auth-tokens/
   - Scopes: `project:releases`, `org:read`
3. **Set the 4 Sentry env vars** in Vercel (see Step 3 table)
4. **Verify**: After deploy, trigger an error and check Sentry dashboard

---

## Step 6: Google Search Console

1. Go to https://search.google.com/search-console
2. Add your domain as a property
3. Verify ownership (DNS TXT record or HTML file - Vercel supports both)
4. Submit sitemap: `https://your-domain.com/sitemap.xml`
5. Request indexing for key pages:
   - `/`
   - `/docs/getting-started`
   - `/blog`
   - `/about`

---

## Step 7: Smoke Test

Run through these flows on the production URL:

### Critical Path
- [ ] Landing page loads (`/`)
- [ ] GitHub OAuth login works → redirects to `/dashboard`
- [ ] Dashboard shows user's repos
- [ ] Select a repo → project setup wizard works
- [ ] Open Studio → file tree loads
- [ ] Edit a document → save draft works
- [ ] Publish → commit appears in GitHub

### SEO & Headers
```bash
# Check security headers
curl -I https://your-domain.com

# Expected headers:
# X-Frame-Options: DENY
# X-Content-Type-Options: nosniff
# Referrer-Policy: strict-origin-when-cross-origin
# Permissions-Policy: camera=(), microphone=()

# Check sitemap
curl https://your-domain.com/sitemap.xml

# Check robots
curl https://your-domain.com/robots.txt

# Check OG tags
curl -s https://your-domain.com | grep 'og:'
```

### Pages
- [ ] `/docs/getting-started` loads
- [ ] `/blog` loads with posts
- [ ] `/about` loads
- [ ] `/privacy` loads
- [ ] `/terms` loads
- [ ] Footer links to privacy/terms work

### Lighthouse
Run Lighthouse on `/` targeting:
- Performance ≥ 80
- Accessibility ≥ 90
- SEO ≥ 90

---

## Troubleshooting

| Symptom | Cause | Fix |
|---------|-------|-----|
| "ConvexReactClient not initialized" | Missing `NEXT_PUBLIC_CONVEX_URL` | Set it in Vercel env vars and redeploy |
| OAuth callback fails | Wrong callback URL in GitHub OAuth App | Must be `https://<project>.convex.site/api/auth/callback/github` |
| "ctx is not a mutation context" | Auth.ts modified incorrectly | Reset `convex/auth.ts` from git |
| 401 on API routes | Missing/expired GitHub token | Re-login via OAuth |
| OG image not showing | `NEXT_PUBLIC_APP_URL` not set | Set it and redeploy for correct `metadataBase` |
| Sentry not receiving events | DSN not set or `NODE_ENV !== 'production'` | Verify env var and check Sentry is enabled only in production |

---

## Merge Order

When merging the two feature branches:

1. **First**: Merge `release/production-hardening` → `main`
   - Contains: security fixes, CI, SEO, Sentry, docs
   - Lower risk, no visual changes to existing features

2. **Second**: Merge `feature/website-redesign` → `main`
   - Contains: design tokens, landing page, new pages, Remotion
   - Higher visual impact, but no backend changes

3. **After merge**: Run `npx convex deploy --prod` to push any schema changes

---

## Post-Launch Checklist

- [ ] Monitor Sentry for errors (first 24 hours)
- [ ] Check Vercel Analytics for traffic
- [ ] Verify Google Search Console indexing (48 hours)
- [ ] Monitor GitHub API rate limits in logs
- [ ] Set up Upstash rate limiting on `/api/github/save` if needed
