import { AVISO_DE_DATOS, comoDatos } from "@/lib/redaccion/instrucciones"
import { cuentasDelPrompt, lista, QUIENES_SOMOS, reglasDeIdeas } from "@/lib/series/instrucciones"
import { type CuentaDeSerie, type HallazgoDeSerie, MAXIMO_DE_FUENTES } from "@/lib/series/propuestas"

// Worker-safe: the prompts of 4g. Pairs, findings and accounts are numbered from 1; lib/ideas/propuestas.ts maps the
// numbers back.

/** A finding of the map as a cross shows it. `tema` is its topic's name, or null when it has none. */
export interface HallazgoDeCruce extends Omit<HallazgoDeSerie, "angulo"> {
  tema: string | null
}

export interface ParDeHallazgos {
  a: HallazgoDeCruce
  b: HallazgoDeCruce
}

/** A pillar that went two weeks without a post (D20, lib/voz/balance.ts), by name. */
export interface PilarPendiente {
  cuenta: string
  pilar: string
}

export const PREVIAS_DEL_DOMINGO = 40

export function sistemaDeCruces(cuentas: readonly CuentaDeSerie[], noNombrar: readonly string[]): string {
  return [
    `Propones ideas para LinkedIn que nacen de cruzar dos hallazgos del mapa de temas de PostIA. ${QUIENES_SOMOS}`,
    cuentasDelPrompt(cuentas),
    reglasDeIdeas(
      "Cada idea nace de un par, por su número (par), y usa ambos hallazgos del par. Nunca inventes una fuente, una cifra, un cliente ni un caso.",
      noNombrar,
    ),
    [
      "# El cruce",
      "La idea solo existe gracias a ambos hallazgos: dice qué dice uno sobre el otro. Si se sostiene con uno solo, no es un cruce.",
      "Propón como máximo una idea por par. Si un par no da para una idea que necesite ambos hallazgos, sáltalo: mejor menos ideas que un cruce forzado.",
    ].join("\n"),
  ].join("\n\n")
}

function fecha(h: Pick<HallazgoDeSerie, "publicado_en">): string {
  return h.publicado_en ?? "sin fecha"
}

function hallazgoDelPar(h: HallazgoDeCruce): string {
  return `${h.resumen} (${h.medio}, ${fecha(h)}; tema: ${h.tema ?? "sin tema"})`
}

export function mensajeDeCruces(pares: readonly ParDeHallazgos[]): string {
  const bloques = pares.map((p, i) =>
    [`[${i + 1}]`, `A: ${hallazgoDelPar(p.a)}`, `B: ${hallazgoDelPar(p.b)}`].join("\n"),
  )
  return [
    "Pares de hallazgos numerados (cada uno con su resumen, medio, fecha y tema):",
    `<pares>\n${comoDatos(bloques.join("\n\n"))}\n</pares>`,
    "Para cada par, propón la idea que nace de cruzarlos, o sáltalo.",
    AVISO_DE_DATOS,
  ].join("\n\n")
}

export function sistemaDelDomingo(cuentas: readonly CuentaDeSerie[], noNombrar: readonly string[]): string {
  return [
    `Propones ideas sueltas para LinkedIn para la semana que viene, a partir de los hallazgos de esta semana y de los pilares de cada cuenta. ${QUIENES_SOMOS}`,
    cuentasDelPrompt(cuentas),
    reglasDeIdeas(
      `Cada idea usa de 1 a ${MAXIMO_DE_FUENTES} hallazgos de la semana, por su número. Nunca inventes una fuente, una cifra, un cliente ni un caso.`,
      noNombrar,
    ),
    "Prefiere los pilares que necesitan una pieza. Si los hallazgos no alcanzan para todas las ideas pedidas, propón menos. Mejor pocas ideas sólidas que muchas repetidas.",
  ].join("\n\n")
}

export interface EntradaDelDomingo {
  hallazgos: readonly HallazgoDeSerie[]
  pilaresPendientes: readonly PilarPendiente[]
  /** Titles of the latest ideas in any state, newest first. */
  previas: readonly string[]
  cantidad: number
  /** Texts of the posts that worked best, ranked in code. Never statistics (D12): texts only. */
  funcionaron: readonly string[]
}

export function mensajeDelDomingo(e: EntradaDelDomingo): string {
  const hallazgos = e.hallazgos.map((h, i) => `[${i + 1}] ${h.resumen} (${h.medio}, ${fecha(h)})`)
  const pilares =
    e.pilaresPendientes.length > 0
      ? comoDatos(e.pilaresPendientes.map((p) => `- «${p.pilar}» en «${p.cuenta}»`).join("\n"))
      : "(ninguno)"
  const partes = [
    "Hallazgos de la semana, numerados:",
    `<hallazgos>\n${comoDatos(hallazgos.join("\n"))}\n</hallazgos>`,
    "Pilares que necesitan una pieza:",
    `<pilares_pendientes>\n${pilares}\n</pilares_pendientes>`,
    "Ideas propuestas antes, que no se repiten:",
    `<ideas_previas>\n${lista(e.previas.slice(0, PREVIAS_DEL_DOMINGO))}\n</ideas_previas>`,
  ]
  if (e.funcionaron.length > 0) {
    partes.push(
      "Posts de las cuentas que mejor funcionaron (referencia de temas y tono; no los copies):",
      `<funcionaron>\n${comoDatos(e.funcionaron.join("\n\n---\n\n"))}\n</funcionaron>`,
    )
  }
  partes.push(`Propón hasta ${e.cantidad} ideas, distintas entre sí y de las anteriores.`, AVISO_DE_DATOS)
  return partes.join("\n\n")
}
