import { defineConfig, devices } from "@playwright/test"

// E2E_BASE_URL points the same specs at `pnpm preview` (workerd) or a deployed URL; then no dev server starts.
const destino = process.env.E2E_BASE_URL ?? "http://localhost:3000"

export default defineConfig({
  testDir: "./tests/e2e",
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: process.env.CI ? 1 : undefined,
  reporter: "html",
  use: {
    baseURL: destino,
    trace: "on-first-retry",
  },
  projects: [{ name: "iphone", use: { ...devices["iPhone 14"] } }],
  webServer: process.env.E2E_BASE_URL
    ? undefined
    : {
        command: "pnpm dev",
        url: destino,
        reuseExistingServer: !process.env.CI,
        timeout: 120_000,
      },
})
