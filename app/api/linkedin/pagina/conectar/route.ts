import { type NextRequest, NextResponse } from "next/server"
import { empacarEstadoDeEstudioWav, esUuid, nuevoEstado, opcionesDeLaCookieLinkedin } from "@/lib/linkedin/estado-oauth"
import { COOKIE_DE_ESTADO_PAGINA, leerAppDePagina, urlDeAutorizacionDePagina } from "@/lib/linkedin/pagina"
import { urlDeAutorizacionDeAnaliticas } from "@/lib/linkedin/permiso-analiticas"
import { RUTA_DE_AJUSTES, RUTA_DE_INGRESO } from "@/lib/sesion/rutas"
import { leerSesion } from "@/lib/sesion/sesion"
import { createClient } from "@/lib/supabase/server"

const irA = (request: NextRequest, ruta: string) => NextResponse.redirect(new URL(ruta, request.url), 303)

// «Conectar página de LinkedIn», «Renovar página» and «Conectar analíticas de LinkedIn» (`?proposito=analiticas`): the
// «Estudio WAV» app, with a state only this browser knows. The cookie remembers which of the two flows this was.
export async function GET(request: NextRequest) {
  const sesion = await leerSesion(await createClient())
  if (sesion.estado !== "miembro") return irA(request, RUTA_DE_INGRESO)
  const cuenta = request.nextUrl.searchParams.get("cuenta")
  if (!esUuid(cuenta)) return irA(request, `${RUTA_DE_AJUSTES}?linkedin=fallo`)
  const app = leerAppDePagina(process.env)
  if (!app) return irA(request, `${RUTA_DE_AJUSTES}?linkedin=sin_app_pagina`)

  const proposito = request.nextUrl.searchParams.get("proposito") === "analiticas" ? "analiticas" : "pagina"
  const estado = nuevoEstado()
  const urlDeAutorizacion = proposito === "analiticas" ? urlDeAutorizacionDeAnaliticas : urlDeAutorizacionDePagina
  const respuesta = NextResponse.redirect(
    urlDeAutorizacion({ clientId: app.clientId, redirectUri: app.redirectUri, estado }),
  )
  respuesta.cookies.set(
    COOKIE_DE_ESTADO_PAGINA,
    empacarEstadoDeEstudioWav(estado, cuenta, proposito),
    opcionesDeLaCookieLinkedin(request.nextUrl.protocol === "https:"),
  )
  return respuesta
}
