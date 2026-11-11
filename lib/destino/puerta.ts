/**
 * Gate 1 offers the destination wherever the text can still change. Spec: text posts and carousels alike carry the link
 * in their text. A text piece waits while Claude rewrites or reviews it; a carousel waits while it is being built.
 */
export function puedeElegirDestino(d: {
  porFirmar: boolean
  formato: "texto" | "carrusel_pdf"
  armando: boolean
  redaccionLista: boolean
}): boolean {
  if (!d.porFirmar || d.armando) return false
  return d.formato === "carrusel_pdf" || d.redaccionLista
}
