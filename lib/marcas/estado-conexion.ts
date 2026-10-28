const DIA_MS = 86_400_000
// Warn at 14 days: a Share on LinkedIn token has no refresh and lives 60 days.
const DIAS_DE_AVISO = 14

export type EstadoDeConexion =
  | { estado: "sin_conexion" }
  | { estado: "vencida" }
  | { estado: "por_vencer"; dias: number }
  | { estado: "conectada"; dias: number }

export function estadoDeConexion(expiraEn: string | null, ahora: number): EstadoDeConexion {
  if (expiraEn === null) return { estado: "sin_conexion" }
  const restante = Date.parse(expiraEn) - ahora
  if (restante <= 0) return { estado: "vencida" }
  const dias = Math.ceil(restante / DIA_MS)
  return dias <= DIAS_DE_AVISO ? { estado: "por_vencer", dias } : { estado: "conectada", dias }
}
