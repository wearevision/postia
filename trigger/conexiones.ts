import { schedules } from "@trigger.dev/sdk"
import { vigilarConexiones } from "@/lib/avisos/conexiones"
import { servicioPushReal } from "@/lib/avisos/push"
import { createAdminClient } from "@/lib/supabase/admin"

// 8:00, before the 9:00 digest that carries its lines; no retries: a retry would push twice.
export const conexiones = schedules.task({
  id: "vigilar-conexiones",
  cron: { pattern: "0 8 * * *", timezone: "America/Santiago" },
  queue: { concurrencyLimit: 1 },
  retry: { maxAttempts: 1 },
  run: async () => vigilarConexiones(createAdminClient(), servicioPushReal(), Date.now()),
})
