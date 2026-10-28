import { createClient } from "@supabase/supabase-js"
import { exigirEnv } from "@/lib/env"
import type { Db } from "./database"
import type { Database } from "./database.types"

/** Service role: bypasses RLS. Only scripts and server code import this; never a client component. */
export function createAdminClient(): Db {
  return createClient<Database>(
    exigirEnv("NEXT_PUBLIC_SUPABASE_URL", process.env.NEXT_PUBLIC_SUPABASE_URL),
    exigirEnv("SUPABASE_SERVICE_ROLE_KEY", process.env.SUPABASE_SERVICE_ROLE_KEY),
    { auth: { persistSession: false, autoRefreshToken: false } },
  )
}
