"use server"

import { revalidatePath } from "next/cache"
import { pedirDiseno } from "@/lib/disenos/acciones"
import type { Resultado } from "@/lib/marcas/acciones"
import { RUTA_DE_CARRUSEL } from "@/lib/sesion/rutas"
import { createActionClient } from "@/lib/supabase/action"

export async function pedirDisenoAccion(entrada: unknown): Promise<Resultado<{ pedidoId: string }>> {
  const resultado = await pedirDiseno(await createActionClient(), entrada)
  if (resultado.ok) revalidatePath(RUTA_DE_CARRUSEL)
  return resultado
}
