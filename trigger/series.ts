import { schedules } from "@trigger.dev/sdk"
import { servicioPushReal } from "@/lib/avisos/push"
import { avisarTope, libroDeGastos } from "@/lib/gasto/repositorio"
import { crearReal, pedirPagando } from "@/lib/ia/claude"
import { escribirPiezas as escribir } from "@/lib/series/escribir"
import { repositorioDeEscritura } from "@/lib/series/repositorio"
import { createAdminClient } from "@/lib/supabase/admin"

// Every hour at :20, one run at a time: writes what is due in the next 3 days (plano «Escribir texto»). A carousel is
// only queued here; armar-carruseles renders it. No platform retries: the ledger keys and the assignment's two-attempt
// guard decide (a re-leased assignment finds its first step paid and closes instead of paying twice).
export const escribirPiezas = schedules.task({
  id: "escribir-piezas",
  cron: { pattern: "20 * * * *", timezone: "America/Santiago" },
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
