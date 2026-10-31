import { z } from "zod"
import { FallaDeConfiguracion } from "@/lib/dominio/falla"
import { baseDe } from "@/lib/proveedores/bases"
import { esUrnDePost } from "./dominio"

// Versioned REST APIs for a member, checked on learn.microsoft.com on 2026-10-28: Posts API (ms.date 2026-05-07),
// Post schema (2026-02-13) and Documents API (2026-06-19), default moniker li-lms-2026-10. Version 202511 sunsets on
// 2026-11-16; each version lives at least a year, so bump this with a reviewed commit when it nears its sunset.
export const VERSION_DE_LINKEDIN = "202610"

const BASE_API = "https://api.linkedin.com"
const ESPERA_MS = 30_000
const ESPERA_SUBIDA_MS = 120_000

/** 401: expired or revoked. The owner renews it in Ajustes. */
export class TokenDeLinkedinVencido extends FallaDeConfiguracion {
  constructor(mensaje: string) {
    super(mensaje)
    this.name = "TokenDeLinkedinVencido"
  }
}

/** A definitive "no" (4xx other than 401, 408, 429), including 426 for a sunset version. */
export class RechazoDeLinkedin extends FallaDeConfiguracion {
  constructor(
    readonly http: number,
    mensaje: string,
  ) {
    super(mensaje)
    this.name = "RechazoDeLinkedin"
  }
}

/** The post may or may not exist: a person checks the profile; it is never sent again. */
export class RespuestaDudosa extends Error {
  constructor(mensaje: string) {
    super(mensaje)
    this.name = "RespuestaDudosa"
  }
}

export type Visibilidad = "PUBLIC" | "CONNECTIONS"

const base = () => baseDe(process.env, "LINKEDIN_API_BASE_URL", BASE_API)

export function cabeceras(token: string): Record<string, string> {
  return {
    Authorization: `Bearer ${token}`,
    "Linkedin-Version": VERSION_DE_LINKEDIN,
    "X-Restli-Protocol-Version": "2.0.0",
    "Content-Type": "application/json",
  }
}

export async function llamar(
  url: string,
  init: RequestInit,
  ruta: string,
  token: string,
  espera = ESPERA_MS,
): Promise<Response> {
  let respuesta: Response
  try {
    respuesta = await fetch(url, { ...init, signal: AbortSignal.timeout(espera) })
  } catch (error) {
    // Deliberately without the URL: an upload URL is a credential.
    throw new Error(`No pude conectar con LinkedIn en ${ruta}.`, { cause: error })
  }
  if (respuesta.ok) return respuesta
  const detalle = (await respuesta.text()).slice(0, 300).split(token).join("[x]")
  const mensaje = `LinkedIn respondió HTTP ${respuesta.status} en ${ruta}: ${detalle}`
  if (respuesta.status === 401) throw new TokenDeLinkedinVencido(mensaje)
  if (respuesta.status >= 400 && respuesta.status < 500 && respuesta.status !== 408 && respuesta.status !== 429) {
    throw new RechazoDeLinkedin(respuesta.status, mensaje)
  }
  throw new Error(mensaje)
}

function esDireccionDeLinkedin(direccion: string): boolean {
  const url = new URL(direccion)
  if (url.origin === new URL(base()).origin) return true
  if (url.protocol !== "https:") return false
  return ["linkedin.com", "licdn.com"].some((d) => url.hostname === d || url.hostname.endsWith(`.${d}`))
}

const DocumentoIniciado = z.object({
  value: z.object({ uploadUrl: z.url(), document: z.string().regex(/^urn:li:document:[A-Za-z0-9_-]+$/) }),
})

/** A carousel's PDF: initializeUpload for the member, then one PUT of the whole file. Returns the document URN. */
export async function subirDocumento(entrada: { token: string; autor: string; datos: Uint8Array }): Promise<string> {
  const { token, autor, datos } = entrada
  const inicio = await llamar(
    `${base()}/rest/documents?action=initializeUpload`,
    { method: "POST", headers: cabeceras(token), body: JSON.stringify({ initializeUploadRequest: { owner: autor } }) },
    "initializeUpload del documento",
    token,
  )
  const leida = DocumentoIniciado.safeParse(await inicio.json())
  if (!leida.success) throw new Error("LinkedIn devolvió una respuesta inesperada en initializeUpload del documento.")
  const { uploadUrl, document } = leida.data.value
  // The documented PUT carries the member's token: it goes only to LinkedIn over https.
  if (!esDireccionDeLinkedin(uploadUrl)) {
    throw new RechazoDeLinkedin(inicio.status, "LinkedIn devolvió una dirección de subida que no es suya.")
  }
  await llamar(
    uploadUrl,
    {
      method: "PUT",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/octet-stream" },
      body: datos.slice(),
    },
    "la subida del documento",
    token,
    ESPERA_SUBIDA_MS,
  )
  return document
}

export type EstadoDeDocumento = "listo" | "procesando" | "fallido"

/** AVAILABLE is ready; PROCESSING_FAILED failed; WAITING_UPLOAD and PROCESSING are still on their way. */
export async function estadoDelDocumento(entrada: { token: string; documento: string }): Promise<EstadoDeDocumento> {
  const respuesta = await llamar(
    `${base()}/rest/documents/${encodeURIComponent(entrada.documento)}`,
    { method: "GET", headers: cabeceras(entrada.token) },
    "el estado del documento",
    entrada.token,
  )
  const leido = z.object({ status: z.string() }).safeParse(await respuesta.json())
  if (!leido.success) throw new Error("LinkedIn devolvió una respuesta inesperada al leer el documento.")
  if (leido.data.status === "AVAILABLE") return "listo"
  if (leido.data.status === "PROCESSING_FAILED") return "fallido"
  return "procesando"
}

export type PedidoDePost = { token: string; autor: string; commentary: string; visibilidad: Visibilidad } & (
  | { documento?: undefined }
  | { documento: string; titulo: string }
)

/** The 201 carries the post URN in `x-restli-id`. A text post has no `content`; a document needs its title. */
export async function crearPost(pedido: PedidoDePost): Promise<string> {
  const respuesta = await llamar(
    `${base()}/rest/posts`,
    {
      method: "POST",
      headers: cabeceras(pedido.token),
      body: JSON.stringify({
        author: pedido.autor,
        commentary: pedido.commentary,
        visibility: pedido.visibilidad,
        distribution: { feedDistribution: "MAIN_FEED", targetEntities: [], thirdPartyDistributionChannels: [] },
        ...(pedido.documento ? { content: { media: { id: pedido.documento, title: pedido.titulo } } } : {}),
        lifecycleState: "PUBLISHED",
        isReshareDisabledByAuthor: false,
      }),
    },
    "posts",
    pedido.token,
  )
  const urn = respuesta.headers.get("x-restli-id")?.trim() ?? ""
  if (!esUrnDePost(urn)) throw new RespuestaDudosa(`LinkedIn respondió ${respuesta.status} sin un id de post válido.`)
  return urn
}
