import type { Db } from "@/lib/supabase/database"

export interface Invitacion {
  correo: string
  marca: string
  voz: "yo" | "nosotros"
}

/** Service role only. Sign-up is closed (config.toml), so this is the one door into the app. */
export async function invitar(db: Db, invitacion: Invitacion): Promise<{ userId: string; marcaId: string }> {
  const correo = invitacion.correo.trim().toLowerCase()
  const marcaId = await marcaPorNombre(db, invitacion.marca.trim(), invitacion.voz)
  const userId = await usuarioPorCorreo(db, correo)
  const { error } = await db
    .from("miembros")
    .upsert(
      { marca_id: marcaId, user_id: userId, rol: "dueno" },
      { onConflict: "marca_id,user_id", ignoreDuplicates: true },
    )
  if (error) throw new Error(`No pude dar acceso a ${correo}: ${error.message}`, { cause: error })
  return { userId, marcaId }
}

async function marcaPorNombre(db: Db, nombre: string, voz: Invitacion["voz"]): Promise<string> {
  const { data, error } = await db.from("marcas").select("id").eq("nombre", nombre).maybeSingle()
  if (error) throw new Error(`No pude buscar la marca ${nombre}: ${error.message}`, { cause: error })
  if (data) return data.id
  const { data: nueva, error: errorAlCrear } = await db.from("marcas").insert({ nombre, voz }).select("id").single()
  if (errorAlCrear)
    throw new Error(`No pude crear la marca ${nombre}: ${errorAlCrear.message}`, { cause: errorAlCrear })
  return nueva.id
}

async function usuarioPorCorreo(db: Db, correo: string): Promise<string> {
  const { data, error } = await db.auth.admin.createUser({ email: correo, email_confirm: true })
  if (!error) return data.user.id
  if (error.code !== "email_exists") throw new Error(`No pude crear a ${correo}: ${error.message}`, { cause: error })
  // The admin API has no lookup by email; the team is a handful of people, so one page holds everyone.
  const { data: lista, error: errorDeLista } = await db.auth.admin.listUsers({ page: 1, perPage: 1000 })
  if (errorDeLista) throw new Error(`No pude listar usuarios: ${errorDeLista.message}`, { cause: errorDeLista })
  const usuario = lista.users.find((u) => u.email?.toLowerCase() === correo)
  if (!usuario) throw new Error(`Supabase dice que ${correo} existe, pero no aparece en la lista.`)
  return usuario.id
}
