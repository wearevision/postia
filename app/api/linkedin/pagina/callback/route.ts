import { type NextRequest, NextResponse } from "next/server"
import { desempacarEstado, RUTA_DE_LA_COOKIE_LINKEDIN } from "@/lib/linkedin/estado-oauth"
import {
  COOKIE_DE_ESTADO_PAGINA,
  destinoDeLaPagina,
  leerAppDePagina,
  terminarConexionDePagina,
} from "@/lib/linkedin/pagina"
import { RUTA_DE_INGRESO } from "@/lib/sesion/rutas"
import { leerSesion } from "@/lib/sesion/sesion"
import { createActionClient } from "@/lib/supabase/action"

// Where LinkedIn sends the owner back from «Estudio WAV». Only a fixed word, or the id of their own choice, travels on.
export async function GET(request: NextRequest) {
  const db = await createActionClient()
  const sesion = await leerSesion(db)
  if (sesion.estado !== "miembro") return NextResponse.redirect(new URL(RUTA_DE_INGRESO, request.url), 303)

  const parametros = request.nextUrl.searchParams
  const resultado = await terminarConexionDePagina(
    {
      app: leerAppDePagina(process.env),
      ahora: () => Date.now(),
      guardar: async (args) => {
        const { error } = await db.rpc("conectar_linkedin", args)
        return { error }
      },
      guardarEleccion: async (args) => {
        const { data, error } = await db.rpc("guardar_eleccion", args)
        return { data, error }
      },
    },
    {
      codigo: parametros.get("code"),
      estado: parametros.get("state"),
      guardado: desempacarEstado(request.cookies.get(COOKIE_DE_ESTADO_PAGINA)?.value),
      errorDeLinkedin: parametros.get("error"),
    },
  )

  const respuesta = NextResponse.redirect(new URL(destinoDeLaPagina(resultado), request.url), 303)
  respuesta.cookies.set(COOKIE_DE_ESTADO_PAGINA, "", { path: RUTA_DE_LA_COOKIE_LINKEDIN, maxAge: 0 })
  return respuesta
}
