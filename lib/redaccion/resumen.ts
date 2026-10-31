import { type Hallazgo, mensajeDe } from "@/lib/clientes/revision"
import type { VeredictoGuardado } from "./lectura"

/** Claude's part of the review: off for pieces it does not review, else where its review stands. */
export type ClaudeEnLaRevision =
  | { estado: "revisando" }
  | { estado: "ilegible" }
  /** `revision` null: there is no Claude review (not a failure). */
  | { estado: "lista"; revision: VeredictoGuardado | null }

function comentarios(total: number): string {
  if (total === 0) return "sin comentarios"
  return total === 1 ? "1 comentario" : `${total} comentarios`
}

/**
 * The line on the folded «Revisión»: the no-AI verdict and Claude reported apart, so neither hides the other.
 * `hallazgos` null: the verdict could not run. `abierta`: something inside deserves to be seen unfolded.
 */
export function resumenDeRevision({
  hallazgos,
  claude,
}: {
  hallazgos: Hallazgo[] | null
  claude?: ClaudeEnLaRevision
}): { texto: string; abierta: boolean } {
  // The verdict shows the same words found twice as one line; count what the screen shows.
  const delVeredicto = hallazgos === null ? 0 : new Set(hallazgos.map(mensajeDe)).size
  const partes = [hallazgos === null ? "no pude revisar los clientes" : comentarios(delVeredicto)]
  let abierta = hallazgos === null || delVeredicto > 0
  if (claude?.estado === "revisando") partes.push("Claude todavía revisa")
  if (claude?.estado === "ilegible") {
    partes.push("Claude no se pudo leer")
    abierta = true
  }
  if (claude?.estado === "lista") {
    const { revision } = claude
    if (!revision) partes.push("sin revisión de Claude")
    else {
      const deClaude = revision.hallazgos.length + (revision.voz.ok ? 0 : 1)
      partes.push(`Claude: ${comentarios(deClaude)}`)
      abierta ||= deClaude > 0
    }
  }
  return { texto: partes.join(" · "), abierta }
}
