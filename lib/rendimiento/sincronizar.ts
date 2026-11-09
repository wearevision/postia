import {
  type CifrasDeUnPost,
  type cifrasDeLaPagina,
  type cifrasDeUnPostDelPerfil,
  LecturaDeLinkedinFallida,
  LLAMADAS_POR_POST_DEL_PERFIL,
  llamadasDeLaPagina,
  MENSAJE_RECONECTAR,
  type seguidoresDeLaPagina,
} from "@/lib/linkedin/analiticas"
import { ESPERA_MS } from "@/lib/linkedin/api"

// Trigger only (tests/unit/limites-del-worker.test.ts): it reads LinkedIn with the stored tokens. API figures never
// reach Claude (Developer AI Policy), and the profile's are member activity data kept 48 hours (see barrer_analiticas).

const DIA_MS = 86_400_000
const DIAS_DE_SEGUIDORES = 30
// Development tier: 100 calls per member per day. The profile costs 4 calls a post.
const POSTS_DEL_PERFIL = 10
const POSTS_DE_LA_PAGINA = 100

/** The costliest reading: the profile's posts, or the page's posts plus one call for its followers. */
export const LLAMADAS_MAXIMAS_POR_LECTURA = Math.max(
  POSTS_DEL_PERFIL * LLAMADAS_POR_POST_DEL_PERFIL,
  llamadasDeLaPagina(POSTS_DE_LA_PAGINA) + 1,
)
/** The task's maxDuration: every call timing out, one after the other, plus a minute. */
export const DURACION_MAXIMA_S = Math.ceil((LLAMADAS_MAXIMAS_POR_LECTURA * ESPERA_MS) / 1000) + 60
/** The reading's lease outlasts the task, so a slow run is cut off before its reading can be taken again. */
export const ARRIENDO_S = DURACION_MAXIMA_S + 5 * 60

const GENERICO = "No pude leer las cifras de LinkedIn. Inténtalo de nuevo en un rato."

export interface Credencial {
  token: string
  expiraEn: string
  /** The page's urn:li:organization; null for a profile. */
  organizacion: string | null
}

export type DatosDeAnaliticas = {
  publicaciones: { post_urn: string; impresiones: number; interacciones: number; clics: number | null }[]
  dias: { dia: string; seguidores_nuevos: number }[]
}

export interface PuertosDeAnaliticas {
  /** Leases the oldest open reading (one at a time). */
  tomar(): Promise<{ id: string; cuentaId: string }[]>
  terminar(id: string, estado: "lista" | "fallo", motivo?: string): Promise<void>
  tipoDeCuenta(cuentaId: string): Promise<"persona" | "empresa">
  credencial(cuentaId: string, tipo: "persona" | "empresa"): Promise<Credencial | null>
  /** Post URNs PostIA published for the account in the last 12 months, newest first. */
  postsDePostia(cuentaId: string): Promise<string[]>
  guardar(cuentaId: string, datos: DatosDeAnaliticas): Promise<{ publicaciones: number; dias: number }>
  linkedin: {
    cifrasDeLaPagina: typeof cifrasDeLaPagina
    seguidoresDeLaPagina: typeof seguidoresDeLaPagina
    cifrasDeUnPostDelPerfil: typeof cifrasDeUnPostDelPerfil
  }
  ahora(): number
}

const plural = (n: number, uno: string, varios: string) => `${n} ${n === 1 ? uno : varios}`

function ordenar(cifras: CifrasDeUnPost[]): DatosDeAnaliticas["publicaciones"] {
  return cifras.map((c) => ({
    post_urn: c.urn,
    impresiones: c.impresiones,
    interacciones: c.interacciones,
    clics: c.clics,
  }))
}

async function leerLaPagina(p: PuertosDeAnaliticas, cuentaId: string, credencial: Credencial): Promise<string> {
  const { token, organizacion } = credencial
  if (!organizacion) throw new LecturaDeLinkedinFallida("reconectar", MENSAJE_RECONECTAR)
  const posts = (await p.postsDePostia(cuentaId)).slice(0, POSTS_DE_LA_PAGINA)
  const cifras = posts.length > 0 ? await p.linkedin.cifrasDeLaPagina({ token, organizacion, posts }) : []

  // The last follower data point is two days before the request: 30 days ending yesterday (UTC), end exclusive.
  const hasta = Math.floor(p.ahora() / DIA_MS) * DIA_MS - DIA_MS
  const dias = await p.linkedin.seguidoresDeLaPagina({
    token,
    organizacion,
    desde: hasta - DIAS_DE_SEGUIDORES * DIA_MS,
    hasta,
  })
  await p.guardar(cuentaId, {
    publicaciones: ordenar(cifras),
    dias: dias.map((d) => ({ dia: d.dia, seguidores_nuevos: d.seguidoresNuevos })),
  })
  return `Leí ${plural(cifras.length, "publicación", "publicaciones")} y ${plural(dias.length, "día", "días")} de seguidores.`
}

async function leerElPerfil(p: PuertosDeAnaliticas, cuentaId: string, credencial: Credencial): Promise<string> {
  const urns = (await p.postsDePostia(cuentaId)).slice(0, POSTS_DEL_PERFIL)
  const cifras: DatosDeAnaliticas["publicaciones"] = []
  let fallidas = 0
  let detenida: LecturaDeLinkedinFallida | null = null
  for (const urn of urns) {
    try {
      const { impresiones, interacciones } = await p.linkedin.cifrasDeUnPostDelPerfil({ token: credencial.token, urn })
      cifras.push({ post_urn: urn, impresiones, interacciones, clics: null })
    } catch (error) {
      if (error instanceof LecturaDeLinkedinFallida) {
        detenida = error
        break
      }
      console.error(`No pude leer un post del perfil (${error instanceof Error ? error.name : typeof error}).`)
      fallidas++
    }
  }
  // What was read before a stop is kept: the next run refreshes it.
  if (cifras.length > 0) await p.guardar(cuentaId, { publicaciones: cifras, dias: [] })
  if (detenida) throw detenida
  if (cifras.length === 0 && fallidas > 0) {
    throw new LecturaDeLinkedinFallida(
      "sin_cifras",
      "No pude leer ninguna publicación en LinkedIn. Inténtalo de nuevo en un rato.",
    )
  }
  const resumen = `Leí ${plural(cifras.length, "publicación", "publicaciones")}.`
  return fallidas > 0
    ? `${resumen} ${fallidas} ${fallidas === 1 ? "no se pudo leer" : "no se pudieron leer"}.`
    : resumen
}

async function leerUna(p: PuertosDeAnaliticas, cuentaId: string): Promise<string> {
  const tipo = await p.tipoDeCuenta(cuentaId)
  const credencial = await p.credencial(cuentaId, tipo)
  if (!credencial || Date.parse(credencial.expiraEn) <= p.ahora()) {
    throw new LecturaDeLinkedinFallida("reconectar", MENSAJE_RECONECTAR)
  }
  return tipo === "empresa" ? leerLaPagina(p, cuentaId, credencial) : leerElPerfil(p, cuentaId, credencial)
}

/**
 * One reading per run, no retries: a failure the owner can act on closes it «fallo» with words for them, and LinkedIn's
 * own answer (token removed) goes to the logs; anything else closes it with a generic notice, is logged by its kind only
 * (never its message) and rethrown after the loop.
 */
export async function leerAnaliticas(p: PuertosDeAnaliticas): Promise<{ leidas: number; fallidas: number }> {
  const lecturas = await p.tomar()
  const inesperados: unknown[] = []
  let fallidas = 0
  for (const lectura of lecturas) {
    try {
      await p.terminar(lectura.id, "lista", await leerUna(p, lectura.cuentaId))
    } catch (error) {
      fallidas++
      const esperado = error instanceof LecturaDeLinkedinFallida
      if (esperado && error.detalle) console.warn(`La lectura de analíticas ${lectura.id} falló: ${error.detalle}`)
      if (!esperado) {
        console.error(
          `La lectura de analíticas ${lectura.id} falló (${error instanceof Error ? error.name : typeof error}).`,
        )
        inesperados.push(error)
      }
      try {
        await p.terminar(lectura.id, "fallo", esperado ? error.message : GENERICO)
      } catch (errorAlTerminar) {
        inesperados.push(errorAlTerminar)
      }
    }
  }
  if (inesperados.length === 1) throw inesperados[0]
  if (inesperados.length > 1)
    throw new AggregateError(inesperados, "Hubo lecturas de analíticas con errores inesperados")
  return { leidas: lecturas.length - fallidas, fallidas }
}
