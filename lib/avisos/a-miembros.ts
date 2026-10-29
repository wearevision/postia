import type { Aviso } from "@/lib/publicacion/publicar"
import type { Db } from "@/lib/supabase/database"
import type { ServicioPush } from "./push"

/** Returns how many devices received the notice. */
async function avisarAparatos(
  db: Db,
  servicio: ServicioPush,
  userIds: readonly string[],
  aviso: Aviso,
  urgente: boolean,
): Promise<number> {
  if (userIds.length === 0) return 0
  const { data: aparatos, error: errorDeAparatos } = await db
    .from("suscripciones_push")
    .select("endpoint, p256dh, auth")
    .in("user_id", [...userIds])
  if (errorDeAparatos) {
    throw new Error(`No pude leer los aparatos: ${errorDeAparatos.message}`, { cause: errorDeAparatos })
  }
  let recibidos = 0
  for (const aparato of aparatos) {
    try {
      const resultado = await servicio.enviar(aparato, aviso, { urgente })
      if (resultado.estado === "enviado") recibidos++
      if (resultado.estado === "caducada") {
        const { error: errorAlBorrar } = await db.from("suscripciones_push").delete().eq("endpoint", aparato.endpoint)
        if (errorAlBorrar) console.error(`No pude olvidar un aparato caducado: ${errorAlBorrar.message}`)
      } else if (resultado.estado === "fallo") {
        console.error(resultado.detalle)
      }
    } catch (error) {
      // The endpoint is a capability: only the message is logged.
      console.error(`No pude avisar a un aparato: ${error instanceof Error ? error.message : String(error)}`)
    }
  }
  return recibidos
}

/** Every device of every member of a brand. Expired subscriptions are forgotten; a failing device is logged and skipped, never thrown. */
export async function avisarMiembros(db: Db, servicio: ServicioPush, marcaId: string, aviso: Aviso, urgente = true) {
  const { data: miembros, error } = await db.from("miembros").select("user_id").eq("marca_id", marcaId)
  if (error) throw new Error(`No pude leer los miembros: ${error.message}`, { cause: error })
  await avisarAparatos(
    db,
    servicio,
    miembros.map((m) => m.user_id),
    aviso,
    urgente,
  )
}

/** Every device of one person, same rules as avisarMiembros: the digest is one push per person, not per brand. */
/** Returns how many devices received it. */
export async function avisarPersona(
  db: Db,
  servicio: ServicioPush,
  userId: string,
  aviso: Aviso,
  urgente: boolean,
): Promise<number> {
  return avisarAparatos(db, servicio, [userId], aviso, urgente)
}
