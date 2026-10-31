const DIA_MS = 86_400_000
// Warn at 14 days: a Share on LinkedIn token has no refresh and lives 60 days.
const DIAS_DE_AVISO = 14

export type EstadoDeConexion =
  | { estado: "sin_conexion" }
  | { estado: "vencida" }
  | { estado: "por_vencer"; dias: number }
  | { estado: "conectada"; dias: number }
  | { estado: "se_renueva"; dias: number }

// The daily refresh (lib/linkedin/renovar.ts) renews a page token 10 days before it runs out.
const DIAS_DE_RENOVACION = 10

/**
 * Whether the daily refresh still carries this connection past its access token: its refresh token outlives the access
 * token, and the access token is not yet inside the 10 days in which the refresh should already have renewed it. Past
 * that point a refresh failed, so the access token counts down like any other.
 */
export function seRenuevaSola(expiraEn: string, renovacionExpiraEn: string | null | undefined, ahora: number): boolean {
  return (
    !!renovacionExpiraEn &&
    Date.parse(renovacionExpiraEn) > Date.parse(expiraEn) &&
    Date.parse(expiraEn) > ahora + DIAS_DE_RENOVACION * DIA_MS
  )
}

const diasHasta = (instante: string, ahora: number) => Math.ceil((Date.parse(instante) - ahora) / DIA_MS)

/** A page connection that renews itself (seRenuevaSola) counts down its refresh token instead. */
export function estadoDeConexion(
  expiraEn: string | null,
  ahora: number,
  renovacionExpiraEn: string | null = null,
): EstadoDeConexion {
  if (expiraEn === null) return { estado: "sin_conexion" }
  if (Date.parse(expiraEn) - ahora <= 0) return { estado: "vencida" }
  if (renovacionExpiraEn !== null && seRenuevaSola(expiraEn, renovacionExpiraEn, ahora)) {
    const dias = diasHasta(renovacionExpiraEn, ahora)
    return dias <= DIAS_DE_AVISO ? { estado: "por_vencer", dias } : { estado: "se_renueva", dias }
  }
  const dias = diasHasta(expiraEn, ahora)
  return dias <= DIAS_DE_AVISO ? { estado: "por_vencer", dias } : { estado: "conectada", dias }
}
