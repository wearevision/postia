import { schedules } from "@trigger.dev/sdk"
import { cifrasDeLaPagina, cifrasDeUnPostDelPerfil, seguidoresDeLaPagina } from "@/lib/linkedin/analiticas"
import { programarLecturasDeAnaliticas, repositorioDeAnaliticas } from "@/lib/rendimiento/repositorio-de-analiticas"
import { leerAnaliticas } from "@/lib/rendimiento/sincronizar"
import { createAdminClient } from "@/lib/supabase/admin"

// 6:00 Chile time: queues one reading for every connected page and profile. The profile's figures are kept 48 hours,
// so they are refreshed every day. No retries: tomorrow's run is the retry.
export const programarAnaliticas = schedules.task({
  id: "programar-analiticas",
  cron: { pattern: "0 6 * * *", timezone: "America/Santiago" },
  queue: { concurrencyLimit: 1 },
  retry: { maxAttempts: 1 },
  run: async () => ({ programadas: await programarLecturasDeAnaliticas(createAdminClient()) }),
})

// Every 2 minutes, one reading at a time (the schedule above and «Actualizar desde LinkedIn» both queue them). Per run:
// a page costs 1 call per 20 shares plus 1 for followers; a profile 4 calls for each of its last 10 posts (Development
// tier: 500 calls per app and 100 per member a day). No platform retries: a failed reading stays «fallo» with its
// reason and the owner asks again.
export const leerAnaliticasDeLinkedin = schedules.task({
  id: "leer-analiticas",
  cron: { pattern: "*/2 * * * *", timezone: "America/Santiago" },
  queue: { concurrencyLimit: 1 },
  retry: { maxAttempts: 1 },
  run: async () =>
    leerAnaliticas({
      ...repositorioDeAnaliticas(createAdminClient()),
      linkedin: { cifrasDeLaPagina, seguidoresDeLaPagina, cifrasDeUnPostDelPerfil },
      ahora: Date.now,
    }),
})
