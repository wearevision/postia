import path from "node:path"
import { defineConfig } from "vitest/config"

// Real Chromium: run with `pnpm test:render` after `pnpm exec playwright install chromium`.
export default defineConfig({
  test: { environment: "node", include: ["tests/render/**/*.test.ts"], testTimeout: 60_000, hookTimeout: 60_000 },
  resolve: { alias: { "@": path.resolve(__dirname, "./") } },
})
