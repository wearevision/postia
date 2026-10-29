"use server"

import { revalidatePath } from "next/cache"
import type { Resultado } from "@/lib/marcas/acciones"
import {
  cerrarAMano,
  descartar,
  desprogramar,
  dudosoAMano,
  firmarParaReserva,
  firmarPieza,
  planearPieza,
  ponerPilar,
  sacarDeReserva,
} from "@/lib/piezas/acciones"
import { RUTA_DE_CALENDARIO, RUTA_DE_INICIO, rutaDePieza } from "@/lib/sesion/rutas"
import { createActionClient } from "@/lib/supabase/action"

function despues(piezaId: string, resultado: Resultado): Resultado {
  if (resultado.ok) {
    revalidatePath(rutaDePieza(piezaId))
    revalidatePath(RUTA_DE_INICIO)
    revalidatePath(RUTA_DE_CALENDARIO)
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

export async function planearAccion(entrada: { piezaId: string; planeadaPara: string }): Promise<Resultado> {
  return despues(entrada.piezaId, await planearPieza(await createActionClient(), entrada))
}

export async function firmarParaReservaAccion(entrada: { piezaId: string; huella: string }): Promise<Resultado> {
  return despues(entrada.piezaId, await firmarParaReserva(await createActionClient(), entrada))
}

// sacarDeReserva re-plans the piece itself and logs a failed plan; only a refused take-out is an error here.
export async function sacarDeReservaAccion(piezaId: string): Promise<Resultado> {
  return despues(piezaId, await sacarDeReserva(await createActionClient(), piezaId))
}

export async function ponerPilarAccion(entrada: { piezaId: string; pilarId: string | null }): Promise<Resultado> {
  return despues(entrada.piezaId, await ponerPilar(await createActionClient(), entrada))
}
