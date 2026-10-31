import { redirect } from "next/navigation"
import { resumenDeGasto } from "@/lib/gasto/lectura"
import { RUTA_DE_INGRESO, RUTA_DE_SALIR } from "@/lib/sesion/rutas"
import { leerSesion } from "@/lib/sesion/sesion"
import { createClient } from "@/lib/supabase/server"
import { Encabezado } from "./encabezado"
import { Navegacion } from "./navegacion"

export default async function LayoutDeLaApp({ children }: { children: React.ReactNode }) {
  const sesion = await leerSesion(await createClient())
  if (sesion.estado === "anonima") redirect(RUTA_DE_INGRESO)
  if (sesion.estado === "sin_acceso") redirect(`${RUTA_DE_SALIR}?motivo=sin_acceso`)
  const gasto = await leerGasto()
  return (
    <div className="flex min-h-dvh flex-col">
      {gasto ? (
        <Encabezado gastadoMicro={gasto.gastadoMicro} topeMicro={gasto.topeMicro} />
      ) : (
        <div aria-hidden="true" className="pt-[env(safe-area-inset-top)]" />
      )}
      <main className="flex-1 px-4 pb-28 pt-4">{children}</main>
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
