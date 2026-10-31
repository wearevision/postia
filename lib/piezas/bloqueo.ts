export const SIN_LAMINAS = "No pude mostrar las láminas. Recarga o revisa el PDF; no se puede firmar sin verlas."

export const DISENO_ILEGIBLE = "No pude leer si se está armando el carrusel. Recarga en un rato."

/**
 * Why signing must stay blocked whatever the person reads; null when nothing does.
 * Gate 2 needs the final piece seen: a carousel whose previews are missing, or whose slide count is unknown
 * (an uploaded PDF without a design), cannot be signed; nor one whose render requests could not be read, since a
 * rebuild may be replacing the slides on screen.
 */
export function bloqueoDeFirma({
  formato,
  laminasEsperadas,
  vistas,
  disenoIlegible = false,
}: {
  formato: "texto" | "carrusel_pdf"
  /** The design's slide count; null when there is no readable design. */
  laminasEsperadas: number | null
  /** Previews that came back. */
  vistas: number
  /** The carousel's render requests could not be read. */
  disenoIlegible?: boolean
}): string | null {
  if (formato === "texto") return null
  if (disenoIlegible) return DISENO_ILEGIBLE
  if (laminasEsperadas === null || laminasEsperadas === 0 || vistas < laminasEsperadas) return SIN_LAMINAS
  return null
}
