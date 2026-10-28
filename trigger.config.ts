import { defineConfig } from "@trigger.dev/sdk"

export default defineConfig({
  project: "proj_cfileylububfgxfoqhyb",
  dirs: ["./trigger"],
  runtime: "node",
  maxDuration: 300,
  retries: { enabledInDev: false, default: { maxAttempts: 1 } },
})
