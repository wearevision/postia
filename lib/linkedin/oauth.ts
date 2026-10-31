import { z } from "zod"
import { Falla } from "@/lib/dominio/falla"
import { baseDe } from "@/lib/proveedores/bases"
import { llamar, RechazoDeLinkedin } from "./api"

// Authorization code flow: https://learn.microsoft.com/en-us/linkedin/shared/authentication/authorization-code-flow
// OIDC userinfo: https://learn.microsoft.com/en-us/linkedin/consumer/integrations/self-serve/sign-in-with-linkedin-v2
// (both checked 2026-10-28). No refresh token for a self-serve app: renewing is this same flow every 60 days.
export const SCOPES_DE_LINKEDIN = ["openid", "profile", "w_member_social"] as const

const BASE_OAUTH = "https://www.linkedin.com"
const BASE_API = "https://api.linkedin.com"
const ESPERA_MS = 30_000

export const REFUSADA_LINKEDIN = "LinkedIn no aceptó la conexión. Vuelve a conectarla desde Marcas."

interface App {
  clientId: string
  clientSecret: string
  redirectUri: string
}

export function urlDeAutorizacionLinkedin(entrada: Omit<App, "clientSecret"> & { estado: string }): string {
  const consulta = new URLSearchParams({
    response_type: "code",
    client_id: entrada.clientId,
    redirect_uri: entrada.redirectUri,
    state: entrada.estado,
    scope: SCOPES_DE_LINKEDIN.join(" "),
  })
  // URLSearchParams writes a space as "+"; LinkedIn documents URL-encoded, space-delimited scopes.
  const base = baseDe(process.env, "LINKEDIN_OAUTH_BASE_URL", BASE_OAUTH)
  return `${base}/oauth/v2/authorization?${consulta.toString().replace(/\+/g, "%20")}`
}

function sinSecretos(texto: string, secretos: readonly string[]): string {
  return secretos.reduce((limpio, secreto) => (secreto ? limpio.split(secreto).join("[x]") : limpio), texto)
}

async function pedir(url: string, init: RequestInit, secretos: readonly string[]): Promise<unknown> {
  let respuesta: Response
  try {
    respuesta = await fetch(url, { ...init, signal: AbortSignal.timeout(ESPERA_MS) })
  } catch (error) {
    throw new Error("No pude conectar con LinkedIn.", { cause: error })
  }
  if (!respuesta.ok) {
    const detalle = sinSecretos((await respuesta.text()).slice(0, 300), secretos)
    console.error(`LinkedIn respondió HTTP ${respuesta.status} al conectar la cuenta: ${detalle}`)
    const deCliente =
      respuesta.status >= 400 && respuesta.status < 500 && respuesta.status !== 408 && respuesta.status !== 429
    if (deCliente) throw new Falla(REFUSADA_LINKEDIN)
    throw new Error(`LinkedIn respondió HTTP ${respuesta.status} al conectar la cuenta.`)
  }
  try {
    return await respuesta.json()
  } catch (error) {
    throw new Error("LinkedIn devolvió una respuesta ilegible.", { cause: error })
  }
}

const RespuestaDeToken = z.object({
  access_token: z.string().min(1),
  expires_in: z.number().positive(),
  scope: z.string().optional(),
  // Present only for apps LinkedIn enabled for programmatic refresh tokens (365 days, fixed from the first grant).
  refresh_token: z.string().min(1).optional(),
  refresh_token_expires_in: z.number().positive().optional(),
})

export async function intercambiarCodigoLinkedin(entrada: App & { codigo: string }): Promise<{
  token: string
  expiraEnSegundos: number
  scopes: string[] | null
  refreshToken: string | null
  refreshTokenExpiraEnSegundos: number | null
}> {
  const cuerpo = await pedir(
    `${baseDe(process.env, "LINKEDIN_OAUTH_BASE_URL", BASE_OAUTH)}/oauth/v2/accessToken`,
    {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        grant_type: "authorization_code",
        code: entrada.codigo,
        client_id: entrada.clientId,
        client_secret: entrada.clientSecret,
        redirect_uri: entrada.redirectUri,
      }).toString(),
    },
    [entrada.clientSecret, entrada.codigo],
  )
  const leida = RespuestaDeToken.safeParse(cuerpo)
  if (!leida.success) throw new Error("LinkedIn devolvió una respuesta inesperada en /oauth/v2/accessToken.")
  return {
    token: leida.data.access_token,
    expiraEnSegundos: leida.data.expires_in,
    // The docs say space-delimited; real answers have used commas, so both are read.
    scopes: leida.data.scope ? leida.data.scope.split(/[\s,]+/).filter(Boolean) : null,
    refreshToken: leida.data.refresh_token ?? null,
    refreshTokenExpiraEnSegundos: leida.data.refresh_token_expires_in ?? null,
  }
}

// Programmatic refresh tokens: https://learn.microsoft.com/en-us/linkedin/shared/authentication/programmatic-refresh-tokens
// (checked 2026-10-31). An invalid, expired or revoked refresh token is a 400.
export async function renovarToken(entrada: Omit<App, "redirectUri"> & { refreshToken: string }): Promise<{
  token: string
  expiraEnSegundos: number
  refreshToken: string
  refreshTokenExpiraEnSegundos: number | null
}> {
  const secretos = [entrada.clientSecret, entrada.refreshToken]
  let respuesta: Response
  try {
    respuesta = await fetch(`${baseDe(process.env, "LINKEDIN_OAUTH_BASE_URL", BASE_OAUTH)}/oauth/v2/accessToken`, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        grant_type: "refresh_token",
        refresh_token: entrada.refreshToken,
        client_id: entrada.clientId,
        client_secret: entrada.clientSecret,
      }).toString(),
      signal: AbortSignal.timeout(ESPERA_MS),
    })
  } catch (error) {
    throw new Error("No pude conectar con LinkedIn al renovar la conexión.", { cause: error })
  }
  if (!respuesta.ok) {
    const detalle = sinSecretos((await respuesta.text()).slice(0, 300), secretos)
    const mensaje = `LinkedIn respondió HTTP ${respuesta.status} al renovar la conexión: ${detalle}`
    const deCliente =
      respuesta.status >= 400 && respuesta.status < 500 && respuesta.status !== 408 && respuesta.status !== 429
    if (deCliente) throw new RechazoDeLinkedin(respuesta.status, mensaje)
    throw new Error(mensaje)
  }
  let cuerpo: unknown
  try {
    cuerpo = await respuesta.json()
  } catch (error) {
    throw new Error("LinkedIn devolvió una respuesta ilegible al renovar la conexión.", { cause: error })
  }
  const leida = RespuestaDeToken.safeParse(cuerpo)
  if (!leida.success) throw new Error("LinkedIn devolvió una respuesta inesperada al renovar la conexión.")
  return {
    token: leida.data.access_token,
    expiraEnSegundos: leida.data.expires_in,
    refreshToken: leida.data.refresh_token ?? entrada.refreshToken,
    refreshTokenExpiraEnSegundos: leida.data.refresh_token_expires_in ?? null,
  }
}

const RespuestaDeUsuario = z.object({ sub: z.string().regex(/^[A-Za-z0-9_-]+$/), name: z.string().optional() })

/**
 * The author of a member's posts is `urn:li:person:{sub}`. The OIDC page does not say so in words: the first real
 * post of phase 0 is what proves it.
 */
export async function leerMiembro(entrada: { token: string }): Promise<{ miembro: string; nombre: string | null }> {
  const cuerpo = await pedir(
    `${baseDe(process.env, "LINKEDIN_API_BASE_URL", BASE_API)}/v2/userinfo`,
    { method: "GET", headers: { Authorization: `Bearer ${entrada.token}` } },
    [entrada.token],
  )
  const leido = RespuestaDeUsuario.safeParse(cuerpo)
  if (!leido.success) throw new Error("LinkedIn devolvió una respuesta inesperada en /v2/userinfo.")
  return { miembro: `urn:li:person:${leido.data.sub}`, nombre: leido.data.name?.trim() || null }
}

/**
 * The member behind a Community Management token, which has no OpenID Connect: `r_basicprofile` and `GET /v2/me`
 * (https://learn.microsoft.com/en-us/linkedin/shared/integrations/people/profile-api, checked 2026-10-31). The id is
 * per app, so it differs from the one the profile app sees.
 */
export async function leerMiembroPorMe(entrada: { token: string }): Promise<string> {
  const respuesta = await llamar(
    `${baseDe(process.env, "LINKEDIN_API_BASE_URL", BASE_API)}/v2/me`,
    { method: "GET", headers: { Authorization: `Bearer ${entrada.token}` } },
    "/v2/me",
    entrada.token,
  )
  const leido = z.object({ id: z.string().regex(/^[A-Za-z0-9_-]+$/) }).safeParse(await respuesta.json())
  if (!leido.success) throw new Error("LinkedIn devolvió una respuesta inesperada en /v2/me.")
  return `urn:li:person:${leido.data.id}`
}
