import { schedules } from "@trigger.dev/sdk"
import { servicioPushReal } from "@/lib/avisos/push"
import { avisarTope, libroDeGastos } from "@/lib/gasto/repositorio"
import { crearReal, pedirPagando } from "@/lib/ia/claude"
import { atenderPedidos } from "@/lib/redaccion/atender"
import { repositorioDeRedaccion } from "@/lib/redaccion/repositorio"
import { createAdminClient } from "@/lib/supabase/admin"

// Every 2 minutes, one run at a time. No platform retries: a retry could pay twice; a failed request stays «fallo»
// and Federico asks again (a new request, a new ledger key).
export const atenderPedidosDeTexto = schedules.task({
  id: "atender-pedidos-de-texto",
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
    return atenderPedidos({
      ...repositorioDeRedaccion(db),
      pedir: (paso, pedido) => pedirPagando(puertos, paso, pedido),
    })
  },
})
