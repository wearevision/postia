"use server"

import { revalidatePath } from "next/cache"
import { marcarExcepcion, quitarExcepcion } from "@/lib/clientes/acciones"
import type { Resultado } from "@/lib/marcas/acciones"
import { RUTA_DE_CLIENTES } from "@/lib/sesion/rutas"
import { createActionClient } from "@/lib/supabase/action"

export async function marcarExcepcionAccion(entrada: unknown): Promise<Resultado<{ id: string }>> {
  const resultado = await marcarExcepcion(await createActionClient(), entrada)
  if (resultado.ok) revalidatePath(RUTA_DE_CLIENTES)
  return resultado
}

export async function quitarExcepcionAccion(id: string): Promise<Resultado> {
  const resultado = await quitarExcepcion(await createActionClient(), id)
  if (resultado.ok) revalidatePath(RUTA_DE_CLIENTES)
  return resultado
}
