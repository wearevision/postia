import { ESTADOS_DE_IDEA, type EstadoDeIdea } from "@/lib/series/lectura"

/** The Ideas screen opens on what waits for a decision; «todas» is the only way to see everything. */
export function estadoDelFiltro(parametro: string | undefined): EstadoDeIdea | null {
  if (parametro === "todas") return null
  return ESTADOS_DE_IDEA.find((e) => e === parametro) ?? "propuesta"
}

export function parametroDelFiltro(estado: EstadoDeIdea | null): string {
  return estado ?? "todas"
}
