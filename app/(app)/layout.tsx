import { redirect } from "next/navigation"
import { resumenDeGasto } from "@/lib/gasto/lectura"
import { RUTA_DE_INGRESO, RUTA_DE_SALIR } from "@/lib/sesion/rutas"
import { leerSesion } from "@/lib/sesion/sesion"
import { createClient } from "@/lib/supabase/server"
import { ChipDeGasto } from "./chip-de-gasto"
import { Navegacion } from "./navegacion"

export default async function LayoutDeLaApp({ children }: { children: React.ReactNode }) {
  const sesion = await leerSesion(await createClient())
  if (sesion.estado === "anonima") redirect(RUTA_DE_INGRESO)
  if (sesion.estado === "sin_acceso") redirect(`${RUTA_DE_SALIR}?motivo=sin_acceso`)
  const gasto = await leerGasto()
  return (
    <div className="flex min-h-dvh flex-col">
      {gasto && (
        <header className="flex justify-end px-4 pt-[max(0.5rem,env(safe-area-inset-top))]">
          <ChipDeGasto gastadoMicro={gasto.gastadoMicro} topeMicro={gasto.topeMicro} />
        </header>
      )}
      <main className={`flex-1 px-4 pb-28 ${gasto ? "pt-4" : "pt-[max(1rem,env(safe-area-inset-top))]"}`}>
        {children}
      </main>
      <Navegacion />
    </div>
  )
}

// A failing spend read must not take every screen down with it: the chip is left out and the cause is logged.
async function leerGasto() {
  try {
    return await resumenDeGasto(await createClient())
  } catch (falla) {
    console.error("No pude leer el gasto para el encabezado", falla)
    return null
  }
}
