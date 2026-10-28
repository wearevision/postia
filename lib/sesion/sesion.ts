import type { Db } from "@/lib/supabase/database"

export interface MarcaVisible {
  id: string
  nombre: string
  rol: string
}

export type Sesion =
  | { estado: "anonima" }
  | { estado: "sin_acceso"; userId: string }
  | { estado: "miembro"; userId: string; correo: string; marcas: MarcaVisible[] }

export async function leerSesion(db: Db): Promise<Sesion> {
  const { data, error } = await db.auth.getUser()
  // No session or an invalid one is simply anonymous; an outage of Auth must not look like a sign-out.
  if (error && (error.status ?? 0) >= 500) {
    throw new Error(`Supabase Auth no respondió: ${error.message}`, { cause: error })
  }
  const usuario = data.user
  if (!usuario) return { estado: "anonima" }

  const { data: filas, error: errorDeMarcas } = await db
    .from("miembros")
    .select("rol, marcas(id, nombre)")
    .eq("user_id", usuario.id)
    .order("creado_en")
  if (errorDeMarcas) {
    throw new Error(`No pude leer las marcas de la sesión: ${errorDeMarcas.message}`, { cause: errorDeMarcas })
  }

  const marcas = filas.flatMap((fila) =>
    fila.marcas ? [{ id: fila.marcas.id, nombre: fila.marcas.nombre, rol: fila.rol }] : [],
  )
  if (marcas.length === 0) return { estado: "sin_acceso", userId: usuario.id }
  return { estado: "miembro", userId: usuario.id, correo: usuario.email ?? "", marcas }
}
