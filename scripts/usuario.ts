import { Falla } from "@/lib/dominio/falla"
import type { Db } from "@/lib/supabase/database"

export async function buscarUsuario(db: Db, correo: string): Promise<string> {
  // The admin API has no lookup by email; the team is a handful of people, so one page holds everyone.
  const { data, error } = await db.auth.admin.listUsers({ page: 1, perPage: 1000 })
  if (error) throw new Error(`No pude listar usuarios: ${error.message}`, { cause: error })
  const usuario = data.users.find((u) => u.email?.toLowerCase() === correo)
  if (!usuario) throw new Falla(`No existe un usuario con el correo ${correo}.`)
  return usuario.id
}
