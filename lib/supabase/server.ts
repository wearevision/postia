import { createServerClient } from "@supabase/ssr"
import { cookies } from "next/headers"
import { exigirEnv } from "@/lib/env"

export async function createClient() {
  const cookieStore = await cookies()

  return createServerClient(
    exigirEnv("NEXT_PUBLIC_SUPABASE_URL", process.env.NEXT_PUBLIC_SUPABASE_URL),
    exigirEnv("NEXT_PUBLIC_SUPABASE_ANON_KEY", process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY),
    {
      cookies: {
        getAll() {
          return cookieStore.getAll()
        },
        setAll() {
          // Server Components cannot write cookies: actions and route handlers use action.ts.
        },
      },
    },
  )
}
