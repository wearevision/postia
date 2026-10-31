import { createClient } from "@supabase/supabase-js"
import { crearPieza, crearPiezaCon, planearConFechaPropuesta, ponerPilar } from "@/lib/piezas/acciones"
import type { Db } from "@/lib/supabase/database"
import type { Database } from "@/lib/supabase/database.types"
import { entornoLocal } from "../integration/entorno"

/**
 * A client signed in as an existing invited user, which is what the RPCs behind the app's actions need (they check
 * auth.uid()). It opens its own session from a one-time code, so it never touches the password or the browser's session.
 */
export async function clienteDe(admin: Db, correo: string): Promise<Db> {
  const { data, error } = await admin.auth.admin.generateLink({ type: "magiclink", email: correo })
  if (error) throw new Error(`No pude preparar al usuario de prueba: ${error.message}`)
  const { url, anon } = entornoLocal()
  const db = createClient<Database>(url, anon, { auth: { persistSession: false, autoRefreshToken: false } })
  const { error: errorDeIngreso } = await db.auth.verifyOtp({
    email: correo,
    token: data.properties.email_otp,
    type: "email",
  })
  if (errorDeIngreso) throw new Error(`No pude abrir sesión del usuario de prueba: ${errorDeIngreso.message}`)
  return db
}

/**
 * Creates a text piece the way the app does (create, plan in the first free slot, optional pillar), so it arrives planned.
 * `db` is a signed-in client from `clienteDe`: open one per test and reuse it, because each session spends auth rate limit.
 */
export async function crearPiezaDeTexto(
  db: Db,
  datos: { cuentaId: string; texto: string; pilarId?: string },
): Promise<string> {
  const resultado = await crearPiezaCon(
    {
      crear: (entrada) => crearPieza(db, entrada),
      planear: (piezaId) => planearConFechaPropuesta(db, piezaId),
      ponerPilar: (entrada) => ponerPilar(db, entrada),
    },
    { cuentaId: datos.cuentaId, formato: "texto", texto: datos.texto, pilarId: datos.pilarId ?? null },
  )
  if (!resultado.ok) throw new Error(`No pude crear la pieza de prueba: ${resultado.error}`)
  if (resultado.aviso.length > 0) throw new Error(`La pieza de prueba quedó sin: ${resultado.aviso.join(", ")}`)
  return resultado.piezaId
}
