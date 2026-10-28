import { type NextRequest, NextResponse } from "next/server"
import { leerAppDeLinkedin, terminarConexionLinkedin } from "@/lib/linkedin/conexion"
import { COOKIE_DE_ESTADO_LINKEDIN, desempacarEstado, RUTA_DE_LA_COOKIE_LINKEDIN } from "@/lib/linkedin/estado-oauth"
import { RUTA_DE_INGRESO, RUTA_DE_MARCAS } from "@/lib/sesion/rutas"
import { leerSesion } from "@/lib/sesion/sesion"
import { createActionClient } from "@/lib/supabase/action"

// Where LinkedIn sends the owner back. Only the outcome travels to the screen, as a fixed word.
export async function GET(request: NextRequest) {
  const db = await createActionClient()
  const sesion = await leerSesion(db)
  if (sesion.estado !== "miembro") return NextResponse.redirect(new URL(RUTA_DE_INGRESO, request.url), 303)

  const parametros = request.nextUrl.searchParams
  const resultado = await terminarConexionLinkedin(
    {
      app: leerAppDeLinkedin(process.env),
      ahora: () => Date.now(),
      guardar: async (args) => {
        const { error } = await db.rpc("conectar_linkedin", args)
        return { error }
      },
    },
    {
      codigo: parametros.get("code"),
      estado: parametros.get("state"),
      guardado: desempacarEstado(request.cookies.get(COOKIE_DE_ESTADO_LINKEDIN)?.value),
      errorDeLinkedin: parametros.get("error"),
    },
  )

  const destino = `${RUTA_DE_MARCAS}?linkedin=${resultado.ok ? "conectada" : resultado.motivo}`
  const respuesta = NextResponse.redirect(new URL(destino, request.url), 303)
  respuesta.cookies.set(COOKIE_DE_ESTADO_LINKEDIN, "", { path: RUTA_DE_LA_COOKIE_LINKEDIN, maxAge: 0 })
  return respuesta
}
