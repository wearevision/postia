"use server"

import { revalidatePath } from "next/cache"
import type { Resultado } from "@/lib/marcas/acciones"
import { pedirActualizacionDeAnaliticas } from "@/lib/rendimiento/acciones-de-analiticas"
import { decidirAprendizaje, pedirLectura } from "@/lib/rendimiento/acciones-de-aprendizajes"
import { RUTA_DE_RENDIMIENTO } from "@/lib/sesion/rutas"
import { createActionClient } from "@/lib/supabase/action"

export async function decidirAprendizajeAccion(
  id: string,
  estado: "aprobado" | "descartado",
  texto?: string,
): Promise<Resultado> {
  const resultado = await decidirAprendizaje(await createActionClient(), { id, estado, texto })
  if (resultado.ok) revalidatePath(RUTA_DE_RENDIMIENTO)
  return resultado
}

export async function pedirLecturaAccion(cuentaId: string): Promise<Resultado> {
  const resultado = await pedirLectura(await createActionClient(), cuentaId)
  // A refused request can still change the page (a reading was already open), so refresh on every answer.
  revalidatePath(RUTA_DE_RENDIMIENTO)
  return resultado
}

export async function actualizarDesdeLinkedinAccion(cuentaId: string): Promise<Resultado> {
  const resultado = await pedirActualizacionDeAnaliticas(await createActionClient(), cuentaId)
  revalidatePath(RUTA_DE_RENDIMIENTO)
  return resultado
}
