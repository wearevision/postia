import { schedules } from "@trigger.dev/sdk"
import { servicioPushReal } from "@/lib/avisos/push"
import { avisarTope, libroDeGastos } from "@/lib/gasto/repositorio"
import { crearReal, pedirPagando } from "@/lib/ia/claude"
import { leerRendimiento } from "@/lib/rendimiento/aprendizajes"
import { repositorioDeLecturas } from "@/lib/rendimiento/repositorio-de-lecturas"
import { createAdminClient } from "@/lib/supabase/admin"

// Every 2 minutes, one reading at a time. No platform retries: a retry could pay twice; a failed reading stays
// «fallo» and Federico asks again (a new reading, a new ledger key).
export const aprenderDeRendimiento = schedules.task({
  id: "aprender-de-rendimiento",
  cron: { pattern: "*/2 * * * *", timezone: "America/Santiago" },
  queue: { concurrencyLimit: 1 },
  retry: { maxAttempts: 1 },
  run: async () => {
    const db = createAdminClient()
    const puertos = {
      libro: libroDeGastos(db),
      avisar: (avisos: Parameters<typeof avisarTope>[2]) => avisarTope(db, servicioPushReal(), avisos),
      crear: crearReal(),
    }
    return leerRendimiento({
      ...repositorioDeLecturas(db),
      pedir: (paso, pedido) => pedirPagando(puertos, paso, pedido),
    })
  },
})
