"use server"

import { revalidatePath } from "next/cache"
import type { Resultado } from "@/lib/marcas/acciones"
import {
  type AvisoDePiezaNueva,
  crearPieza,
  crearPiezaCon,
  planearConFechaPropuesta,
  ponerPilar,
} from "@/lib/piezas/acciones"
import { RUTA_DE_CALENDARIO, RUTA_DE_INICIO } from "@/lib/sesion/rutas"
import { createActionClient } from "@/lib/supabase/action"

export async function crearPiezaAccion(
  entrada: unknown,
): Promise<Resultado<{ piezaId: string; aviso: AvisoDePiezaNueva[] }>> {
  const db = await createActionClient()
  const resultado = await crearPiezaCon(
    {
      crear: (e) => crearPieza(db, e),
      planear: (piezaId) => planearConFechaPropuesta(db, piezaId),
      ponerPilar: (e) => ponerPilar(db, e),
    },
    entrada,
  )
  if (resultado.ok) {
    revalidatePath(RUTA_DE_INICIO)
    revalidatePath(RUTA_DE_CALENDARIO)
  }
  return resultado
}
