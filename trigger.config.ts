import { defineConfig } from "@trigger.dev/sdk"

export default defineConfig({
  project: "proj_cfileylububfgxfoqhyb",
  dirs: ["./trigger"],
  runtime: "node",
  // Below the 600 s lease of tomar_para_publicar: a run is cut off before its pieces can be leased again.
  maxDuration: 540,
  retries: { enabledInDev: false, default: { maxAttempts: 1 } },
})
