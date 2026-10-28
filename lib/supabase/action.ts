import { createServerClient } from "@supabase/ssr"
import { cookies } from "next/headers"
import { exigirEnv } from "@/lib/env"
import type { Database } from "./database.types"

export async function createActionClient() {
  const cookieStore = await cookies()

  return createServerClient<Database>(
    exigirEnv("NEXT_PUBLIC_SUPABASE_URL", process.env.NEXT_PUBLIC_SUPABASE_URL),
    exigirEnv("NEXT_PUBLIC_SUPABASE_ANON_KEY", process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY),
    {
      cookies: {
        getAll() {
          return cookieStore.getAll()
        },
        setAll(cookiesToSet) {
          for (const { name, value, options } of cookiesToSet) cookieStore.set(name, value, options)
        },
      },
    },
  )
}
