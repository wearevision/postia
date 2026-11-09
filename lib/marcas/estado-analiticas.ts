import { estadoDeConexion } from "./estado-conexion"

export interface EstadoDeAnaliticas {
  texto: string
  /** The button that fits, or null while the connection has time left. */
  boton: string | null
}

const dias = (n: number) => `${n} ${n === 1 ? "día" : "días"}`

/** The profile's analytics token lives 60 days and does not renew itself: the owner renews it with the same flow. */
export function estadoDeAnaliticas(conexion: { expira_en: string } | null, ahora: number): EstadoDeAnaliticas {
  const estado = estadoDeConexion(conexion?.expira_en ?? null, ahora)
  switch (estado.estado) {
    case "sin_conexion":
      return { texto: "Analíticas sin conectar", boton: "Conectar analíticas de LinkedIn" }
    case "vencida":
      return { texto: "Las analíticas de LinkedIn vencieron", boton: "Renovar analíticas" }
    case "por_vencer":
      return { texto: `Analíticas conectadas · vencen en ${dias(estado.dias)}`, boton: "Renovar analíticas" }
    default:
      return { texto: `Analíticas conectadas · vencen en ${dias(estado.dias)}`, boton: null }
  }
}
