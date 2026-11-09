import { estadoDeConexion } from "./estado-conexion"

const dias = (n: number) => `${n} ${n === 1 ? "día" : "días"}`

export const RENOVAR_PAGINA_PARA_ANALITICAS = "Para leer las analíticas de tu perfil, renueva la página de WAV"

/**
 * The profile's analytics read with the token of the owner's «Estudio WAV» (page) connection: LinkedIn keeps one valid
 * token per member and app. `expiraEn` is that connection's expiry, or null when it lacks r_member_postAnalytics
 * (analiticas_del_perfil). Renewing the page asks for the permission again, so there is no button of its own.
 */
export function estadoDeAnaliticas(expiraEn: string | null, ahora: number): string {
  const estado = estadoDeConexion(expiraEn, ahora)
  if (estado.estado === "sin_conexion" || estado.estado === "vencida") return RENOVAR_PAGINA_PARA_ANALITICAS
  return `Analíticas por la conexión de la página de WAV · vence en ${dias(estado.dias)}`
}
