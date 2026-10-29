"use server"

import { revalidatePath } from "next/cache"
import { enviarAvisoDePrueba, guardarSuscripcion } from "@/lib/avisos/acciones"
import { servicioPushReal } from "@/lib/avisos/push"
import type { SuscripcionDelNavegador } from "@/lib/avisos/tipos"
import { guardarTope } from "@/lib/gasto/acciones"
import type { Resultado } from "@/lib/marcas/acciones"
import { createActionClient } from "@/lib/supabase/action"

export async function guardarSuscripcionAccion(suscripcion: SuscripcionDelNavegador) {
  return guardarSuscripcion(await createActionClient(), suscripcion)
}

export async function probarAvisoAccion(): Promise<string> {
  const { enviados, fallos } = await enviarAvisoDePrueba(await createActionClient(), servicioPushReal())
  if (enviados > 0) return `Listo: mandé el aviso a ${enviados} ${enviados === 1 ? "aparato" : "aparatos"}.`
  return fallos > 0
    ? "No pude mandar el aviso. Inténtalo de nuevo."
    : "No hay aparatos activos. Activa los avisos otra vez."
}

export async function guardarTopeAccion(entrada: unknown): Promise<Resultado> {
  const resultado = await guardarTope(await createActionClient(), entrada)
  if (resultado.ok) revalidatePath("/ajustes")
  return resultado
}
