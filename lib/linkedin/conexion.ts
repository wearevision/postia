import { Falla } from "@/lib/dominio/falla"
import { estadoCoincide } from "./estado-oauth"
import { intercambiarCodigoLinkedin, leerMiembro } from "./oauth"

type Entorno = Record<string, string | undefined>

export interface AppDeLinkedin {
  clientId: string
  clientSecret: string
  redirectUri: string
}

/** The «Estudio WAV Perfil» app from the environment; null until its three variables are set. */
export function leerAppDeLinkedin(entorno: Entorno): AppDeLinkedin | null {
  const {
    LINKEDIN_CLIENT_ID: clientId,
    LINKEDIN_CLIENT_SECRET: clientSecret,
    LINKEDIN_REDIRECT_URI: redirectUri,
  } = entorno
  return clientId && clientSecret && redirectUri ? { clientId, clientSecret, redirectUri } : null
}

export interface ArgsDeConexion {
  p_cuenta: string
  p_token: string
  p_titular: string
  p_nombre: string
  p_scopes: string[]
  p_expira_en: string
}

export interface DepsDeConexion {
  app: AppDeLinkedin | null
  ahora: () => number
  /** `conectar_linkedin` with the person's session: the database checks they own the brand. */
  guardar: (args: ArgsDeConexion) => Promise<{ error: { message: string } | null }>
}

export type MotivoDeFallo = "estado" | "cancelada" | "rechazada" | "permisos" | "sin_app" | "cuenta_es_pagina" | "fallo"
export type ResultadoDeConexion = { ok: true; nombre: string | null } | { ok: false; motivo: MotivoDeFallo }

export interface Llegada {
  codigo: string | null
  estado: string | null
  guardado: { estado: string; cuenta: string } | null
  errorDeLinkedin: string | null
}

/** The callback of «Conectar LinkedIn». Whatever fails leaves Vault and the account as they were. */
export async function terminarConexionLinkedin(deps: DepsDeConexion, llegada: Llegada): Promise<ResultadoDeConexion> {
  if (!deps.app) return { ok: false, motivo: "sin_app" }
  if (!llegada.guardado || !estadoCoincide(llegada.guardado.estado, llegada.estado)) {
    return { ok: false, motivo: "estado" }
  }
  if (llegada.errorDeLinkedin) return { ok: false, motivo: "cancelada" }
  if (!llegada.codigo) return { ok: false, motivo: "fallo" }

  try {
    const acceso = await intercambiarCodigoLinkedin({ ...deps.app, codigo: llegada.codigo })
    if (acceso.scopes !== null && !acceso.scopes.includes("w_member_social")) return { ok: false, motivo: "permisos" }
    const { miembro, nombre } = await leerMiembro({ token: acceso.token })
    const { error } = await deps.guardar({
      p_cuenta: llegada.guardado.cuenta,
      p_token: acceso.token,
      p_titular: miembro,
      p_nombre: nombre ?? "",
      p_scopes: acceso.scopes ?? ["openid", "profile", "w_member_social"],
      p_expira_en: new Date(deps.ahora() + acceso.expiraEnSegundos * 1000).toISOString(),
    })
    if (error?.message === "cuenta_y_app_no_calzan") return { ok: false, motivo: "cuenta_es_pagina" }
    if (error) throw new Error(`No pude guardar la conexión de LinkedIn: ${error.message}`)
    return { ok: true, nombre }
  } catch (error) {
    if (error instanceof Falla) return { ok: false, motivo: "rechazada" }
    console.error("No pude conectar LinkedIn", error)
    return { ok: false, motivo: "fallo" }
  }
}
