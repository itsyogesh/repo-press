# RepoPress - Production Rollback Runbook

This document covers rollback procedures for production incidents.

---

## 1. Quick Reference

| Scenario | Rollback Command | Recovery Time |
|---|---|---|
| Bad Vercel deploy | Revert in Vercel dashboard → Deployments → Instant Rollback | < 1 min |
| Bad Convex deploy | `npx convex deploy --cmd 'npm run build' --preview-run` then redeploy last good | ~3 min |
| GitHub OAuth broken | Update callback URL in GitHub OAuth App settings | ~2 min |
| Database corruption | Convex dashboard → Import/Export → restore from snapshot | ~10 min |

---

## 2. Vercel Rollback

Vercel keeps all previous deployments. To rollback:

1. Go to [Vercel Dashboard](https://vercel.com) → Project → Deployments
2. Find the last known-good deployment
3. Click "..." → **Promote to Production**
4. Verify: `curl -s -o /dev/null -w "%{http_code}" https://your-domain.com`

**Automated (CLI):**
```bash
# List recent deployments
vercel ls

# Promote a specific deployment
vercel promote <deployment-url>
```

---

## 3. Convex Rollback

Convex deployments are atomic. Schema changes may need special handling.

### 3a. Code-only rollback (no schema changes)

```bash
# Checkout the last known-good commit
git checkout <good-commit-sha>

# Redeploy
npx convex deploy --cmd 'npm run build'
```

### 3b. Schema migration rollback

If the new deploy changed `convex/schema.ts`:

1. **Check if data was written** with the new schema
2. If no new data: revert `schema.ts` and redeploy
3. If new data exists: write a migration to transform data back, then revert schema

**⚠️ Never delete table definitions if data exists in them.**

### 3c. Convex data recovery

Convex provides automatic backups:

1. Go to Convex Dashboard → Settings → Import/Export
2. Export latest snapshot (or request a point-in-time recovery from Convex support)
3. Import into a fresh deployment for verification before restoring prod

---

## 4. Auth Recovery

### GitHub OAuth callback broken

1. Go to [GitHub Developer Settings](https://github.com/settings/developers)
2. Select your OAuth App
3. Update "Authorization callback URL" to: `https://<prod-convex>.convex.site/api/auth/callback/github`
4. Verify: attempt OAuth login flow

### Session tokens invalid

If `BETTER_AUTH_SECRET` was rotated:
- All existing sessions are invalidated (expected)
- Users must re-login
- No data loss occurs

---

## 5. Environment Variable Issues

### Missing Convex URL

**Symptom:** "ConvexReactClient not initialized" error on page load.

**Fix:**
```bash
# Verify env vars in Vercel
vercel env ls

# Re-add if missing
vercel env add NEXT_PUBLIC_CONVEX_URL production
```

### Missing GitHub credentials

**Symptom:** OAuth login fails with 500.

**Fix:** Check Convex dashboard → Settings → Environment Variables for:
- `GITHUB_CLIENT_ID`
- `GITHUB_CLIENT_SECRET`
- `BETTER_AUTH_SECRET`
- `SITE_URL`

### Missing capability secret

**Symptom:** repository, Studio, media, or publish routes fail with `REPOPRESS_CAPABILITY_SECRET is required`.

**Fix:** configure the same `REPOPRESS_CAPABILITY_SECRET` value in the Convex deployment and the matching Vercel environment, then redeploy Next.js. Do not copy or rotate `BETTER_AUTH_SECRET`.

---

## 6. Incident Response Checklist

When production breaks:

- [ ] **Identify**: Check Sentry for error details, Vercel logs for deploy issues
- [ ] **Communicate**: Post status update (Twitter, GitHub issue)
- [ ] **Mitigate**: Rollback Vercel if frontend, rollback Convex if backend
- [ ] **Verify**: Run smoke test (login → dashboard → studio → save)
- [ ] **Postmortem**: Document what happened and how to prevent it

---

## 7. Smoke Test After Recovery

After any rollback, verify these flows:

```bash
# 1. Landing page loads
curl -s -o /dev/null -w "%{http_code}" https://your-domain.com
# Expected: 200

# 2. API health
curl -s -o /dev/null -w "%{http_code}" https://your-domain.com/api/auth/ok
# Expected: 200 or 302

# 3. Security headers present
curl -sI https://your-domain.com | grep -i "x-frame-options"
# Expected: X-Frame-Options: DENY

# 4. Sitemap accessible
curl -s -o /dev/null -w "%{http_code}" https://your-domain.com/sitemap.xml
# Expected: 200
```

**Manual flows:**
1. GitHub OAuth login → redirects to dashboard
2. Select a repo → project loads
3. Open Studio → editor renders
4. Save draft → no errors
5. Publish → commit appears on GitHub
