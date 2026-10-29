import type { Db } from "@/lib/supabase/database"
import type { MensajePush } from "./tipos"

export interface LineaPendiente extends MensajePush {
  id: string
  marcaId: string
}

const TREINTA_DIAS_MS = 30 * 86_400_000

function fallo(accion: string, error: { message: string }): never {
  throw new Error(`${accion}: ${error.message}`, { cause: error })
}

export async function anotarAviso(db: Db, marcaId: string, aviso: MensajePush): Promise<void> {
  const { error } = await db
    .from("avisos_pendientes")
    .insert({ marca_id: marcaId, titulo: aviso.titulo, cuerpo: aviso.cuerpo, url: aviso.url })
  if (error) fallo("No pude anotar el aviso", error)
}

export async function avisosSinEnviar(db: Db): Promise<LineaPendiente[]> {
  const { data, error } = await db
    .from("avisos_pendientes")
    .select("id, marca_id, titulo, cuerpo, url")
    .is("enviado_en", null)
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
  const { error } = await db
    .from("avisos_pendientes")
    .delete()
    .lt("enviado_en", new Date(ahora - TREINTA_DIAS_MS).toISOString())
  if (error) fallo("No pude borrar los avisos viejos", error)
}
