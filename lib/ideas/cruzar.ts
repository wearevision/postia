import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod"
import type { z } from "zod"
import { Falla } from "@/lib/dominio/falla"
import type { Pedir, RespuestaDeClaude } from "@/lib/ia/claude"
import { distintas, type IdeaAGuardar, type ResultadoDeSerie } from "@/lib/series/armar"
import type { CuentaDeSerie, FormatoDeIdea, IdeaValidada } from "@/lib/series/propuestas"
import {
  type HallazgoDeCruce,
  mensajeDeCruces,
  mensajeDeOtraDelDomingo,
  mensajeDeOtroCruce,
  type ParDeHallazgos,
  sistemaDeCruces,
  sistemaDelDomingo,
} from "./instrucciones"
import { Cruces, IdeasDelDomingo, validarCruces, validarIdeasDelDomingo } from "./propuestas"

// Trigger.dev only: imports the SDK helper (tests/unit/limites-del-worker.test.ts keeps it out of the Worker).

/** Plano «Cruzar hallazgos»: a run (Sunday or an approved report) crosses at most this many pairs. */
export const CRUCES_POR_CORRIDA = 3

export const MODELO = "claude-opus-5-5" as const

export type OrigenSuelto = "cruce" | "domingo"
export type ResultadoDeIdeas = ResultadoDeSerie

/** The crosses of an approved report (4e's queue): that report's findings against the rest of the map. */
export interface TrabajoDeCruces {
  id: string
  tipo: "cruces"
  investigacionId: string
}

/** «Pedir otra» on a cross or a Sunday idea: a job of 4e's queue with no research. */
export interface TrabajoDeIdeaSuelta {
  id: string
  tipo: "otra_idea"
  investigacionId: null
  ideaId: string
}

export interface PuertosDeIdeasSueltas {
  pedir: Pedir
  /** One paid Voyage call, vectors in input order. */
  embeberIdeas(clave: string, textos: string[]): Promise<number[][]>
  /** Accounts with a weekly rhythm above zero. */
  cuentasDeSerie(): Promise<CuentaDeSerie[]>
  noNombrar(): Promise<string[]>
  /** Ids of earlier ideas at or above `umbral` (every state but reemplazada). */
  ideasParecidas(vector: number[], umbral: number): Promise<string[]>
  /** guardar_ideas_sueltas: ideas with no research; one with `reemplazaA` takes that proposal's place. */
  guardarIdeasSueltas(origen: OrigenSuelto, ideas: IdeaAGuardar[]): Promise<string[]>
}

export interface PuertosDeCruce extends PuertosDeIdeasSueltas {
  /** pares_para_cruzar in UMBRALES.cruce's band, best first. With a research, side A is its findings. */
  paresParaCruzar(o: { desde: number; limite: number; investigacionId?: string }): Promise<ParDeHallazgos[]>
  /** Pairs whose cross was dropped as near-duplicate: pares_para_cruzar never offers them again. */
  descartarPares(pares: { a: string; b: string }[]): Promise<void>
}

export interface IdeaSueltaAReemplazar {
  origen: OrigenSuelto
  gancho: string
  resumen: string
  formato: FormatoDeIdea
  /** Its findings still on the map (not discarded), in the idea's order. */
  fuentes: HallazgoDeCruce[]
}

export interface PuertosDeOtraSuelta extends PuertosDeIdeasSueltas {
  ideaSueltaAReemplazar(ideaId: string): Promise<IdeaSueltaAReemplazar>
}

const SIN_CUENTAS = "No hay cuentas con ritmo de publicación para proponer ideas."
const ILEGIBLE = "Claude devolvió ideas que no pude leer."

// guardar_ideas_sueltas's 22023 refusals: the validation should have caught them, so reaching one means the data moved
// under the run (an account, pillar, finding or proposal changed) or the two checks drifted apart.
const AL_GUARDAR: Record<string, string> = {
  origen_no_valido: "Las ideas sueltas solo pueden ser cruces o ideas del domingo.",
  ideas_invalidas: "Claude propuso ideas que no se pueden guardar.",
  cuenta_desconocida: "Una idea sugería una cuenta que ya no existe.",
  pilar_no_valido: "Una idea traía un pilar que ya no es de su cuenta.",
  fuente_no_valida: "Una idea citaba un hallazgo que ya no está en el mapa.",
  cruce_sin_dos_fuentes: "Un cruce no traía sus dos hallazgos.",
  esqueleto_no_valido: "Claude propuso un esqueleto que no se puede guardar.",
  idea_no_reemplazable: "La idea que pediste reemplazar ya no espera tu revisión.",
}

/** A readable Falla for a known refusal of guardar_ideas_sueltas; null for anything else, which stays unexpected. */
export function fallaDeGuardarIdeasSueltas(error: { code?: string; message: string }): Falla | null {
  if (error.code !== "22023" || !Object.hasOwn(AL_GUARDAR, error.message)) return null
  return new Falla(AL_GUARDAR[error.message])
}

/** Claude's structured answer, or a Falla saying why it cannot be used. */
export function leerRespuesta<T>(respuesta: RespuestaDeClaude, esquema: z.ZodType<T>): T {
  if (respuesta.detenido === "refusal") throw new Falla("Claude no quiso proponer ideas con estos hallazgos.")
  if (respuesta.detenido === "max_tokens") throw new Falla("Las ideas de Claude quedaron cortadas.")
  let datos: unknown
  try {
    datos = JSON.parse(respuesta.texto)
  } catch (error) {
    console.error("Claude devolvió JSON inválido", error instanceof Error ? error.message : String(error))
    throw new Falla(ILEGIBLE)
  }
  const leida = esquema.safeParse(datos)
  if (!leida.success) throw new Falla(ILEGIBLE)
  return leida.data
}

export async function cuentasYVetados(p: PuertosDeIdeasSueltas) {
  const [cuentas, noNombrar] = await Promise.all([p.cuentasDeSerie(), p.noNombrar()])
  if (cuentas.length === 0) throw new Falla(SIN_CUENTAS)
  return { cuentas, noNombrar }
}

/**
 * Embeds the ideas under `<clave>:vectores`, drops near-duplicates and saves the rest; nothing valid pays nothing.
 * `parecidas` receives the ideas dropped as near-duplicates, after the save.
 */
export async function guardarDistintas(
  p: PuertosDeIdeasSueltas,
  o: {
    clave: string
    origen: OrigenSuelto
    ideas: IdeaValidada[]
    invalidas: number
    repetidas?: number
    parecidas?: (ideas: IdeaValidada[]) => Promise<void>
  },
): Promise<ResultadoDeIdeas> {
  const repetidas = o.repetidas ?? 0
  if (o.ideas.length === 0) return { guardadas: 0, parecidas: repetidas, invalidas: o.invalidas }
  const quedan = await distintas(p, `${o.clave}:vectores`, o.ideas)
  if (quedan.length > 0) await p.guardarIdeasSueltas(o.origen, quedan)
  const caidas = o.ideas.filter((idea) => !quedan.some((q) => q.gancho === idea.gancho && q.resumen === idea.resumen))
  if (caidas.length > 0 && o.parecidas) await o.parecidas(caidas)
  return {
    guardadas: quedan.length,
    parecidas: repetidas + o.ideas.length - quedan.length,
    invalidas: o.invalidas,
  }
}

const deUnPar = (idea: IdeaValidada) => [...idea.fuentes].sort().join(",")

/**
 * Plano «Cruzar hallazgos»: up to three pairs at a middle distance, one Claude call, one idea per pair with both
 * findings. No pairs pays nothing. `clave` is the ledger key: `cruces:<day>` on Sunday, `cruces:<job>` for a report.
 */
export async function cruzar(
  p: PuertosDeCruce,
  o: { clave: string; desde: number; investigacionId?: string },
): Promise<ResultadoDeIdeas> {
  const pares = await p.paresParaCruzar({
    desde: o.desde,
    limite: CRUCES_POR_CORRIDA,
    investigacionId: o.investigacionId,
  })
  if (pares.length === 0) return { guardadas: 0, parecidas: 0, invalidas: 0 }
  const { cuentas, noNombrar } = await cuentasYVetados(p)
  const respuesta = await p.pedir(
    { clave: o.clave, paso: "cruces", marcaId: null },
    {
      modelo: MODELO,
      sistema: sistemaDeCruces(cuentas, noNombrar),
      mensajes: [{ role: "user", content: mensajeDeCruces(pares) }],
      maxTokens: 8_000,
      esfuerzo: "medium",
      formato: zodOutputFormat(Cruces),
    },
  )
  const validada = validarCruces(leerRespuesta(respuesta, Cruces), { pares, cuentas })
  // The prompt asks for one idea per pair; a second one from the same pair is the same cross told twice.
  const vistos = new Set<string>()
  const unaPorPar = validada.ideas.filter((idea) => {
    const par = deUnPar(idea)
    if (vistos.has(par)) return false
    vistos.add(par)
    return true
  })
  return guardarDistintas(p, {
    clave: o.clave,
    origen: "cruce",
    ideas: unaPorPar,
    invalidas: validada.descartadas.length,
    repetidas: validada.ideas.length - unaPorPar.length,
    parecidas: (caidas) =>
      p.descartarPares(
        caidas.flatMap((idea) => {
          const [a, b] = [...idea.fuentes].sort()
          return a && b ? [{ a, b }] : []
        }),
      ),
  })
}

const OTRA_PARECIDA = "La idea nueva se parecía a otra anterior. Pide otra de nuevo."
const SIN_OTRA = "Claude no propuso otra idea que pueda usar. Pídela de nuevo."
const PAR_INCOMPLETO = "Uno de los hallazgos de este cruce ya no está en el mapa, así que no puedo pedir otra."

async function pedirOtra(p: PuertosDeOtraSuelta, trabajo: TrabajoDeIdeaSuelta, vieja: IdeaSueltaAReemplazar) {
  const { cuentas, noNombrar } = await cuentasYVetados(p)
  const paso = { clave: `otra:${trabajo.id}`, paso: "otra_idea", marcaId: null }
  const comun = { modelo: MODELO, maxTokens: 8_000, esfuerzo: "medium" as const }
  if (vieja.origen === "cruce") {
    const [a, b] = vieja.fuentes
    if (!a || !b || vieja.fuentes.length !== 2) throw new Falla(PAR_INCOMPLETO)
    const par = { a, b }
    const respuesta = await p.pedir(paso, {
      ...comun,
      sistema: sistemaDeCruces(cuentas, noNombrar),
      mensajes: [{ role: "user", content: mensajeDeOtroCruce(vieja, par) }],
      formato: zodOutputFormat(Cruces),
    })
    return validarCruces(leerRespuesta(respuesta, Cruces), { pares: [par], cuentas })
  }
  if (vieja.fuentes.length === 0) throw new Falla(SIN_OTRA)
  const respuesta = await p.pedir(paso, {
    ...comun,
    sistema: sistemaDelDomingo(cuentas, noNombrar),
    mensajes: [{ role: "user", content: mensajeDeOtraDelDomingo(vieja, vieja.fuentes) }],
    formato: zodOutputFormat(IdeasDelDomingo),
  })
  return validarIdeasDelDomingo(leerRespuesta(respuesta, IdeasDelDomingo), { cuentas, hallazgos: vieja.fuentes })
}

/** «Pedir otra» on an idea with no research: a cross reuses its pair, a Sunday idea its findings. */
export async function otraIdeaSuelta(p: PuertosDeOtraSuelta, trabajo: TrabajoDeIdeaSuelta): Promise<ResultadoDeIdeas> {
  const vieja = await p.ideaSueltaAReemplazar(trabajo.ideaId)
  const validada = await pedirOtra(p, trabajo, vieja)
  const primera = validada.ideas[0]
  if (!primera) throw new Falla(SIN_OTRA)
  const [nueva] = await distintas(p, `otra:${trabajo.id}:vectores`, [primera])
  if (!nueva) throw new Falla(OTRA_PARECIDA)
  await p.guardarIdeasSueltas(vieja.origen, [{ ...nueva, reemplazaA: trabajo.ideaId }])
  return { guardadas: 1, parecidas: 0, invalidas: validada.descartadas.length }
}
