import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod"
import { Falla } from "@/lib/dominio/falla"
import type { Pedir, RespuestaDeClaude } from "@/lib/ia/claude"
import { UMBRALES } from "@/lib/mapa/umbrales"
import { type InformeDeSerie, mensajeDeOtraIdea, mensajeDeSerie, sistemaDeSerie } from "./instrucciones"
import {
  type CuentaDeSerie,
  type FormatoDeIdea,
  type IdeaValidada,
  quitarParecidas,
  Serie,
  validarSerie,
} from "./propuestas"

// Trigger.dev only: imports the SDK helper (tests/unit/limites-del-worker.test.ts keeps it out of the Worker).

/** A series job of 4e's research queue: «serie» for a report, «otra_idea» to replace one proposal. */
export interface TrabajoDeSerie {
  id: string
  tipo: "serie" | "otra_idea"
  investigacionId: string
  /** Only for «otra_idea»: the proposal it replaces. */
  ideaId: string | null
}

export interface IdeaAGuardar extends IdeaValidada {
  vector: number[]
  reemplazaA?: string
}

export interface PuertosDeSerie {
  pedir: Pedir
  /** One paid Voyage call, vectors in input order. */
  embeberIdeas(clave: string, textos: string[]): Promise<number[][]>
  /** The approved report: `hallazgos` in the flat order that numbers them in the prompt. */
  informeDeSerie(investigacionId: string): Promise<InformeDeSerie & { cantidad: number }>
  /** Accounts with a weekly rhythm above zero. */
  cuentasDeSerie(): Promise<CuentaDeSerie[]>
  noNombrar(): Promise<string[]>
  /** Hooks of the latest ideas, newest first. */
  ideasPrevias(): Promise<string[]>
  /** Ids of earlier ideas at or above `umbral` (every state but reemplazada). */
  ideasParecidas(vector: number[], umbral: number): Promise<string[]>
  ideaAReemplazar(
    ideaId: string,
  ): Promise<{ gancho: string; resumen: string; formato: FormatoDeIdea; hermanas: string[] }>
  guardarSerie(investigacionId: string, ideas: IdeaAGuardar[]): Promise<string[]>
}

export interface ResultadoDeSerie {
  guardadas: number
  /** Dropped as too close to another idea of the series or to an earlier one. */
  parecidas: number
  /** Dropped by validarSerie. */
  invalidas: number
}

const MODELO = "claude-opus-5-5" as const
const ILEGIBLE = "Claude devolvió ideas que no pude leer. Pide la serie de nuevo."
const SIN_CUENTAS = "No hay cuentas con ritmo de publicación para proponer ideas."
const SIN_VALIDAS = "Claude no propuso ideas que pueda usar con este informe. Pide la serie de nuevo."
const TODAS_PARECIDAS = "No salieron ideas nuevas de este informe: se parecían a ideas anteriores."
const OTRA_PARECIDA = "La idea nueva se parecía a otra anterior. Pide otra de nuevo."

// guardar_serie's 22023 refusals: validarSerie should have caught them, so reaching one means the data moved under
// the job (an account, pillar or proposal changed) or the two checks drifted apart.
const AL_GUARDAR: Record<string, string> = {
  ideas_invalidas: "Claude propuso ideas que no se pueden guardar. Pide la serie de nuevo.",
  investigacion_no_aprobada: "El informe ya no está aprobado, así que no guardé la serie.",
  cuenta_desconocida: "Una idea sugería una cuenta que ya no existe. Pide la serie de nuevo.",
  pilar_no_valido: "Una idea traía un pilar que ya no es de su cuenta. Pide la serie de nuevo.",
  fuente_ajena: "Una idea citaba un hallazgo que no es de este informe. Pide la serie de nuevo.",
  esqueleto_no_valido: "Claude propuso un esqueleto que no se puede guardar. Pide la serie de nuevo.",
  idea_no_reemplazable: "La idea que pediste reemplazar ya no espera tu revisión.",
}

/** A readable Falla for a known refusal of guardar_serie; null for anything else, which stays unexpected. */
export function fallaDeGuardarSerie(error: { code?: string; message: string }): Falla | null {
  if (error.code !== "22023" || !Object.hasOwn(AL_GUARDAR, error.message)) return null
  return new Falla(AL_GUARDAR[error.message])
}

function leerSerie(respuesta: RespuestaDeClaude): Serie {
  if (respuesta.detenido === "refusal") throw new Falla("Claude no quiso proponer ideas con este informe.")
  if (respuesta.detenido === "max_tokens") throw new Falla("La serie de Claude quedó cortada. Pídela de nuevo.")
  let datos: unknown
  try {
    datos = JSON.parse(respuesta.texto)
  } catch (error) {
    console.error("Claude devolvió JSON inválido", error instanceof Error ? error.message : String(error))
    throw new Falla(ILEGIBLE)
  }
  const leida = Serie.safeParse(datos)
  if (!leida.success) throw new Falla(ILEGIBLE)
  return leida.data
}

async function contexto(p: PuertosDeSerie, investigacionId: string) {
  const [informe, cuentas, noNombrar] = await Promise.all([
    p.informeDeSerie(investigacionId),
    p.cuentasDeSerie(),
    p.noNombrar(),
  ])
  if (cuentas.length === 0) throw new Falla(SIN_CUENTAS)
  return { informe, cuentas, noNombrar }
}

/**
 * Vectors for the ideas (one paid call), then the ones not too close to a kept one or to an earlier idea. Shared with
 * 4g's crosses and Sunday ideas (lib/ideas).
 */
export async function distintas(
  p: Pick<PuertosDeSerie, "embeberIdeas" | "ideasParecidas">,
  clave: string,
  ideas: IdeaValidada[],
): Promise<IdeaAGuardar[]> {
  const vectores = await p.embeberIdeas(
    clave,
    ideas.map((i) => `${i.gancho}\n${i.resumen}`),
  )
  const dentro = quitarParecidas(
    ideas.map((idea, n) => ({ ...idea, vector: vectores[n] ?? [] })),
    UMBRALES.idea,
  )
  const quedan: IdeaAGuardar[] = []
  for (const idea of dentro) {
    if ((await p.ideasParecidas(idea.vector, UMBRALES.idea)).length === 0) quedan.push(idea)
  }
  return quedan
}

/** Plano «Armar la serie»: Claude proposes, the app validates, Voyage drops repeats, the rest waits in «Ideas y series». */
export async function armarSerie(p: PuertosDeSerie, trabajo: TrabajoDeSerie): Promise<ResultadoDeSerie> {
  const { informe, cuentas, noNombrar } = await contexto(p, trabajo.investigacionId)
  const previas = await p.ideasPrevias()
  const respuesta = await p.pedir(
    { clave: `serie:${trabajo.id}`, paso: "serie", marcaId: null },
    {
      modelo: MODELO,
      sistema: sistemaDeSerie(cuentas, noNombrar),
      mensajes: [{ role: "user", content: mensajeDeSerie(informe, informe.cantidad, previas) }],
      maxTokens: 16_000,
      esfuerzo: "high",
      formato: zodOutputFormat(Serie),
    },
  )
  const validada = validarSerie(leerSerie(respuesta), { cuentas, hallazgos: informe.hallazgos })
  const pedidas = validada.ideas.slice(0, informe.cantidad)
  if (pedidas.length === 0) throw new Falla(SIN_VALIDAS)
  const quedan = await distintas(p, `serie:${trabajo.id}:vectores`, pedidas)
  if (quedan.length === 0) throw new Falla(TODAS_PARECIDAS)
  await p.guardarSerie(trabajo.investigacionId, quedan)
  return {
    guardadas: quedan.length,
    parecidas: pedidas.length - quedan.length,
    invalidas: validada.descartadas.length,
  }
}

/** «Pedir otra»: one replacement, distinct from its siblings; guardar_serie marks the old one reemplazada. */
export async function otraIdea(p: PuertosDeSerie, trabajo: TrabajoDeSerie): Promise<ResultadoDeSerie> {
  if (!trabajo.ideaId) throw new Error(`El trabajo ${trabajo.id} no dice qué idea reemplazar`)
  const ideaId = trabajo.ideaId
  const [{ informe, cuentas, noNombrar }, vieja] = await Promise.all([
    contexto(p, trabajo.investigacionId),
    p.ideaAReemplazar(ideaId),
  ])
  const respuesta = await p.pedir(
    { clave: `otra:${trabajo.id}`, paso: "otra_idea", marcaId: null },
    {
      modelo: MODELO,
      sistema: sistemaDeSerie(cuentas, noNombrar),
      mensajes: [{ role: "user", content: mensajeDeOtraIdea(vieja, informe, vieja.hermanas) }],
      maxTokens: 8_000,
      esfuerzo: "medium",
      formato: zodOutputFormat(Serie),
    },
  )
  const validada = validarSerie(leerSerie(respuesta), { cuentas, hallazgos: informe.hallazgos })
  const primera = validada.ideas[0]
  if (!primera) throw new Falla("Claude no propuso otra idea que pueda usar. Pídela de nuevo.")
  const [nueva] = await distintas(p, `otra:${trabajo.id}:vectores`, [primera])
  if (!nueva) throw new Falla(OTRA_PARECIDA)
  await p.guardarSerie(trabajo.investigacionId, [{ ...nueva, reemplazaA: ideaId }])
  return { guardadas: 1, parecidas: 0, invalidas: validada.descartadas.length }
}
