import type { Aviso } from "@/lib/publicacion/publicar"
import type { Db } from "@/lib/supabase/database"
import type { ServicioPush } from "./push"

/** Every device of every member of a brand. Expired subscriptions are forgotten; a failing device is logged and skipped, never thrown. */
export async function avisarMiembros(db: Db, servicio: ServicioPush, marcaId: string, aviso: Aviso, urgente = true) {
  const { data: miembros, error } = await db.from("miembros").select("user_id").eq("marca_id", marcaId)
  if (error) throw new Error(`No pude leer los miembros: ${error.message}`, { cause: error })
  if (miembros.length === 0) return
  const { data: aparatos, error: errorDeAparatos } = await db
    .from("suscripciones_push")
    .select("endpoint, p256dh, auth")
    .in(
      "user_id",
      miembros.map((m) => m.user_id),
    )
  if (errorDeAparatos) {
    throw new Error(`No pude leer los aparatos: ${errorDeAparatos.message}`, { cause: errorDeAparatos })
  }
  for (const aparato of aparatos) {
    try {
      const resultado = await servicio.enviar(aparato, aviso, { urgente })
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
}
