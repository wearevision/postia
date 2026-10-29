"use server"

import { revalidatePath } from "next/cache"
import type { Resultado } from "@/lib/marcas/acciones"
import { crearPieza, planearConFechaPropuesta } from "@/lib/piezas/acciones"
import { RUTA_DE_INICIO } from "@/lib/sesion/rutas"
import { createActionClient } from "@/lib/supabase/action"

export async function crearPiezaAccion(entrada: unknown): Promise<Resultado<{ piezaId: string }>> {
  const db = await createActionClient()
  const resultado = await crearPieza(db, entrada)
  if (!resultado.ok) return resultado
  // A failed plan never loses the piece: its page offers «Mover fecha».
  const plan = await planearConFechaPropuesta(db, resultado.piezaId)
  if (!plan.ok) console.error("No pude planear la pieza nueva", resultado.piezaId, plan.error)
  revalidatePath(RUTA_DE_INICIO)
  return resultado
}
