import { type EstadoDeConexion, estadoDeConexion } from "@/lib/marcas/estado-conexion"

interface Conexion {
  expira_en: string
  renovacion_expira_en: string | null
}

export function estadoDeCuenta(conexion: Conexion | null, ahora: number): EstadoDeConexion {
  return estadoDeConexion(conexion?.expira_en ?? null, ahora, conexion?.renovacion_expira_en ?? null)
}
