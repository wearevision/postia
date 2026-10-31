/**
 * A scheduled run's `payload.timestamp`. Trigger.dev passes a Date to scheduled runs but the ISO string as-is when a
 * schedules.task is triggered by hand (dashboard test, MCP), so tasks read it through here.
 */
export function instanteDe(valor: unknown): Date {
  const instante = valor instanceof Date ? valor : typeof valor === "string" ? new Date(valor) : null
  if (!instante || Number.isNaN(instante.getTime())) {
    throw new Error(`La tarea recibió una hora que no es válida: ${String(valor)}`)
  }
  return instante
}
