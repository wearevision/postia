import { additionalFiles } from "@trigger.dev/build/extensions/core"
import { playwright } from "@trigger.dev/build/extensions/playwright"
import { defineConfig } from "@trigger.dev/sdk"

export default defineConfig({
  project: "proj_cfileylububfgxfoqhyb",
  dirs: ["./trigger"],
  runtime: "node",
  // Below the 600 s lease of tomar_para_publicar: a run is cut off before its pieces can be leased again.
  maxDuration: 540,
  // process.cwd() is the build directory in dev as in deploy, so lib/carrusel/fuentes.ts finds assets/fuentes.
  legacyDevProcessCwdBehaviour: false,
  retries: { enabledInDev: false, default: { maxAttempts: 1 } },
  build: {
    extensions: [playwright({ browsers: ["chromium"] }), additionalFiles({ files: ["./assets/fuentes/**"] })],
  },
})
