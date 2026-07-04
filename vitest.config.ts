import path from "node:path"
import { defineConfig } from "vitest/config"

export default defineConfig({
  test: {
    include: ["**/__tests__/**/*.test.ts", "**/__tests__/**/*.test.tsx"],
    exclude: ["node_modules", ".next", ".worktrees", "convex"],
    environment: "jsdom",
    // Heavy tests (esbuild-wasm bundling in lib/repopress, Radix-dialog jsdom
    // renders) can spike past the 5s default under full-suite CPU contention,
    // causing nondeterministic timeout flakes. Give a generous ceiling - these
    // tests pass in well under a second standalone, so this absorbs contention
    // without masking real hangs.
    testTimeout: 20000,
  },
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "."),
    },
  },
})
