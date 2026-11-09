import { z } from "zod"
import type { Resultado } from "@/lib/marcas/acciones"
import type { Db } from "@/lib/supabase/database"

// Worker-safe: «Actualizar desde LinkedIn» only queues a reading; the Trigger.dev task (trigger/analiticas.ts) does it.

const Id = z.uuid()

export async function pedirActualizacionDeAnaliticas(db: Db, cuentaId: string): Promise<Resultado> {
  if (!Id.safeParse(cuentaId).success) return { ok: false, error: "Revisa la cuenta." }
  const { error } = await db.rpc("pedir_lectura_de_analiticas", { p_cuenta: cuentaId })
  if (!error) return { ok: true }
  if (error.message === "lectura_en_curso")
    return { ok: false, error: "LinkedIn ya se está leyendo. Espera a que termine." }
  if (error.message === "analiticas_sin_conexion")
    return { ok: false, error: "Reconecta LinkedIn desde Ajustes para actualizar las cifras." }
  if (error.message === "solo_el_dueno_pide_lecturas")
    return { ok: false, error: "Solo el dueño de la marca de esa cuenta puede actualizar las cifras." }
  console.error("No pude pedir la actualización de analíticas", error.code, error.message)
  return { ok: false, error: "No pude pedir la actualización. Inténtalo de nuevo en un rato." }
}
