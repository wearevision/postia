"use server"

import { revalidatePath } from "next/cache"
import type { Resultado } from "@/lib/marcas/acciones"
import { pedirTexto } from "@/lib/redaccion/acciones"
import { RUTA_DE_PEDIR_TEXTO } from "@/lib/sesion/rutas"
import { createActionClient } from "@/lib/supabase/action"

export async function pedirTextoAccion(entrada: unknown): Promise<Resultado<{ pedidoId: string }>> {
  const resultado = await pedirTexto(await createActionClient(), entrada)
  if (resultado.ok) revalidatePath(RUTA_DE_PEDIR_TEXTO)
  return resultado
}
