import { defineCloudflareConfig } from "@opennextjs/cloudflare"

// Every page reads the session, so nothing is statically cached: no incremental cache store is needed.
export default defineCloudflareConfig({})
