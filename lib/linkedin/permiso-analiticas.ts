import { Falla, FallaDeConfiguracion } from "@/lib/dominio/falla"
import { RUTA_DE_AJUSTES } from "@/lib/sesion/rutas"
import type { AppDeLinkedin, Llegada } from "./conexion"
import { estadoCoincide } from "./estado-oauth"
import { intercambiarCodigoLinkedin, urlDeAutorizacionLinkedin } from "./oauth"
import { tipoDeError } from "./pagina"

// r_member_postAnalytics is a 3-legged member permission of the Community Management API, the same app as the page, so
// it is requested through the same authorization code flow:
// https://learn.microsoft.com/en-us/linkedin/marketing/community-management/members/post-statistics
// https://learn.microsoft.com/en-us/linkedin/marketing/increasing-access (both checked 2026-11-09).
// Data minimization: this is the only permission the consent asks for.
export const SCOPES_DE_ANALITICAS = ["r_member_postAnalytics"] as const

export function urlDeAutorizacionDeAnaliticas(entrada: {
  clientId: string
  redirectUri: string
  estado: string
}): string {
  return urlDeAutorizacionLinkedin({ ...entrada, scopes: SCOPES_DE_ANALITICAS })
}

export interface ArgsDeAnaliticas {
  p_cuenta: string
  p_token: string
  p_scopes: string[]
  p_expira_en: string
}

export interface DepsDeAnaliticas {
  app: AppDeLinkedin | null
  ahora: () => number
  /** `conectar_analiticas` with the person's session: the database checks they own the brand and it is a profile. */
  guardar: (args: ArgsDeAnaliticas) => Promise<{ error: { message: string; code?: string } | null }>
}

export type MotivoDeFalloDeAnaliticas =
  | "estado"
  | "cancelada"
  | "rechazada"
  | "permisos_analiticas"
  | "sin_app_pagina"
  | "analiticas_solo_perfil"
  | "fallo"

export type ResultadoDeAnaliticas = { ok: true } | { ok: false; motivo: MotivoDeFalloDeAnaliticas }

/** The callback of «Conectar analíticas de LinkedIn». Whatever fails leaves Vault and the account as they were. */
export async function terminarConexionDeAnaliticas(
  deps: DepsDeAnaliticas,
  llegada: Llegada,
): Promise<ResultadoDeAnaliticas> {
  if (!deps.app) return { ok: false, motivo: "sin_app_pagina" }
  if (!llegada.guardado || !estadoCoincide(llegada.guardado.estado, llegada.estado)) {
    return { ok: false, motivo: "estado" }
  }
  if (llegada.errorDeLinkedin) return { ok: false, motivo: "cancelada" }
  if (!llegada.codigo) return { ok: false, motivo: "fallo" }

  try {
    const acceso = await intercambiarCodigoLinkedin({ ...deps.app, codigo: llegada.codigo })
    if (acceso.scopes !== null && !acceso.scopes.includes("r_member_postAnalytics")) {
      return { ok: false, motivo: "permisos_analiticas" }
    }
    const { error } = await deps.guardar({
      p_cuenta: llegada.guardado.cuenta,
      p_token: acceso.token,
      // An answer without scopes says nothing of what was granted; reading the figures (a 403) is the check then.
      p_scopes: acceso.scopes ?? [...SCOPES_DE_ANALITICAS],
      p_expira_en: new Date(deps.ahora() + acceso.expiraEnSegundos * 1000).toISOString(),
    })
    if (error?.message === "cuenta_no_es_perfil") return { ok: false, motivo: "analiticas_solo_perfil" }
    if (error) {
      console.error(`No pude guardar las analíticas de LinkedIn (${error.code ?? "sin código"}).`)
      return { ok: false, motivo: "fallo" }
    }
    return { ok: true }
  } catch (error) {
    if (error instanceof Falla) return { ok: false, motivo: "rechazada" }
    if (error instanceof FallaDeConfiguracion) {
      console.error(`LinkedIn no aceptó las analíticas (${tipoDeError(error)}).`)
      return { ok: false, motivo: "rechazada" }
    }
    console.error(`No pude conectar las analíticas de LinkedIn (${tipoDeError(error)}).`)
    return { ok: false, motivo: "fallo" }
  }
}

/** Where the callback sends the owner: always Ajustes, with only a fixed word in the URL. */
export function destinoDeAnaliticas(resultado: ResultadoDeAnaliticas): string {
  return `${RUTA_DE_AJUSTES}?linkedin=${resultado.ok ? "analiticas_conectada" : resultado.motivo}`
}
