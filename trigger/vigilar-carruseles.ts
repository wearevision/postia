import { idempotencyKeys, schedules, tasks } from "@trigger.dev/sdk"
import { contarPedidosAbiertos, vigilarCarruseles } from "@/lib/carrusel/vigilar"
import { createAdminClient } from "@/lib/supabase/admin"

// Every 2 minutes on the default small machine: one count query, and armar-carruseles (medium, Chromium) only when
// a request is open. Must not import trigger/carruseles.ts or Playwright: that would pull Chromium into this bundle.
export const vigilarCarrusel = schedules.task({
  id: "vigilar-carruseles",
  cron: { pattern: "*/2 * * * *", timezone: "America/Santiago" },
  queue: { concurrencyLimit: 1 },
  retry: { maxAttempts: 1 },
  run: async (payload) =>
    vigilarCarruseles(
      {
        abiertos: () => contarPedidosAbiertos(createAdminClient()),
        async disparar(clave) {
          // A plain string key inside a task is scoped to this run; global dedupes across polls of the same slot.
          const idempotencyKey = await idempotencyKeys.create(clave, { scope: "global" })
          await tasks.trigger("armar-carruseles", undefined, { idempotencyKey, idempotencyKeyTTL: "10m" })
        },
      },
      payload.timestamp,
    ),
})
