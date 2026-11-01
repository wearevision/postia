import { estimarCosto, estimarVoyage } from "@/lib/gasto/precios"
import { type FormatoDeIdea, LARGO_DE_GANCHO, LARGO_DE_RESUMEN } from "./propuestas"

/** A ceiling per piece, writing plus its review, above what production paid on 2026-10-31. Micro-dollars. */
const POR_PIEZA: Record<FormatoDeIdea, number> = { texto: 150_000, carrusel_pdf: 250_000 }

export function costoAproximado(formatos: readonly FormatoDeIdea[]): number {
  return formatos.reduce((total, formato) => total + POR_PIEZA[formato], 0)
}

/** The series call (lib/series/armar.ts) and the estimate shown beside «Aprobar informe» read the same numbers. */
export const MODELO_DE_SERIE = "claude-opus-5-5" as const
export const MAX_TOKENS_DE_SERIE = 16_000
/** A report asked for before 4f could miss its count; the plano's default series is five ideas. */
export const CANTIDAD_POR_DEFECTO = 5

// The system prompt carries every account, its pillars and the exceptions; this stays above any realistic one.
const CARACTERES_DEL_SISTEMA = 20_000
const CENTAVO_MICRO = 10_000

/**
 * A ceiling for «Armar la serie»: the Claude call at its worst case (see estimarCosto) plus one Voyage call over the
 * ideas' hooks and summaries, rounded up to a whole cent. Micro-dollars.
 */
export function estimarSerie(pedido: { caracteresDelInforme: number; cantidad: number }): number {
  const claude = estimarCosto(MODELO_DE_SERIE, {
    caracteresDeEntrada: pedido.caracteresDelInforme + CARACTERES_DEL_SISTEMA,
    maxTokens: MAX_TOKENS_DE_SERIE,
    busquedas: 0,
  })
  const voyage = estimarVoyage(pedido.cantidad * (LARGO_DE_GANCHO + LARGO_DE_RESUMEN))
  return Math.ceil((claude + voyage) / CENTAVO_MICRO) * CENTAVO_MICRO
}
