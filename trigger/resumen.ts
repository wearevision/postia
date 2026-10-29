import { schedules } from "@trigger.dev/sdk"
import { enviarResumenes } from "@/lib/avisos/enviar-resumen"
import { servicioPushReal } from "@/lib/avisos/push"
import { createAdminClient } from "@/lib/supabase/admin"

// D26, decided by Federico: 9:00 and 17:00 Chile time. One run at a time and no retries: a retry would push twice.
export const resumen = schedules.task({
  id: "resumen-de-firmas",
  cron: { pattern: "0 9,17 * * *", timezone: "America/Santiago" },
  queue: { concurrencyLimit: 1 },
  retry: { maxAttempts: 1 },
  run: async () => enviarResumenes(createAdminClient(), servicioPushReal(), Date.now()),
})
