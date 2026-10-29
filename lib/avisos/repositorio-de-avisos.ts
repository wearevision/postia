import type { Db } from "@/lib/supabase/database"
import type { MensajePush } from "./tipos"

export interface LineaPendiente extends MensajePush {
  id: string
  marcaId: string
}

const TREINTA_DIAS_MS = 30 * 86_400_000
// A line older than this is stale news: the digest drops it instead of repeating it forever.
const TRES_DIAS_MS = 3 * 86_400_000

function fallo(accion: string, error: { message: string }): never {
  throw new Error(`${accion}: ${error.message}`, { cause: error })
}

export async function anotarAviso(db: Db, marcaId: string, aviso: MensajePush): Promise<void> {
  const { error } = await db
    .from("avisos_pendientes")
    .insert({ marca_id: marcaId, titulo: aviso.titulo, cuerpo: aviso.cuerpo, url: aviso.url })
  if (error) fallo("No pude anotar el aviso", error)
}

export async function avisosSinEnviar(db: Db, ahora = Date.now()): Promise<LineaPendiente[]> {
  const { data, error } = await db
    .from("avisos_pendientes")
    .select("id, marca_id, titulo, cuerpo, url")
    .is("enviado_en", null)
    .gte("creado_en", new Date(ahora - TRES_DIAS_MS).toISOString())
    .order("creado_en")
  if (error) fallo("No pude leer los avisos pendientes", error)
  return data.map((f) => ({ id: f.id, marcaId: f.marca_id, titulo: f.titulo, cuerpo: f.cuerpo, url: f.url }))
}

export async function marcarEnviados(db: Db, ids: readonly string[], ahora: number): Promise<void> {
  if (ids.length === 0) return
  const { error } = await db
    .from("avisos_pendientes")
    .update({ enviado_en: new Date(ahora).toISOString() })
    .in("id", [...ids])
  if (error) fallo("No pude marcar los avisos como enviados", error)
}

export async function borrarAvisosEnviados(db: Db, ahora: number): Promise<void> {
  // Sent lines go after a month; so do lines nobody could receive (no device), which the digest stopped reading at 3 days.
  const corte = new Date(ahora - TREINTA_DIAS_MS).toISOString()
  const { error } = await db.from("avisos_pendientes").delete().or(`enviado_en.lt.${corte},creado_en.lt.${corte}`)
  if (error) fallo("No pude borrar los avisos viejos", error)
}
