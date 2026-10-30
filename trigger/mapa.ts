import { schedules, task } from "@trigger.dev/sdk"
import { servicioPushReal } from "@/lib/avisos/push"
import { avisarTope, libroDeGastos } from "@/lib/gasto/repositorio"
import { crearReal, pedirPagando } from "@/lib/ia/claude"
import { embeberPagando, llamarVoyageReal } from "@/lib/ia/voyage"
import { calibrar } from "@/lib/mapa/calibrar"
import { nombrarTema } from "@/lib/mapa/nombrar"
import { ordenarMapa } from "@/lib/mapa/ordenar"
import { repositorioDelMapa } from "@/lib/mapa/repositorio"
import { createAdminClient } from "@/lib/supabase/admin"

function pagos() {
  const db = createAdminClient()
  return {
    db,
    libro: libroDeGastos(db),
    avisar: (avisos: Parameters<typeof avisarTope>[2]) => avisarTope(db, servicioPushReal(), avisos),
  }
}

// Plano «Mantenimiento» for the map. 3:30, after limpieza-nocturna. No retries: naming is paid per run-scoped key.
export const ordenar = schedules.task({
  id: "ordenar-mapa",
  cron: { pattern: "30 3 * * *", timezone: "America/Santiago" },
  queue: { concurrencyLimit: 1 },
  retry: { maxAttempts: 1 },
  run: async (_carga, { ctx }) => {
    const { db, libro, avisar } = pagos()
    const mapa = repositorioDelMapa(db)
    const claude = { libro, avisar, crear: crearReal() }
    return ordenarMapa(
      {
        reubicar: mapa.reubicar,
        pendientes: mapa.pendientes,
        crearTema: mapa.crearTema,
        casiIguales: mapa.casiIguales,
        fusionar: mapa.fusionar,
        nombrar: (clave, resumenes) =>
          nombrarTema((paso, pedido) => pedirPagando(claude, paso, pedido), clave, resumenes),
      },
      ctx.run.id,
    )
  },
})

// Run by hand from the Trigger.dev dashboard with {"confirmacion":"GASTAR"}. No retries: a retry would pay twice.
export const probarVoyage = task({
  id: "probar-voyage",
  retry: { maxAttempts: 1 },
  run: async (carga: { confirmacion?: string } | undefined, { ctx }) => {
    const { libro, avisar } = pagos()
    const puertos = { libro, avisar, llamar: llamarVoyageReal() }
    return calibrar(carga ?? {}, ctx.run.id, (paso, textos) => embeberPagando(puertos, paso, textos))
  },
})
