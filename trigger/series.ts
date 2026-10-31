import { schedules } from "@trigger.dev/sdk"
import { servicioPushReal } from "@/lib/avisos/push"
import { avisarTope, libroDeGastos } from "@/lib/gasto/repositorio"
import { crearReal, pedirPagando } from "@/lib/ia/claude"
import { escribirPiezas as escribir } from "@/lib/series/escribir"
import { repositorioDeEscritura } from "@/lib/series/repositorio"
import { createAdminClient } from "@/lib/supabase/admin"

// Every 2 minutes, one run at a time: writes each approved assignment right away (Federico, 2026-10-31), so the piece
// waits for his signature within minutes. A carousel is only queued here; armar-carruseles renders it. No platform retries: the ledger keys and the assignment's two-attempt
// guard decide (a re-leased assignment finds its first step paid and closes instead of paying twice).
export const escribirPiezas = schedules.task({
  id: "escribir-piezas",
  cron: { pattern: "*/2 * * * *", timezone: "America/Santiago" },
  queue: { concurrencyLimit: 1 },
  retry: { maxAttempts: 1 },
  maxDuration: 840,
  run: async (payload) => {
    const db = createAdminClient()
    const puertos = {
      libro: libroDeGastos(db),
      avisar: (avisos: Parameters<typeof avisarTope>[2]) => avisarTope(db, servicioPushReal(), avisos),
      crear: crearReal(),
    }
    return escribir(
      { ...repositorioDeEscritura(db), pedir: (paso, pedido) => pedirPagando(puertos, paso, pedido) },
      payload.timestamp.getTime(),
    )
  },
})
