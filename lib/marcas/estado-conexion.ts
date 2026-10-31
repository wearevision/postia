const DIA_MS = 86_400_000
// Warn at 14 days: a Share on LinkedIn token has no refresh and lives 60 days.
const DIAS_DE_AVISO = 14

export type EstadoDeConexion =
  | { estado: "sin_conexion" }
  | { estado: "vencida" }
  | { estado: "por_vencer"; dias: number }
  | { estado: "conectada"; dias: number }
  | { estado: "se_renueva"; dias: number }

const diasHasta = (instante: string, ahora: number) => Math.ceil((Date.parse(instante) - ahora) / DIA_MS)

/**
 * A page connection whose refresh token outlives its access token renews itself (lib/linkedin/renovar.ts): its
 * countdown is the refresh token's. Same rule as lib/avisos/conexiones.ts seRenuevaSola.
 */
export function estadoDeConexion(
  expiraEn: string | null,
  ahora: number,
  renovacionExpiraEn: string | null = null,
): EstadoDeConexion {
  if (expiraEn === null) return { estado: "sin_conexion" }
  if (Date.parse(expiraEn) - ahora <= 0) return { estado: "vencida" }
  if (renovacionExpiraEn !== null && Date.parse(renovacionExpiraEn) > Date.parse(expiraEn)) {
    const dias = diasHasta(renovacionExpiraEn, ahora)
    return dias <= DIAS_DE_AVISO ? { estado: "por_vencer", dias } : { estado: "se_renueva", dias }
  }
  const dias = diasHasta(expiraEn, ahora)
  return dias <= DIAS_DE_AVISO ? { estado: "por_vencer", dias } : { estado: "conectada", dias }
}
