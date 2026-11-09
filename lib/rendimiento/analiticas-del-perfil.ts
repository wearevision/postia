import type { Db } from "@/lib/supabase/database"

/**
 * When the owner's «Estudio WAV» connection that reads this profile's analytics runs out, or null when there is none
 * with r_member_postAnalytics (or the person is not a member of the brand). The rule lives in SQL
 * (conexion_de_analiticas); no token leaves the database.
 */
export async function vencimientoDeAnaliticas(db: Db, cuentaId: string): Promise<string | null> {
  const { data, error } = await db.rpc("analiticas_del_perfil", { p_cuenta: cuentaId })
  if (error) throw new Error(`No pude leer las analíticas del perfil: ${error.message}`, { cause: error })
  // The generated type says string; the function returns null when no connection reads the profile.
  const expiraEn: string | null = data
  return expiraEn
}
