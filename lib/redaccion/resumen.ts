import { type Hallazgo, mensajeDe } from "@/lib/clientes/revision"
import type { VeredictoGuardado } from "./lectura"

/** Claude's part of the review: off for pieces it does not review, else where its review stands. */
export type ClaudeEnLaRevision =
  | { estado: "revisando" }
  | { estado: "ilegible" }
  /** `revision` null: there is no Claude review (not a failure). */
  | { estado: "lista"; revision: VeredictoGuardado | null }

const contar = (total: number, uno: string, varios: string) => `${total} ${total === 1 ? uno : varios}`

function deClaude(claude: ClaudeEnLaRevision | undefined): { parte: string | null; abre: boolean } {
  if (!claude) return { parte: null, abre: false }
  if (claude.estado === "revisando") return { parte: "Claude todavía revisa", abre: false }
  if (claude.estado === "ilegible") return { parte: "no pude leer a Claude", abre: true }
  const { revision } = claude
  if (!revision) return { parte: "Claude no la revisó", abre: false }
  const total = revision.hallazgos.length + (revision.voz.ok ? 0 : 1)
  if (total === 0) return { parte: null, abre: false }
  return { parte: `${contar(total, "sugerencia", "sugerencias")} de Claude`, abre: true }
}

/**
 * The one sentence on the folded «Revisión»: client alerts first, then Claude, so neither hides the other.
 * `hallazgos` null: the verdict could not run. `abierta`: something inside deserves to be seen unfolded.
 * `peligro`: client alerts, shown in the danger color.
 */
export function resumenDeRevision({
  hallazgos,
  claude,
}: {
  hallazgos: Hallazgo[] | null
  claude?: ClaudeEnLaRevision
}): { texto: string; abierta: boolean; peligro: boolean } {
  // The verdict shows the same words found twice as one line; count what the screen shows.
  const alertas = hallazgos === null ? 0 : new Set(hallazgos.map(mensajeDe)).size
  const clientes =
    hallazgos === null
      ? "no pude revisar los clientes"
      : alertas > 0
        ? `${contar(alertas, "alerta", "alertas")} de clientes`
        : null
  const claudeDice = deClaude(claude)
  const partes = [clientes, claudeDice.parte].filter((parte): parte is string => parte !== null)
  return {
    texto: `Revisión: ${partes.length > 0 ? partes.join(" y ") : "todo en orden"}`,
    abierta: hallazgos === null || alertas > 0 || claudeDice.abre,
    peligro: alertas > 0,
  }
}
