import { type NextRequest, NextResponse } from "next/server"
import { RUTA_DE_INGRESO } from "@/lib/sesion/rutas"
import { createActionClient } from "@/lib/supabase/action"

export async function GET(request: NextRequest) {
  const db = await createActionClient()
  const { error } = await db.auth.signOut()
  // The cookie is cleared locally either way; the log tells WAV the server-side revoke failed.
  if (error) console.error("No pude cerrar la sesión en Supabase", error)
  const motivo = request.nextUrl.searchParams.get("motivo") === "sin_acceso" ? "?motivo=sin_acceso" : ""
  return NextResponse.redirect(new URL(`${RUTA_DE_INGRESO}${motivo}`, request.url), 303)
}
