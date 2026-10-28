import { schedules } from "@trigger.dev/sdk"
import { avisarMiembros } from "@/lib/avisos/a-miembros"
import { servicioPushReal } from "@/lib/avisos/push"
import { crearPost, estadoDelDocumento, subirDocumento } from "@/lib/linkedin/api"
import { publicarPendientes } from "@/lib/publicacion/publicar"
import { repositorioDePublicacion } from "@/lib/publicacion/repositorio"
import { createAdminClient } from "@/lib/supabase/admin"

// Every 5 minutes, Chile time. One run at a time: two runs never race for the same piece (the lease also guards it).
// No automatic retries: a send is never repeated by the platform; the next run decides with fresh state.
export const publicar = schedules.task({
  id: "publicar-pendientes",
  cron: { pattern: "*/5 * * * *", timezone: "America/Santiago" },
  queue: { concurrencyLimit: 1 },
  retry: { maxAttempts: 1 },
  run: async () => {
    const db = createAdminClient()
    const push = servicioPushReal()
    return publicarPendientes({
      ...repositorioDePublicacion(db),
      avisar: (marcaId, aviso) => avisarMiembros(db, push, marcaId, aviso),
      linkedin: { crearPost, subirDocumento, estadoDelDocumento },
      esperar: (ms) => new Promise((listo) => setTimeout(listo, ms)),
      ahora: Date.now,
    })
  },
})
