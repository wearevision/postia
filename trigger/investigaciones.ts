import { schedules } from "@trigger.dev/sdk"
import { servicioPushReal } from "@/lib/avisos/push"
import { instanteDe } from "@/lib/dominio/instante"
import { avisarTope, libroDeGastos } from "@/lib/gasto/repositorio"
import { crearReal, pedirPagando } from "@/lib/ia/claude"
import { embeberPagando, llamarVoyageReal } from "@/lib/ia/voyage"
import { repositorioDeIdeas } from "@/lib/ideas/repositorio"
import { repositorioDeInvestigaciones } from "@/lib/investigacion/repositorio"
import { atenderInvestigaciones as atender, vigilar } from "@/lib/investigacion/vigilancia"
import { repositorioDeSeries } from "@/lib/series/repositorio"
import { createAdminClient } from "@/lib/supabase/admin"

/** Every paid call goes through the 4a ledger, charged to «General» (marcaId null): research, series and crosses alike. */
function puertos() {
  const db = createAdminClient()
  const pago = {
    libro: libroDeGastos(db),
    avisar: (avisos: Parameters<typeof avisarTope>[2]) => avisarTope(db, servicioPushReal(), avisos),
  }
  const claude = { ...pago, crear: crearReal() }
  const voyage = { ...pago, llamar: llamarVoyageReal() }
  return {
    ...repositorioDeInvestigaciones(db),
    ...repositorioDeSeries(db),
    ...repositorioDeIdeas(db),
    pedir: (paso: Parameters<typeof pedirPagando>[1], pedido: Parameters<typeof pedirPagando>[2]) =>
      pedirPagando(claude, paso, pedido),
    embeber: (clave: string, textos: string[]) =>
      embeberPagando(voyage, { clave, paso: "vectores-de-hallazgos" }, textos),
    embeberIdeas: (clave: string, textos: string[]) =>
      embeberPagando(voyage, { clave, paso: "vectores-de-ideas" }, textos),
  }
}

// Every 2 minutes, one job at a time. No platform retries: the ledger keys and the job's two-attempt guard decide
// (a re-leased job finds its first step already paid and fails instead of paying twice). A search with continuations
// can outlast the project's 9-minute default; 14 minutes stays inside the job's 15-minute lease.
export const atenderInvestigaciones = schedules.task({
  id: "atender-investigaciones",
  cron: { pattern: "*/2 * * * *", timezone: "America/Santiago" },
  queue: { concurrencyLimit: 1 },
  retry: { maxAttempts: 1 },
  maxDuration: 840,
  run: async () => atender(puertos()),
})

// Saturday 22:00 Chile: the week's watched topics (plano «Vigilancia semanal»), before the Sunday engine (4g). Up to 10
// topics run one after another, each a search and a sort: 30 minutes instead of the 9-minute default.
export const vigilarTemas = schedules.task({
  id: "vigilar-temas",
  cron: { pattern: "0 22 * * 6", timezone: "America/Santiago" },
  queue: { concurrencyLimit: 1 },
  retry: { maxAttempts: 1 },
  maxDuration: 1800,
  run: async (payload) => vigilar(puertos(), instanteDe(payload.timestamp).getTime()),
})
