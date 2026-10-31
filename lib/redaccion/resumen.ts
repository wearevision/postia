import { type Hallazgo, mensajeDe } from "@/lib/clientes/revision"
import type { VeredictoGuardado } from "./lectura"

/**
 * The count shown on the folded «Revisión»: the no-AI verdict's lines plus Claude's remarks.
 * `hallazgos` null: the verdict could not run. `revision` null: there is no Claude review (not a failure).
 */
export function resumenDeRevision({
  hallazgos,
  revision,
  claudeIlegible = false,
}: {
  hallazgos: Hallazgo[] | null
  revision: VeredictoGuardado | null
  claudeIlegible?: boolean
}): string {
  if (hallazgos === null || claudeIlegible) return "no pude leerla"
  // The verdict shows the same words found twice as one line; count what the screen shows.
  const delVeredicto = new Set(hallazgos.map(mensajeDe)).size
  const deClaude = revision ? revision.hallazgos.length + (revision.voz.ok ? 0 : 1) : 0
  const total = delVeredicto + deClaude
  if (total === 0) return "sin comentarios"
  return total === 1 ? "1 comentario" : `${total} comentarios`
}
