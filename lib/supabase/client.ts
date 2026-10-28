import { createBrowserClient } from "@supabase/ssr"
import { exigirEnv } from "@/lib/env"

export function createClient() {
  return createBrowserClient(
    exigirEnv("NEXT_PUBLIC_SUPABASE_URL", process.env.NEXT_PUBLIC_SUPABASE_URL),
    exigirEnv("NEXT_PUBLIC_SUPABASE_ANON_KEY", process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY),
  )
}
