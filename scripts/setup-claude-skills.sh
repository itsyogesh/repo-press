#!/usr/bin/env bash
# =============================================================================
# RepoPress — Claude Code Skills & Plugins Bootstrap
# =============================================================================
# Run this once after cloning the repo to install all recommended skills.
#
# Usage:
#   chmod +x scripts/setup-claude-skills.sh
#   ./scripts/setup-claude-skills.sh
#
# After running this script, open Claude Code and install the plugins:
#   /plugin install typescript-lsp@claude-plugins-official
#   /plugin install github@claude-plugins-official
#   /plugin install commit-commands@claude-plugins-official
#   /plugin install code-review@claude-plugins-official
#   /plugin install security-guidance@claude-plugins-official
#   /plugin install frontend-design@claude-plugins-official
#   /plugin install feature-dev@claude-plugins-official
# =============================================================================

set -euo pipefail

echo "============================================"
echo "  RepoPress — Installing Claude Code Skills"
echo "============================================"
echo ""

# ---------------------
# Tier 1: Essential
# ---------------------
echo "[1/3] Installing Tier 1 (Essential) skills..."
echo ""

echo "  -> Convex best practices (waynesutton/convexskills)"
npx skills add waynesutton/convexskills --skill convex-best-practices
npx skills add waynesutton/convexskills --skill convex-functions
npx skills add waynesutton/convexskills --skill convex-schema-validator
npx skills add waynesutton/convexskills --skill convex-security-check

echo "  -> Next.js 16 best practices (vercel-labs/next-skills)"
npx skills add vercel-labs/next-skills --skill next-best-practices
npx skills add vercel-labs/next-skills --skill next-cache-components

echo "  -> React best practices (vercel-labs/agent-skills)"
npx skills add vercel-labs/agent-skills --skill react-best-practices

echo "  -> Tailwind v4 + shadcn/ui (secondsky/claude-skills)"
npx skills add secondsky/claude-skills --skill tailwind-v4-shadcn

echo "  -> Better Auth (secondsky/claude-skills)"
npx skills add secondsky/claude-skills --skill better-auth

echo "  -> Security (trailofbits/skills)"
npx skills add trailofbits/skills --skill differential-review
npx skills add trailofbits/skills --skill insecure-defaults

echo ""

# ---------------------
# Tier 2: Recommended
# ---------------------
echo "[2/3] Installing Tier 2 (Recommended) skills..."
echo ""

echo "  -> Web design guidelines (vercel-labs/agent-skills)"
npx skills add vercel-labs/agent-skills --skill web-design-guidelines
npx skills add vercel-labs/agent-skills --skill composition-patterns

echo "  -> Convex advanced patterns (waynesutton/convexskills)"
npx skills add waynesutton/convexskills --skill convex-http-actions
npx skills add waynesutton/convexskills --skill convex-cron-jobs
npx skills add waynesutton/convexskills --skill convex-file-storage
npx skills add waynesutton/convexskills --skill convex-realtime

echo "  -> Testing (secondsky/claude-skills)"
npx skills add secondsky/claude-skills --skill vitest-testing

echo "  -> Engineering superpowers (obra/superpowers)"
npx skills add obra/superpowers

echo ""

# ---------------------
# Tier 3: Nice to Have
# ---------------------
echo "[3/3] Installing Tier 3 (Nice to Have) skills..."
echo ""

echo "  -> UI/UX guidelines (nextlevelbuilder)"
npx skills add nextlevelbuilder/ui-ux-pro-max-skill --skill ui-ux-pro-max

echo "  -> Advanced security (trailofbits/skills)"
npx skills add trailofbits/skills --skill sharp-edges

echo "  -> Convex security audit (waynesutton/convexskills)"
npx skills add waynesutton/convexskills --skill convex-security-audit

echo "  -> Playwright E2E testing (secondsky/claude-skills)"
npx skills add secondsky/claude-skills --skill playwright-testing

echo ""
echo "============================================"
echo "  Skills installed!"
echo ""
echo "  Next steps:"
echo "  1. Open Claude Code: claude"
echo "  2. Install plugins (see top of this script)"
echo "  3. Enable Agent Teams:"
echo "     export CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS=1"
echo "============================================"
