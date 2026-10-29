export const ESTADOS = [
  "por_aprobar",
  "programada",
  "publicando",
  "publicada",
  "envio_dudoso",
  "a_mano",
  "error",
  "descartada",
] as const

export type EstadoDePieza = (typeof ESTADOS)[number]

// The plano's machine, restricted to hand-made pieces (C1). The database guard in
// 20261029120000_piezas.sql holds the same table; tests/integration/piezas.test.ts checks they agree.
export const TRANSICIONES: Record<EstadoDePieza, readonly EstadoDePieza[]> = {
  por_aprobar: ["programada", "descartada"],
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
