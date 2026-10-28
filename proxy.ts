import { createServerClient } from "@supabase/ssr"
import { type NextRequest, NextResponse } from "next/server"
import { exigirEnv } from "@/lib/env"
import { destinoDe } from "@/lib/sesion/rutas"
import type { Database } from "@/lib/supabase/database.types"

/** Refreshes the Supabase session cookie on every request and sends anyone without a session to sign-in. */
export async function proxy(request: NextRequest) {
  let respuesta = NextResponse.next({ request })
  const supabase = createServerClient<Database>(
    exigirEnv("NEXT_PUBLIC_SUPABASE_URL", process.env.NEXT_PUBLIC_SUPABASE_URL),
    exigirEnv("NEXT_PUBLIC_SUPABASE_ANON_KEY", process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY),
    {
      cookies: {
        getAll() {
          return request.cookies.getAll()
        },
        setAll(cookiesToSet) {
          for (const { name, value } of cookiesToSet) request.cookies.set(name, value)
          respuesta = NextResponse.next({ request })
          for (const { name, value, options } of cookiesToSet) respuesta.cookies.set(name, value, options)
        },
      },
    },
  )
  // getUser (not getSession): it asks Auth, so a forged cookie does not count as a session.
  const { data } = await supabase.auth.getUser()
  const destino = destinoDe(request.nextUrl.pathname, data.user !== null)
  if (!destino) return respuesta
  const url = request.nextUrl.clone()
  url.pathname = destino
  url.search = ""
  return NextResponse.redirect(url)
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|sw.js|manifest.webmanifest|icon|apple-icon).*)"],
}
