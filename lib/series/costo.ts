import type { FormatoDeIdea } from "./propuestas"

/** A ceiling per piece, writing plus its review, above what production paid on 2026-10-31. Micro-dollars. */
const POR_PIEZA: Record<FormatoDeIdea, number> = { texto: 150_000, carrusel_pdf: 250_000 }

export function costoAproximado(formatos: readonly FormatoDeIdea[]): number {
  return formatos.reduce((total, formato) => total + POR_PIEZA[formato], 0)
}
