"use server"

import { enviarAvisoDePrueba, guardarSuscripcion } from "@/lib/avisos/acciones"
import { servicioPushReal } from "@/lib/avisos/push"
import type { SuscripcionDelNavegador } from "@/lib/avisos/tipos"
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
