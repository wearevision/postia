import { z } from "zod"
import { baseDe } from "@/lib/proveedores/bases"
import { cabeceras, LimiteDeLinkedin, llamar, RechazoDeLinkedin, TokenDeLinkedinVencido } from "./api"

// Community Management API, li-lms-2026-10 (checked on learn.microsoft.com on 2026-11-09):
// - Organization Share Statistics: .../linkedin/marketing/community-management/organizations/share-statistics
//   lifetime figures per share (`shares=List(...)`) or per UGC post (`ugcPosts`, answered under `ugcPost`); no
//   pagination, rolling 12 months, posts without activity are left out. The Posts API answers either URN kind in
//   x-restli-id (.../community-management/shares/posts-api), so both are read.
// - Organization Follower Statistics: .../community-management/organizations/follower-statistics
//   time-bound `timeIntervals`, data from 12 months back to 2 days before the request.
// - Member Post Statistics: .../community-management/members/post-statistics
//   `q=entity`, `entity=(share:<urn>)` or `(ugc:<urn>)`, one metric per call; `metricType` became a plain string in 202605.

const BASE_API = "https://api.linkedin.com"
const SHARES_POR_LLAMADA = 20
const METRICAS_DEL_PERFIL = ["IMPRESSION", "REACTION", "COMMENT", "RESHARE"] as const
const URN_DE_ORGANIZACION = /^urn:li:organization:[0-9]+$/
const URN_DE_POST = /^urn:li:(share|ugcPost):[0-9]+$/

export const MENSAJE_RECONECTAR = "Reconecta LinkedIn desde Ajustes: la conexión venció o ya no tiene el permiso."
export const MENSAJE_LIMITE = "LinkedIn limitó las llamadas por hoy. Inténtalo mañana."

/** A failure the owner can act on, worded for them. `motivo` tells the task whether to stop the whole run. */
export class LecturaDeLinkedinFallida extends Error {
  constructor(
    readonly motivo: "reconectar" | "limite" | "sin_cifras",
    mensaje: string,
  ) {
    super(mensaje)
    this.name = "LecturaDeLinkedinFallida"
  }
}

const base = () => baseDe(process.env, "LINKEDIN_API_BASE_URL", BASE_API)

/** 401 and 403 mean reconnect; 429 means the daily limit. Everything else keeps its own error. */
async function pedir(token: string, ruta: string, consulta: string) {
  try {
    const respuesta = await llamar(
      `${base()}/rest/${ruta}?${consulta}`,
      { method: "GET", headers: cabeceras(token) },
      ruta,
      token,
    )
    return await respuesta.json()
  } catch (error) {
    if (error instanceof TokenDeLinkedinVencido || (error instanceof RechazoDeLinkedin && error.http === 403)) {
      throw new LecturaDeLinkedinFallida("reconectar", MENSAJE_RECONECTAR)
    }
    if (error instanceof LimiteDeLinkedin) throw new LecturaDeLinkedinFallida("limite", MENSAJE_LIMITE)
    throw error
  }
}

function inesperada(ruta: string): never {
  throw new Error(`LinkedIn devolvió una respuesta inesperada en ${ruta}.`)
}

const Cantidad = z.number().default(0)
const Elementos = <T extends z.ZodType>(elemento: T) => z.object({ elements: z.array(elemento) })

const EstadisticasDeShares = Elementos(
  z.object({
    share: z.string().optional(),
    ugcPost: z.string().optional(),
    totalShareStatistics: z.object({
      clickCount: Cantidad,
      commentCount: Cantidad,
      impressionCount: Cantidad,
      likeCount: Cantidad,
      shareCount: Cantidad,
    }),
  }),
)

export interface CifrasDeUnPost {
  urn: string
  impresiones: number
  interacciones: number
  clics: number
}

const noNegativo = (n: number) => Math.max(0, n)

/**
 * Lifetime figures of the page's posts (organic only), share and ugcPost URNs alike: each kind goes in its own list
 * (`shares` or `ugcPosts`), 20 to a call. A post missing from the answer had no activity: zeros.
 */
export async function cifrasDeLaPagina(entrada: {
  token: string
  organizacion: string
  posts: readonly string[]
}): Promise<CifrasDeUnPost[]> {
  const { token, organizacion, posts } = entrada
  if (!URN_DE_ORGANIZACION.test(organizacion))
    throw new Error("La página debe ser un urn:li:organization con su número.")
  if (posts.some((s) => !URN_DE_POST.test(s))) throw new Error("Solo se piden cifras de posts de LinkedIn.")
  const porUrn = new Map<string, CifrasDeUnPost>()
  for (const [tipo, parametro, clave] of [
    ["share", "shares", "share"],
    ["ugcPost", "ugcPosts", "ugcPost"],
  ] as const) {
    const delTipo = posts.filter((u) => u.startsWith(`urn:li:${tipo}:`))
    for (let i = 0; i < delTipo.length; i += SHARES_POR_LLAMADA) {
      const lote = delTipo.slice(i, i + SHARES_POR_LLAMADA)
      const consulta = [
        "q=organizationalEntity",
        `organizationalEntity=${encodeURIComponent(organizacion)}`,
        `${parametro}=List(${lote.map(encodeURIComponent).join(",")})`,
      ].join("&")
      const leida = EstadisticasDeShares.safeParse(await pedir(token, "organizationalEntityShareStatistics", consulta))
      if (!leida.success) inesperada("organizationalEntityShareStatistics")
      const respuesta = new Map(leida.data.elements.map((e) => [e[clave], e.totalShareStatistics]))
      for (const urn of lote) {
        const e = respuesta.get(urn)
        porUrn.set(urn, {
          urn,
          impresiones: noNegativo(e?.impressionCount ?? 0),
          // likeCount can go negative when a member unlikes a sponsored share.
          interacciones: noNegativo((e?.likeCount ?? 0) + (e?.commentCount ?? 0) + (e?.shareCount ?? 0)),
          clics: noNegativo(e?.clickCount ?? 0),
        })
      }
    }
  }
  return posts.flatMap((urn) => {
    const cifras = porUrn.get(urn)
    return cifras ? [cifras] : []
  })
}

/** Calls the page's posts cost at most: each kind is batched apart, so a split list can take one call more. */
export function llamadasDeLaPagina(posts: number): number {
  return posts === 0 ? 0 : Math.ceil(posts / SHARES_POR_LLAMADA) + 1
}

const SeguidoresPorDia = Elementos(
  z.object({
    timeRange: z.object({ start: z.number() }),
    followerGains: z.object({ organicFollowerGain: Cantidad, paidFollowerGain: Cantidad }),
  }),
)

/** Followers gained per UTC day, organic and paid together, between two instants (ms, end exclusive). */
export async function seguidoresDeLaPagina(entrada: {
  token: string
  organizacion: string
  desde: number
  hasta: number
}): Promise<{ dia: string; seguidoresNuevos: number }[]> {
  const { token, organizacion, desde, hasta } = entrada
  if (!URN_DE_ORGANIZACION.test(organizacion))
    throw new Error("La página debe ser un urn:li:organization con su número.")
  const consulta = [
    "q=organizationalEntity",
    `organizationalEntity=${encodeURIComponent(organizacion)}`,
    `timeIntervals=(timeRange:(start:${desde},end:${hasta}),timeGranularityType:DAY)`,
  ].join("&")
  const leida = SeguidoresPorDia.safeParse(await pedir(token, "organizationalEntityFollowerStatistics", consulta))
  if (!leida.success) inesperada("organizationalEntityFollowerStatistics")
  return leida.data.elements.map((e) => ({
    dia: new Date(e.timeRange.start).toISOString().slice(0, 10),
    seguidoresNuevos: noNegativo(e.followerGains.organicFollowerGain + e.followerGains.paidFollowerGain),
  }))
}

// Until 202604 the metric came wrapped in an object keyed by its Java type; since 202605 it is the plain string.
const NombreDeMetrica = z.union([
  z.string(),
  z.record(z.string(), z.string()).transform((o) => Object.values(o)[0] ?? ""),
])
const AnaliticasDelPerfil = Elementos(z.object({ count: z.number(), metricType: NombreDeMetrica }))

function entidadDelPerfil(urn: string): string {
  const [, tipo] = URN_DE_POST.exec(urn) ?? []
  if (!tipo) throw new Error("No es un post de LinkedIn.")
  return `(${tipo === "share" ? "share" : "ugc"}:${encodeURIComponent(urn)})`
}

/**
 * The member's own post: impressions, and reactions + comments + reposts as interactions, one call per metric (four).
 * A metric the answer leaves out counts as zero. Not stored past 48 hours (member social activity).
 */
export async function cifrasDeUnPostDelPerfil(entrada: {
  token: string
  urn: string
}): Promise<{ impresiones: number; interacciones: number }> {
  const { token, urn } = entrada
  const entidad = entidadDelPerfil(urn)
  const cuentas: Record<string, number> = {}
  for (const metrica of METRICAS_DEL_PERFIL) {
    const consulta = `q=entity&entity=${entidad}&queryType=${metrica}&aggregation=TOTAL`
    const leida = AnaliticasDelPerfil.safeParse(await pedir(token, "memberCreatorPostAnalytics", consulta))
    if (!leida.success) inesperada("memberCreatorPostAnalytics")
    cuentas[metrica] = leida.data.elements.find((e) => e.metricType === metrica)?.count ?? 0
  }
  return {
    impresiones: noNegativo(cuentas.IMPRESSION ?? 0),
    interacciones: noNegativo((cuentas.REACTION ?? 0) + (cuentas.COMMENT ?? 0) + (cuentas.RESHARE ?? 0)),
  }
}

/** Calls one profile post costs: the Development tier allows 100 per member per day. */
export const LLAMADAS_POR_POST_DEL_PERFIL = METRICAS_DEL_PERFIL.length
