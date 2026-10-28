import { type NextRequest, NextResponse } from "next/server"
import { leerAppDeLinkedin } from "@/lib/linkedin/conexion"
import {
  COOKIE_DE_ESTADO_LINKEDIN,
  empacarEstado,
  esUuid,
  nuevoEstado,
  opcionesDeLaCookieLinkedin,
} from "@/lib/linkedin/estado-oauth"
import { urlDeAutorizacionLinkedin } from "@/lib/linkedin/oauth"
import { RUTA_DE_INGRESO, RUTA_DE_MARCAS } from "@/lib/sesion/rutas"
import { leerSesion } from "@/lib/sesion/sesion"
import { createClient } from "@/lib/supabase/server"

const irA = (request: NextRequest, ruta: string) => NextResponse.redirect(new URL(ruta, request.url), 303)

// «Conectar LinkedIn» and «Renovar»: sends the owner to LinkedIn with a state only this browser knows.
export async function GET(request: NextRequest) {
  const sesion = await leerSesion(await createClient())
  if (sesion.estado !== "miembro") return irA(request, RUTA_DE_INGRESO)
  const cuenta = request.nextUrl.searchParams.get("cuenta")
  if (!esUuid(cuenta)) return irA(request, `${RUTA_DE_MARCAS}?linkedin=fallo`)
  const app = leerAppDeLinkedin(process.env)
  if (!app) return irA(request, `${RUTA_DE_MARCAS}?linkedin=sin_app`)

  const estado = nuevoEstado()
  const respuesta = NextResponse.redirect(
    urlDeAutorizacionLinkedin({ clientId: app.clientId, redirectUri: app.redirectUri, estado }),
  )
  respuesta.cookies.set(
    COOKIE_DE_ESTADO_LINKEDIN,
    empacarEstado(estado, cuenta),
    opcionesDeLaCookieLinkedin(request.nextUrl.protocol === "https:"),
  )
  return respuesta
}
