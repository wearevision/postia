import { schedules } from "@trigger.dev/sdk"
import { type Browser, chromium } from "playwright"
import { armarCarruseles } from "@/lib/carrusel/armar"
import { fuentesEmbebidas } from "@/lib/carrusel/fuentes"
import { renderizarCarrusel } from "@/lib/carrusel/render"
import { repositorioDeCarruseles } from "@/lib/carrusel/repositorio"
import { createAdminClient } from "@/lib/supabase/admin"

// Every 2 minutes, one run at a time, on a 2 GB machine (Chromium). No retries: a failed request stays «fallo» with
// its reason and Federico asks again. Chromium starts only when there is a request.
export const armarCarrusel = schedules.task({
  id: "armar-carruseles",
  cron: { pattern: "*/2 * * * *", timezone: "America/Santiago" },
  machine: "medium-1x",
  queue: { concurrencyLimit: 1 },
  retry: { maxAttempts: 1 },
  run: async () => {
    const repo = repositorioDeCarruseles(createAdminClient())
    const abierto: { navegador?: Browser } = {}
    try {
      return await armarCarruseles({
        ...repo,
        async renderizar(html) {
          abierto.navegador ??= await chromium.launch()
          return renderizarCarrusel(abierto.navegador, html(await fuentesEmbebidas()))
        },
      })
    } finally {
      await abierto.navegador?.close()
    }
  },
})
