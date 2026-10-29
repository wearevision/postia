import { task } from "@trigger.dev/sdk"
import { servicioPushReal } from "@/lib/avisos/push"
import { avisarTope, libroDeGastos } from "@/lib/gasto/repositorio"
import { crearReal, pedirPagando } from "@/lib/ia/claude"
import { probarClaude } from "@/lib/ia/probar"
import { createAdminClient } from "@/lib/supabase/admin"

// Run by hand from the Trigger.dev dashboard with {"confirmacion":"GASTAR"}. No retries: a retry would pay twice.
export const probar = task({
  id: "probar-claude",
  retry: { maxAttempts: 1 },
  run: async (carga: { confirmacion?: string } | undefined, { ctx }) => {
    const db = createAdminClient()
    const puertos = {
      libro: libroDeGastos(db),
      avisar: (avisos: Parameters<typeof avisarTope>[2]) => avisarTope(db, servicioPushReal(), avisos),
      crear: crearReal(),
    }
    // The dashboard can start a run with no payload at all; that must refuse like any other missing confirmation.
    return probarClaude(carga ?? {}, ctx.run.id, (paso, pedido) => pedirPagando(puertos, paso, pedido))
  },
})
