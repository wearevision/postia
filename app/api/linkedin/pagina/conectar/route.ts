import { type NextRequest, NextResponse } from "next/server"
import { empacarEstado, esUuid, nuevoEstado, opcionesDeLaCookieLinkedin } from "@/lib/linkedin/estado-oauth"
import { COOKIE_DE_ESTADO_PAGINA, leerAppDePagina, urlDeAutorizacionDePagina } from "@/lib/linkedin/pagina"
import { RUTA_DE_INGRESO, RUTA_DE_MARCAS } from "@/lib/sesion/rutas"
import { leerSesion } from "@/lib/sesion/sesion"
import { createClient } from "@/lib/supabase/server"

const irA = (request: NextRequest, ruta: string) => NextResponse.redirect(new URL(ruta, request.url), 303)

// «Conectar página de LinkedIn» and «Renovar página»: the «Estudio WAV» app, with a state only this browser knows.
export async function GET(request: NextRequest) {
  const sesion = await leerSesion(await createClient())
  if (sesion.estado !== "miembro") return irA(request, RUTA_DE_INGRESO)
  const cuenta = request.nextUrl.searchParams.get("cuenta")
  if (!esUuid(cuenta)) return irA(request, `${RUTA_DE_MARCAS}?linkedin=fallo`)
  const app = leerAppDePagina(process.env)
  if (!app) return irA(request, `${RUTA_DE_MARCAS}?linkedin=sin_app_pagina`)

  const estado = nuevoEstado()
  const respuesta = NextResponse.redirect(
    urlDeAutorizacionDePagina({ clientId: app.clientId, redirectUri: app.redirectUri, estado }),
  )
  respuesta.cookies.set(
    COOKIE_DE_ESTADO_PAGINA,
    empacarEstado(estado, cuenta),
    opcionesDeLaCookieLinkedin(request.nextUrl.protocol === "https:"),
  )
  return respuesta
}
