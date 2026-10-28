"use server"

import { revalidatePath } from "next/cache"
import type { Resultado } from "@/lib/marcas/acciones"
import { crearPieza } from "@/lib/piezas/acciones"
import { RUTA_DE_INICIO } from "@/lib/sesion/rutas"
import { createActionClient } from "@/lib/supabase/action"

export async function crearPiezaAccion(entrada: unknown): Promise<Resultado<{ piezaId: string }>> {
  const resultado = await crearPieza(await createActionClient(), entrada)
  if (resultado.ok) revalidatePath(RUTA_DE_INICIO)
  return resultado
}
