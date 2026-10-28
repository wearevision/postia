import { redirect } from "next/navigation"
import { RUTA_DE_INGRESO, RUTA_DE_SALIR } from "@/lib/sesion/rutas"
import { leerSesion } from "@/lib/sesion/sesion"
import { createClient } from "@/lib/supabase/server"
import { Navegacion } from "./navegacion"

export default async function LayoutDeLaApp({ children }: { children: React.ReactNode }) {
  const sesion = await leerSesion(await createClient())
  if (sesion.estado === "anonima") redirect(RUTA_DE_INGRESO)
  if (sesion.estado === "sin_acceso") redirect(`${RUTA_DE_SALIR}?motivo=sin_acceso`)
  return (
    <div className="flex min-h-dvh flex-col">
      <main className="flex-1 px-4 pt-[max(1rem,env(safe-area-inset-top))] pb-28">{children}</main>
      <Navegacion />
    </div>
  )
}
