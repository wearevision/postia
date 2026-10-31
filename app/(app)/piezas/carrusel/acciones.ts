"use server"

import { revalidatePath } from "next/cache"
import { pedirDiseno } from "@/lib/disenos/acciones"
import type { Resultado } from "@/lib/marcas/acciones"
import { RUTA_DE_CARRUSEL } from "@/lib/sesion/rutas"
import { createActionClient } from "@/lib/supabase/action"

export async function pedirDisenoAccion(entrada: unknown): Promise<Resultado<{ pedidoId: string }>> {
  // Carousels are written from approved ideas; this action only re-designs the carousel of an existing piece.
  if (typeof entrada !== "object" || entrada === null || !("piezaId" in entrada) || typeof entrada.piezaId !== "string")
    return { ok: false, error: "Elige la pieza que quieres editar." }
  const resultado = await pedirDiseno(await createActionClient(), entrada)
  if (resultado.ok) revalidatePath(RUTA_DE_CARRUSEL)
  return resultado
}
