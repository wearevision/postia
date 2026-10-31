export const SIN_LAMINAS = "No pude mostrar las láminas. Recarga o revisa el PDF; no se puede firmar sin verlas."

/**
 * Why signing must stay blocked whatever the person reads; null when nothing does.
 * Gate 2 needs the final piece seen: a carousel whose previews are missing, or whose slide count is unknown
 * (an uploaded PDF without a design), cannot be signed.
 */
export function bloqueoDeFirma({
  formato,
  laminasEsperadas,
  vistas,
}: {
  formato: "texto" | "carrusel_pdf"
  /** The design's slide count; null when there is no readable design. */
  laminasEsperadas: number | null
  /** Previews that came back. */
  vistas: number
}): string | null {
  if (formato === "texto") return null
  if (laminasEsperadas === null || laminasEsperadas === 0 || vistas < laminasEsperadas) return SIN_LAMINAS
  return null
}
