import { z } from "zod"
import { similitud } from "@/lib/mapa/vectores"
import { LIMITES, TIPOS_DE_LAMINA, type TipoDeLamina } from "@/lib/plantillas/laminas"

// Worker-safe: pure validation of the series Claude proposes (plano «Armar la serie»).

export type FormatoDeIdea = "texto" | "carrusel_pdf"

export interface PilarDeSerie {
  id: string
  nombre: string
  deQueHabla: string
}

/** One account Claude may suggest. `pilares` are the active pillars of the account's brand. */
export interface CuentaDeSerie {
  id: string
  nombre: string
  tipo: "persona" | "empresa"
  marca: { id: string; nombre: string; voz: "yo" | "nosotros" }
  pilares: PilarDeSerie[]
  temasVetados: string
}

/** A finding of the approved report. */
export interface HallazgoDeSerie {
  id: string
  angulo: string
  resumen: string
  medio: string
  publicado_en: string | null
  enlace: string
}

export interface ContextoDeSerie {
  cuentas: CuentaDeSerie[]
  hallazgos: HallazgoDeSerie[]
}

// Accounts, findings and pillars travel as 1-based indices of the lists in the prompt, so the model never handles
// uuids it could garble. Text limits are checked per idea in validarSerie rather than here, so one long hook does not
// sink the whole paid answer.
const Indice = z.number().int()
export const Idea = z.object({
  gancho: z.string().trim().min(1),
  resumen: z.string().trim().min(1),
  formato: z.enum(["texto", "carrusel_pdf"]),
  esqueleto: z.array(z.object({ tipo: z.enum(TIPOS_DE_LAMINA).nullable(), idea: z.string().trim().min(1) })).min(1),
  fuentes: z.array(Indice),
  cuenta: Indice,
  razon: z.string().trim().min(1),
  pilar: Indice.nullable(),
})
export const Serie = z.object({ ideas: z.array(Idea) })
export type Serie = z.infer<typeof Serie>
export type IdeaPropuesta = z.infer<typeof Idea>

export type PasoDeEsqueleto = { tipo: TipoDeLamina; idea: string } | { idea: string }

export interface IdeaValidada {
  gancho: string
  resumen: string
  formato: FormatoDeIdea
  esqueleto: PasoDeEsqueleto[]
  /** Finding ids, 1 to 6. */
  fuentes: string[]
  /** Account id. */
  cuenta: string
  razon: string
  /** A pillar id of the account's brand, or null. */
  pilar: string | null
}

export interface SerieValidada {
  ideas: IdeaValidada[]
  descartadas: { motivo: string; gancho: string }[]
}

// Same limits as the checks on public.ideas.
export const LARGO_DE_GANCHO = 140
export const LARGO_DE_RESUMEN = 600
export const LARGO_DE_RAZON = 300
/** public.esqueleto_valido: each beat's idea, trimmed. */
export const LARGO_DE_PASO = 400
export const MAXIMO_DE_FUENTES = 6
export const PASOS_DE_TEXTO = { minimo: 1, maximo: 6 } as const

const MOTIVOS = {
  cuenta: "La cuenta sugerida no existe.",
  fuentes: "No usa ningún hallazgo del informe.",
  carrusel: `El esqueleto del carrusel no lleva de ${LIMITES.carrusel.minimo} a ${LIMITES.carrusel.maximo} láminas con portada al inicio y cierre al final.`,
  texto: `El esqueleto del post lleva de ${PASOS_DE_TEXTO.minimo} a ${PASOS_DE_TEXTO.maximo} pasos.`,
  gancho: `El gancho pasa los ${LARGO_DE_GANCHO} caracteres.`,
  resumen: `El resumen pasa los ${LARGO_DE_RESUMEN} caracteres.`,
  razon: `La razón pasa los ${LARGO_DE_RAZON} caracteres.`,
  paso: `Un paso del esqueleto pasa los ${LARGO_DE_PASO} caracteres.`,
}

export const deIndice = <T>(lista: readonly T[], indice: number): T | undefined =>
  Number.isInteger(indice) && indice >= 1 ? lista[indice - 1] : undefined

function esqueletoDeCarrusel(esqueleto: IdeaPropuesta["esqueleto"]): PasoDeEsqueleto[] | null {
  const { minimo, maximo } = LIMITES.carrusel
  if (esqueleto.length < minimo || esqueleto.length > maximo) return null
  if (esqueleto[0]?.tipo !== "portada" || esqueleto.at(-1)?.tipo !== "cierre") return null
  const pasos: PasoDeEsqueleto[] = []
  for (const p of esqueleto) {
    if (p.tipo === null) return null
    pasos.push({ tipo: p.tipo, idea: p.idea })
  }
  return pasos
}

function esqueletoDeTexto(esqueleto: IdeaPropuesta["esqueleto"]): PasoDeEsqueleto[] | null {
  if (esqueleto.length < PASOS_DE_TEXTO.minimo || esqueleto.length > PASOS_DE_TEXTO.maximo) return null
  return esqueleto.map((p) => ({ idea: p.idea }))
}

export type Validacion = { ok: true; idea: IdeaValidada } | { ok: false; motivo: string }

/** 4f's per-idea rules, shared with crosses and Sunday ideas (lib/ideas/propuestas.ts). */
export function validarIdea(
  idea: IdeaPropuesta,
  contexto: {
    cuentas: readonly Pick<CuentaDeSerie, "id" | "pilares">[]
    hallazgos: readonly Pick<HallazgoDeSerie, "id">[]
  },
): Validacion {
  if (idea.gancho.length > LARGO_DE_GANCHO) return { ok: false, motivo: MOTIVOS.gancho }
  if (idea.resumen.length > LARGO_DE_RESUMEN) return { ok: false, motivo: MOTIVOS.resumen }
  if (idea.razon.length > LARGO_DE_RAZON) return { ok: false, motivo: MOTIVOS.razon }
  if (idea.esqueleto.some((p) => p.idea.length > LARGO_DE_PASO)) return { ok: false, motivo: MOTIVOS.paso }
  const cuenta = deIndice(contexto.cuentas, idea.cuenta)
  if (!cuenta) return { ok: false, motivo: MOTIVOS.cuenta }
  const fuentes = [...new Set(idea.fuentes.flatMap((i) => deIndice(contexto.hallazgos, i)?.id ?? []))].slice(
    0,
    MAXIMO_DE_FUENTES,
  )
  if (fuentes.length === 0) return { ok: false, motivo: MOTIVOS.fuentes }
  const esqueleto =
    idea.formato === "carrusel_pdf" ? esqueletoDeCarrusel(idea.esqueleto) : esqueletoDeTexto(idea.esqueleto)
  if (!esqueleto) return { ok: false, motivo: idea.formato === "carrusel_pdf" ? MOTIVOS.carrusel : MOTIVOS.texto }
  const pilar = idea.pilar === null ? undefined : deIndice(cuenta.pilares, idea.pilar)
  return {
    ok: true,
    idea: {
      gancho: idea.gancho,
      resumen: idea.resumen,
      formato: idea.formato,
      esqueleto,
      fuentes,
      cuenta: cuenta.id,
      razon: idea.razon,
      pilar: pilar?.id ?? null,
    },
  }
}

/**
 * Maps the indices back to ids and drops what the database would refuse or what breaks the plano's rules (an
 * unknown account, no finding of this report, a carousel skeleton outside the slide rules). A pillar outside the
 * account's brand is only cleared: the idea still stands.
 */
export function validarSerie(
  serie: Serie,
  contexto: {
    cuentas: readonly Pick<CuentaDeSerie, "id" | "pilares">[]
    hallazgos: readonly Pick<HallazgoDeSerie, "id">[]
  },
): SerieValidada {
  const resultado: SerieValidada = { ideas: [], descartadas: [] }
  for (const idea of serie.ideas) {
    const v = validarIdea(idea, contexto)
    if (v.ok) resultado.ideas.push(v.idea)
    else resultado.descartadas.push({ motivo: v.motivo, gancho: idea.gancho })
  }
  return resultado
}

/** Within a series the later of two ideas at or above `umbral` is the one dropped (UMBRALES.idea). */
export function quitarParecidas<T extends { vector: number[] }>(ideas: readonly T[], umbral: number): T[] {
  const quedan: T[] = []
  for (const idea of ideas) {
    if (quedan.every((q) => similitud(q.vector, idea.vector) < umbral)) quedan.push(idea)
  }
  return quedan
}
