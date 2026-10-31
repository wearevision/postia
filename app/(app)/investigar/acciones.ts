"use server"

import { revalidatePath } from "next/cache"
import {
  aprobarInforme,
  descartarHallazgo,
  descartarInforme,
  pedirAmpliacion,
  pedirInvestigacion,
} from "@/lib/investigacion/acciones"
import type { Resultado } from "@/lib/marcas/acciones"
import { RUTA_DE_INICIO, RUTA_DE_INVESTIGAR, rutaDeInvestigacion } from "@/lib/sesion/rutas"
import { createActionClient } from "@/lib/supabase/action"

function revalidar(investigacionId?: string): void {
  revalidatePath(RUTA_DE_INVESTIGAR)
  revalidatePath(RUTA_DE_INICIO)
  if (investigacionId) revalidatePath(rutaDeInvestigacion(investigacionId))
}

export async function pedirInvestigacionAccion(entrada: unknown): Promise<Resultado<{ investigacionId: string }>> {
  const resultado = await pedirInvestigacion(await createActionClient(), entrada)
  if (resultado.ok) revalidar()
  return resultado
}

export async function pedirAmpliacionAccion(investigacionId: string, angulo: string): Promise<Resultado> {
  const resultado = await pedirAmpliacion(await createActionClient(), { investigacionId, angulo })
  if (resultado.ok) revalidar(investigacionId)
  return resultado
}

export async function aprobarInformeAccion(investigacionId: string): Promise<Resultado> {
  const resultado = await aprobarInforme(await createActionClient(), investigacionId)
  if (resultado.ok) revalidar(investigacionId)
  return resultado
}

export async function descartarInformeAccion(investigacionId: string): Promise<Resultado> {
  const resultado = await descartarInforme(await createActionClient(), investigacionId)
  if (resultado.ok) revalidar(investigacionId)
  return resultado
}

export async function descartarHallazgoAccion(investigacionId: string, hallazgoId: string): Promise<Resultado> {
  const resultado = await descartarHallazgo(await createActionClient(), hallazgoId)
  if (resultado.ok) revalidar(investigacionId)
  return resultado
}
