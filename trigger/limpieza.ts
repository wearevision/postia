import { schedules } from "@trigger.dev/sdk"
import { borrarAvisosEnviados } from "@/lib/avisos/repositorio-de-avisos"
import { barrerGastos } from "@/lib/gasto/repositorio"
import { barrerElecciones, limpiarArchivos, mantenimientoNocturno } from "@/lib/mantenimiento/limpieza"
import { createAdminClient } from "@/lib/supabase/admin"

// Plano «Mantenimiento», nightly part: orphan files, digest lines sent over a month ago, spend reservations nobody
// closed in a day and page choices nobody finished. 3:00, when nothing is published.
export const limpieza = schedules.task({
  id: "limpieza-nocturna",
  cron: { pattern: "0 3 * * *", timezone: "America/Santiago" },
  queue: { concurrencyLimit: 1 },
  retry: { maxAttempts: 1 },
  run: async () => {
    const db = createAdminClient()
    const ahora = Date.now()
    return mantenimientoNocturno({
      archivos: () => limpiarArchivos(db, { ahora }),
      avisos: () => borrarAvisosEnviados(db, ahora),
      gastos: () => barrerGastos(db),
      elecciones: () => barrerElecciones(db),
    })
  },
})
