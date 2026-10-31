import { schedules, task } from "@trigger.dev/sdk"
import { servicioPushReal } from "@/lib/avisos/push"
import { instanteDe } from "@/lib/dominio/instante"
import { avisarTope, libroDeGastos } from "@/lib/gasto/repositorio"
import { crearReal, pedirPagando } from "@/lib/ia/claude"
import { embeberPagando, llamarVoyageReal } from "@/lib/ia/voyage"
import { calibrarCruces } from "@/lib/ideas/calibrar"
import { motorDelDomingo as proponer } from "@/lib/ideas/domingo"
import { repositorioDeIdeas } from "@/lib/ideas/repositorio"
import { repositorioDeSeries } from "@/lib/series/repositorio"
import { createAdminClient } from "@/lib/supabase/admin"

/** Every paid call goes through the 4a ledger, charged to «General» (marcaId null). */
function puertos() {
  const db = createAdminClient()
  const pago = {
    libro: libroDeGastos(db),
    avisar: (avisos: Parameters<typeof avisarTope>[2]) => avisarTope(db, servicioPushReal(), avisos),
  }
  const claude = { ...pago, crear: crearReal() }
  const voyage = { ...pago, llamar: llamarVoyageReal() }
  return {
    ...repositorioDeSeries(db),
    ...repositorioDeIdeas(db),
    pedir: (paso: Parameters<typeof pedirPagando>[1], pedido: Parameters<typeof pedirPagando>[2]) =>
      pedirPagando(claude, paso, pedido),
    embeberIdeas: (clave: string, textos: string[]) =>
      embeberPagando(voyage, { clave, paso: "vectores-de-ideas" }, textos),
  }
}

// Sunday 17:00 Chile: crosses first, then loose ideas if the week needs them (plano «Motor semanal de ideas»). No
// platform retries: the day's ledger keys decide, so a re-run the same day skips what was paid.
export const motorDelDomingo = schedules.task({
  id: "motor-del-domingo",
  cron: { pattern: "0 17 * * 0", timezone: "America/Santiago" },
  queue: { concurrencyLimit: 1 },
  retry: { maxAttempts: 1 },
  maxDuration: 840,
  run: async (payload) => proponer(puertos(), instanteDe(payload.timestamp).getTime()),
})

// Manual and free: the similarity distribution of candidate pairs, to calibrate UMBRALES.cruce with real data.
export const probarCruces = task({
  id: "probar-cruces",
  retry: { maxAttempts: 1 },
  run: async () => calibrarCruces(repositorioDeIdeas(createAdminClient())),
})
