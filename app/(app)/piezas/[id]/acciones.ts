"use server"

import { revalidatePath } from "next/cache"
import type { Resultado } from "@/lib/marcas/acciones"
import { cerrarAMano, descartar, desprogramar, dudosoAMano, firmarPieza } from "@/lib/piezas/acciones"
import { RUTA_DE_INICIO, rutaDePieza } from "@/lib/sesion/rutas"
import { createActionClient } from "@/lib/supabase/action"

function despues(piezaId: string, resultado: Resultado): Resultado {
  if (resultado.ok) {
    revalidatePath(rutaDePieza(piezaId))
    revalidatePath(RUTA_DE_INICIO)
  }
  return resultado
}

export async function firmarAccion(entrada: {
  piezaId: string
  huella: string
  programadaPara: string
}): Promise<Resultado> {
  return despues(entrada.piezaId, await firmarPieza(await createActionClient(), entrada))
}

export async function desprogramarAccion(piezaId: string): Promise<Resultado> {
  return despues(piezaId, await desprogramar(await createActionClient(), piezaId))
}

export async function descartarAccion(piezaId: string, motivo: string): Promise<Resultado> {
  return despues(piezaId, await descartar(await createActionClient(), piezaId, motivo))
}

export async function cerrarAManoAccion(entrada: { piezaId: string; enlace: string }): Promise<Resultado> {
  return despues(entrada.piezaId, await cerrarAMano(await createActionClient(), entrada))
}

export async function dudosoAManoAccion(piezaId: string): Promise<Resultado> {
  return despues(piezaId, await dudosoAMano(await createActionClient(), piezaId))
}
