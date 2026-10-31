import { schedules } from "@trigger.dev/sdk"
import { vigilarConexiones } from "@/lib/avisos/conexiones"
import { servicioPushReal } from "@/lib/avisos/push"
import { appDeRenovacion, puertosDeRenovacion, renovarConexiones } from "@/lib/linkedin/renovar"
import { createAdminClient } from "@/lib/supabase/admin"

// 8:00, before the 9:00 digest that carries its lines; no retries: a retry would push twice.
export const conexiones = schedules.task({
  id: "vigilar-conexiones",
  cron: { pattern: "0 8 * * *", timezone: "America/Santiago" },
  queue: { concurrencyLimit: 1 },
  retry: { maxAttempts: 1 },
  run: async () => vigilarConexiones(createAdminClient(), servicioPushReal(), Date.now()),
})

// 7:30, so the watch at 8:00 already sees the renewed expiries. No retries: tomorrow's run is the retry.
export const renovar = schedules.task({
  id: "renovar-conexiones",
  cron: { pattern: "30 7 * * *", timezone: "America/Santiago" },
  queue: { concurrencyLimit: 1 },
  retry: { maxAttempts: 1 },
  run: async () => {
    const app = appDeRenovacion(process.env)
    if (!app) {
      console.log("Falta LINKEDIN_PAGINA_CLIENT_ID o LINKEDIN_PAGINA_CLIENT_SECRET en Trigger.dev: no renuevo nada.")
      return { renovadas: 0, rechazadas: 0 }
    }
    return renovarConexiones(puertosDeRenovacion(createAdminClient(), app), Date.now())
  },
})
