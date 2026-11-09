import { schedules } from "@trigger.dev/sdk"
import { cifrasDeLaPagina, cifrasDeUnPostDelPerfil, seguidoresDeLaPagina } from "@/lib/linkedin/analiticas"
import { programarLecturasDeAnaliticas, repositorioDeAnaliticas } from "@/lib/rendimiento/repositorio-de-analiticas"
import { DURACION_MAXIMA_S, leerAnaliticas } from "@/lib/rendimiento/sincronizar"
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

// Every 5 minutes, one reading at a time (the schedule above and «Actualizar desde LinkedIn» both queue them). Per run:
// a page costs 1 call per 20 posts of each URN kind plus 1 for followers; a profile 4 calls for each of its last 10
// posts (Development tier: 500 calls per app and 100 per member a day; a profile is read twice a UTC day at most).
// maxDuration covers every call timing out and stays below the reading's lease (ARRIENDO_S). No platform retries: a
// failed reading stays «fallo» with its reason and the owner asks again.
export const leerAnaliticasDeLinkedin = schedules.task({
  id: "leer-analiticas",
  cron: { pattern: "*/5 * * * *", timezone: "America/Santiago" },
  maxDuration: DURACION_MAXIMA_S,
  queue: { concurrencyLimit: 1 },
  retry: { maxAttempts: 1 },
  run: async () =>
    leerAnaliticas({
      ...repositorioDeAnaliticas(createAdminClient()),
      linkedin: { cifrasDeLaPagina, seguidoresDeLaPagina, cifrasDeUnPostDelPerfil },
      ahora: Date.now,
    }),
})
