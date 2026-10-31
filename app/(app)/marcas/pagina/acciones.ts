"use server"

import { revalidatePath } from "next/cache"
import { redirect } from "next/navigation"
import { elegirPagina } from "@/lib/linkedin/pagina"
import { RUTA_DE_AJUSTES } from "@/lib/sesion/rutas"
import { createActionClient } from "@/lib/supabase/action"

export async function elegirPaginaAccion(datos: FormData): Promise<void> {
  const resultado = await elegirPagina(await createActionClient(), {
    eleccion: datos.get("eleccion"),
    organizacion: datos.get("organizacion"),
  })
  if (resultado === "conectada") revalidatePath(RUTA_DE_AJUSTES)
  redirect(`${RUTA_DE_AJUSTES}?linkedin=${resultado}`)
}
