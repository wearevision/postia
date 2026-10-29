"use server"

import { revalidatePath } from "next/cache"
import { z } from "zod"
import type { Resultado } from "@/lib/marcas/acciones"
import { crearPieza, planearConFechaPropuesta, ponerPilar } from "@/lib/piezas/acciones"
import { RUTA_DE_CALENDARIO, RUTA_DE_INICIO } from "@/lib/sesion/rutas"
import { createActionClient } from "@/lib/supabase/action"

export async function crearPiezaAccion(entrada: unknown): Promise<Resultado<{ piezaId: string }>> {
  const db = await createActionClient()
  const resultado = await crearPieza(db, entrada)
  if (!resultado.ok) return resultado
  // A failed plan never loses the piece: its page offers «Mover fecha».
  const plan = await planearConFechaPropuesta(db, resultado.piezaId)
  if (!plan.ok) console.error("No pude planear la pieza nueva", resultado.piezaId, plan.error)
  // Same rule for the pillar: the piece is kept and its page offers «Pilar».
  const pilar = z.object({ pilarId: z.uuid() }).safeParse(entrada)
  if (pilar.success) {
    const puesto = await ponerPilar(db, { piezaId: resultado.piezaId, pilarId: pilar.data.pilarId })
    if (!puesto.ok) console.error("No pude poner el pilar de la pieza nueva", resultado.piezaId, puesto.error)
  }
  revalidatePath(RUTA_DE_INICIO)
  revalidatePath(RUTA_DE_CALENDARIO)
  return resultado
}
