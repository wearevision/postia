import { z } from "zod"
import type { Db } from "@/lib/supabase/database"
import type { ServicioPush } from "./push"

const Suscripcion = z.object({
  endpoint: z.url().startsWith("https://").max(2048),
  p256dh: z.string().min(1).max(512),
  auth: z.string().min(1).max(512),
  userAgent: z.string().max(300),
})

export type Resultado = { ok: true } | { ok: false; error: string }

export async function guardarSuscripcion(db: Db, entrada: unknown): Promise<Resultado> {
  const leida = Suscripcion.safeParse(entrada)
  if (!leida.success) return { ok: false, error: "Ese aparato no se puede suscribir." }
  const { endpoint, p256dh, auth, userAgent } = leida.data
  const { error } = await db.from("suscripciones_push").insert({ endpoint, p256dh, auth, user_agent: userAgent })
  // The same device subscribing again is already there.
  if (!error || error.code === "23505") return { ok: true }
  console.error("No pude guardar la suscripción", error.code)
  return { ok: false, error: "No pude activar los avisos. Inténtalo de nuevo." }
}

export async function quitarSuscripcion(db: Db, endpoint: string): Promise<void> {
  const { error } = await db.from("suscripciones_push").delete().eq("endpoint", endpoint)
  if (error) throw new Error(`No pude quitar el aparato: ${error.message}`, { cause: error })
}

export async function enviarAvisoDePrueba(
  db: Db,
  servicio: ServicioPush,
): Promise<{ enviados: number; caducadas: number; fallos: number }> {
  const { data, error } = await db.from("suscripciones_push").select("endpoint, p256dh, auth")
  if (error) throw new Error(`No pude leer tus aparatos: ${error.message}`, { cause: error })
  const cuenta = { enviados: 0, caducadas: 0, fallos: 0 }
  for (const suscripcion of data) {
    const resultado = await servicio.enviar(
      suscripcion,
      { titulo: "PostIA", cuerpo: "Así se ven tus avisos.", url: "/" },
      { urgente: false },
    )
    if (resultado.estado === "enviado") cuenta.enviados++
    else if (resultado.estado === "caducada") {
      cuenta.caducadas++
      await quitarSuscripcion(db, suscripcion.endpoint)
    } else {
      cuenta.fallos++
      console.error(resultado.detalle)
    }
  }
  return cuenta
}
