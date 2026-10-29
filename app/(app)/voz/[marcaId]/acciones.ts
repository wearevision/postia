"use server"

import { revalidatePath } from "next/cache"
import type { Resultado } from "@/lib/marcas/acciones"
import { RUTA_DE_VOZ } from "@/lib/sesion/rutas"
import { createActionClient } from "@/lib/supabase/action"
import { guardarLinea } from "@/lib/voz/acciones"

export async function guardarLineaAccion(entrada: unknown): Promise<Resultado<{ version: number }>> {
  const resultado = await guardarLinea(await createActionClient(), entrada)
  if (resultado.ok) revalidatePath(RUTA_DE_VOZ, "layout")
  return resultado
}
