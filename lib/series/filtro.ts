import { ESTADOS_DE_IDEA, type EstadoDeIdea } from "@/lib/series/lectura"

/**
 * The Ideas screen opens on what waits for a decision; «todas» is the only way to see everything.
 * A series picked from a report without a state shows the whole series.
 */
export function estadoDelFiltro(parametro: string | undefined, serie?: string): EstadoDeIdea | null {
  if (parametro === "todas") return null
  if (parametro === undefined && serie) return null
  return ESTADOS_DE_IDEA.find((e) => e === parametro) ?? "propuesta"
}

export function parametroDelFiltro(estado: EstadoDeIdea | null): string {
  return estado ?? "todas"
}

/** «No hay ideas por revisar» may replace the page only when no series still has news to show. */
export function sinNadaPorRevisar(
  estado: EstadoDeIdea | null,
  hayPropuestas: boolean,
  series: readonly { trabajando: boolean; fallo: string | null }[],
): boolean {
  if (estado !== "propuesta" || hayPropuestas || series.length === 0) return false
  return !series.some((s) => s.trabajando || s.fallo)
}
