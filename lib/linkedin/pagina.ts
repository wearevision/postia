import { z } from "zod"
import { Falla, FallaDeConfiguracion } from "@/lib/dominio/falla"
import { RUTA_DE_MARCAS } from "@/lib/sesion/rutas"
import type { Db } from "@/lib/supabase/database"
import { RechazoDeLinkedin } from "./api"
import type { AppDeLinkedin, Llegada } from "./conexion"
import { estadoCoincide, esUuid } from "./estado-oauth"
import { intercambiarCodigoLinkedin, leerMiembroPorMe, urlDeAutorizacionLinkedin } from "./oauth"
import { nombreDePagina, paginasQueAdministra } from "./organizaciones"

type Entorno = Record<string, string | undefined>

// «Estudio WAV», the Community Management app. It has no OpenID Connect: the member comes from r_basicprofile.
export const SCOPES_DE_PAGINA = ["r_basicprofile", "rw_organization_admin", "w_organization_social"] as const
export const COOKIE_DE_ESTADO_PAGINA = "postia_linkedin_pagina_estado"
export const RUTA_DE_ELEGIR_PAGINA = `${RUTA_DE_MARCAS}/pagina`

/** The «Estudio WAV» app from the environment; null until its three variables are set. */
export function leerAppDePagina(entorno: Entorno): AppDeLinkedin | null {
  const {
    LINKEDIN_PAGINA_CLIENT_ID: clientId,
    LINKEDIN_PAGINA_CLIENT_SECRET: clientSecret,
    LINKEDIN_PAGINA_REDIRECT_URI: redirectUri,
  } = entorno
  return clientId && clientSecret && redirectUri ? { clientId, clientSecret, redirectUri } : null
}

export function urlDeAutorizacionDePagina(entrada: { clientId: string; redirectUri: string; estado: string }): string {
  return urlDeAutorizacionLinkedin({ ...entrada, scopes: SCOPES_DE_PAGINA })
}

interface Acceso {
  p_cuenta: string
  p_token: string
  p_titular: string
  p_nombre: string
  p_scopes: string[]
  p_expira_en: string
  p_renovacion?: string
  p_renovacion_expira_en?: string
}

export type ArgsDeEleccion = Acceso & { p_paginas: { urn: string; nombre: string }[] }

type ErrorDeLaBase = { message: string; code?: string } | null

export interface DepsDePagina {
  app: AppDeLinkedin | null
  ahora: () => number
  /**
   * `guardar_eleccion` with the person's session (the database checks they own the brand and the account is a page):
   * the token waits in Vault until the owner taps the page that publishes.
   */
  guardarEleccion: (args: ArgsDeEleccion) => Promise<{ data: string | null; error: ErrorDeLaBase }>
}

export type MotivoDeFalloDePagina =
  | "estado"
  | "cancelada"
  | "rechazada"
  | "permisos"
  | "sin_pagina"
  | "sin_app_pagina"
  | "cuenta_es_perfil"
  | "fallo"

export type ResultadoDePagina = { ok: true; eleccion: string } | { ok: false; motivo: MotivoDeFalloDePagina }

const URN_DE_ORGANIZACION = /^urn:li:organization:([0-9]+)$/

/** What a log may say about an error: its kind and HTTP code, never its message (LinkedIn's or the database's words). */
function tipoDeError(error: unknown): string {
  if (error instanceof RechazoDeLinkedin) return `${error.name} HTTP ${error.http}`
  return error instanceof Error ? error.name : typeof error
}

/**
 * Only the name of a page is shown, never stored past this flow (LinkedIn keeps organization data ≤ 8 weeks). A page
 * whose lookup fails is still offered by its number, so one odd page does not block the others.
 */
async function conNombres(token: string, paginas: string[]): Promise<{ urn: string; nombre: string }[]> {
  return Promise.all(
    paginas.map(async (urn) => {
      try {
        return { urn, nombre: await nombreDePagina({ token, organizacion: urn }) }
      } catch (error) {
        console.error(`No pude leer el nombre de ${urn} (${tipoDeError(error)}).`)
        return { urn, nombre: `Página n.º ${URN_DE_ORGANIZACION.exec(urn)?.[1] ?? urn}` }
      }
    }),
  )
}

/** The callback of «Conectar página de LinkedIn». Whatever fails leaves Vault and the account as they were. */
export async function terminarConexionDePagina(deps: DepsDePagina, llegada: Llegada): Promise<ResultadoDePagina> {
  if (!deps.app) return { ok: false, motivo: "sin_app_pagina" }
  if (!llegada.guardado || !estadoCoincide(llegada.guardado.estado, llegada.estado)) {
    return { ok: false, motivo: "estado" }
  }
  if (llegada.errorDeLinkedin) return { ok: false, motivo: "cancelada" }
  if (!llegada.codigo) return { ok: false, motivo: "fallo" }

  try {
    const acceso = await intercambiarCodigoLinkedin({ ...deps.app, codigo: llegada.codigo })
    if (
      acceso.scopes !== null &&
      (!acceso.scopes.includes("w_organization_social") || !acceso.scopes.includes("rw_organization_admin"))
    ) {
      return { ok: false, motivo: "permisos" }
    }
    const titular = await leerMiembroPorMe({ token: acceso.token })
    let paginas: string[]
    try {
      paginas = await paginasQueAdministra({ token: acceso.token })
    } catch (error) {
      // An answer without scopes says nothing of what was granted: the page list, which needs rw_organization_admin,
      // is the check, and its 403 is a missing permission.
      if (acceso.scopes === null && error instanceof RechazoDeLinkedin && error.http === 403) {
        return { ok: false, motivo: "permisos" }
      }
      throw error
    }
    if (paginas.length === 0) return { ok: false, motivo: "sin_pagina" }

    const comun: Acceso = {
      p_cuenta: llegada.guardado.cuenta,
      p_token: acceso.token,
      p_titular: titular,
      // The member's name is not read (no OpenID Connect) and the page's name is not kept.
      p_nombre: "",
      p_scopes: acceso.scopes ?? [...SCOPES_DE_PAGINA],
      p_expira_en: new Date(deps.ahora() + acceso.expiraEnSegundos * 1000).toISOString(),
      ...(acceso.refreshToken && acceso.refreshTokenExpiraEnSegundos
        ? {
            p_renovacion: acceso.refreshToken,
            p_renovacion_expira_en: new Date(deps.ahora() + acceso.refreshTokenExpiraEnSegundos * 1000).toISOString(),
          }
        : {}),
    }

    // Even a single page is confirmed by name: the owner sees which page will publish before it is linked.
    const { data, error } = await deps.guardarEleccion({ ...comun, p_paginas: await conNombres(acceso.token, paginas) })
    if (error?.message === "cuenta_y_app_no_calzan") return { ok: false, motivo: "cuenta_es_perfil" }
    if (error || !data) {
      console.error(`No pude guardar la elección de página (${error?.code ?? "sin id"}).`)
      return { ok: false, motivo: "fallo" }
    }
    return { ok: true, eleccion: data }
  } catch (error) {
    if (error instanceof Falla) return { ok: false, motivo: "rechazada" }
    if (error instanceof FallaDeConfiguracion) {
      console.error(`LinkedIn no aceptó la conexión de la página (${tipoDeError(error)}).`)
      return { ok: false, motivo: "rechazada" }
    }
    console.error(`No pude conectar la página de LinkedIn (${tipoDeError(error)}).`)
    return { ok: false, motivo: "fallo" }
  }
}

/** Where the callback sends the owner: always a path inside the app, with only a fixed word or a uuid in it. */
export function destinoDeLaPagina(resultado: ResultadoDePagina): string {
  if (!resultado.ok) return `${RUTA_DE_MARCAS}?linkedin=${resultado.motivo}`
  return esUuid(resultado.eleccion)
    ? `${RUTA_DE_ELEGIR_PAGINA}?eleccion=${resultado.eleccion}`
    : `${RUTA_DE_MARCAS}?linkedin=fallo`
}

const Eleccion = z.object({ eleccion: z.uuid(), organizacion: z.string().regex(URN_DE_ORGANIZACION) })

/** The owner tapped the page that publishes. The database checks the choice is theirs, recent and lists that page. */
export async function elegirPagina(db: Db, entrada: unknown): Promise<"conectada" | "estado" | "fallo"> {
  const leida = Eleccion.safeParse(entrada)
  if (!leida.success) return "fallo"
  const { error } = await db.rpc("elegir_pagina", {
    p_eleccion: leida.data.eleccion,
    p_organizacion: leida.data.organizacion,
  })
  if (!error) return "conectada"
  if (error.message === "eleccion_vencida" || error.message === "eleccion_ajena") return "estado"
  console.error(`No pude conectar la página elegida (${error.code}).`)
  return "fallo"
}
