import type { Db } from "@/lib/supabase/database"

/** How many signed, scheduled pieces each account has: Ajustes warns before such an account starts publishing by API. */
export async function piezasProgramadas(db: Db, cuentas: readonly string[]): Promise<Map<string, number>> {
  const conteo = new Map<string, number>()
  if (cuentas.length === 0) return conteo
  const { data, error } = await db
    .from("piezas")
    .select("cuenta_id")
    .eq("estado", "programada")
    .in("cuenta_id", [...cuentas])
  if (error) throw new Error(`No pude contar las piezas programadas: ${error.message}`, { cause: error })
  for (const { cuenta_id } of data) conteo.set(cuenta_id, (conteo.get(cuenta_id) ?? 0) + 1)
  return conteo
}
