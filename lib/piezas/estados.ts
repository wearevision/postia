export const ESTADOS = [
  "por_aprobar",
  "en_reserva",
  "programada",
  "publicando",
  "publicada",
  "envio_dudoso",
  "a_mano",
  "error",
  "descartada",
] as const

export type EstadoDePieza = (typeof ESTADOS)[number]

// The plano's machine for hand-made pieces (C1) plus the reserve (C2, D21). The database guard holds the same table
// (transiciones_de_pieza in 20261030120000_calendario_y_reserva.sql); tests/integration/piezas.test.ts checks they agree.
export const TRANSICIONES: Record<EstadoDePieza, readonly EstadoDePieza[]> = {
  por_aprobar: ["programada", "en_reserva", "descartada"],
  en_reserva: ["programada", "por_aprobar", "descartada"],
  programada: ["por_aprobar", "publicando", "a_mano", "descartada"],
  publicando: ["publicada", "envio_dudoso", "a_mano", "error"],
  error: ["programada", "por_aprobar", "descartada"],
  envio_dudoso: ["publicada", "a_mano", "descartada"],
  a_mano: ["publicada", "por_aprobar", "descartada"],
  publicada: [],
  descartada: [],
}

export function transicionPermitida(de: EstadoDePieza, a: EstadoDePieza): boolean {
  return TRANSICIONES[de].includes(a)
}

export function esEstado(valor: string): valor is EstadoDePieza {
  return (ESTADOS as readonly string[]).includes(valor)
}

export const NOMBRE_DEL_ESTADO: Record<EstadoDePieza, string> = {
  por_aprobar: "Por firmar",
  en_reserva: "En reserva",
  programada: "Programada",
  publicando: "Publicándose",
  publicada: "Publicada",
  envio_dudoso: "Envío en duda",
  a_mano: "Para publicar a mano",
  error: "Con error",
  descartada: "Descartada",
}
