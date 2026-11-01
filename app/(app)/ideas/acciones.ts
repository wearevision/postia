"use server"

import { revalidatePath } from "next/cache"
import type { Resultado } from "@/lib/marcas/acciones"
import {
  type AsignacionAprobada,
  aprobarIdea,
  aprobarSerie,
  descartarIdea,
  editarIdea,
  moverAsignacion,
  pedirOtraIdea,
  pedirSerie,
} from "@/lib/series/acciones"
import { RUTA_DE_CALENDARIO, RUTA_DE_IDEAS, RUTA_DE_INICIO, rutaDeInvestigacion } from "@/lib/sesion/rutas"
import { createActionClient } from "@/lib/supabase/action"

function revalidar(): void {
  revalidatePath(RUTA_DE_IDEAS)
  revalidatePath(RUTA_DE_CALENDARIO)
  revalidatePath(RUTA_DE_INICIO)
}

async function conRevalidacion<T extends Resultado>(resultado: Promise<T>): Promise<T> {
  const r = await resultado
  if (r.ok) revalidar()
  return r
}

export async function aprobarIdeaAccion(
  ideaId: string,
  cuentas: string[],
  tema?: string,
): Promise<Resultado<{ asignaciones: AsignacionAprobada[] }>> {
  return conRevalidacion(aprobarIdea(await createActionClient(), { ideaId, cuentas, tema }))
}

export async function aprobarSerieAccion(
  investigacionId: string,
  tema?: string,
): Promise<Resultado<{ aprobadas: number }>> {
  // A partial approval changes the page too (some proposals are now approved), so revalidate on every result.
  const r = await aprobarSerie(await createActionClient(), investigacionId, tema)
  revalidar()
  return r
}

export async function descartarIdeaAccion(ideaId: string): Promise<Resultado> {
  return conRevalidacion(descartarIdea(await createActionClient(), ideaId))
}

export async function editarIdeaAccion(ideaId: string, gancho: string, esqueleto: string): Promise<Resultado> {
  return conRevalidacion(editarIdea(await createActionClient(), { ideaId, gancho, esqueleto }))
}

export async function pedirOtraIdeaAccion(ideaId: string): Promise<Resultado> {
  return conRevalidacion(pedirOtraIdea(await createActionClient(), ideaId))
}

export async function moverAsignacionAccion(asignacionId: string, planeadaPara: string): Promise<Resultado> {
  return conRevalidacion(moverAsignacion(await createActionClient(), { asignacionId, planeadaPara }))
}

export async function pedirSerieAccion(investigacionId: string): Promise<Resultado> {
  const r = await pedirSerie(await createActionClient(), investigacionId)
  if (r.ok) {
    revalidar()
    revalidatePath(rutaDeInvestigacion(investigacionId))
  }
  return r
}
