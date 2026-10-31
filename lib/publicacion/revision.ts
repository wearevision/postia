export type Ruta = "api" | "metricool" | "a_mano"

export interface DatosDeRevision {
  firmaHuella: string | null
  versionHuella: string
  programadaPara: string
  ventanaMinutos: number
  ruta: Ruta
  conexionExpira: string | null
}

/** `porHorario` marks a cause of timing (the window passed), as opposed to a cause in the piece itself. */
export type Revision =
  | { ok: true }
  | { ok: false; destino: "por_aprobar" | "a_mano"; motivo: string; porHorario?: true }

/** Re-checked right before sending (plano: revisarAntesDeEnviar). Order matters: signature, window, route. */
export function revisarAntesDeEnviar(d: DatosDeRevision, ahora: number): Revision {
  if (!d.firmaHuella || d.firmaHuella !== d.versionHuella) {
    return { ok: false, destino: "por_aprobar", motivo: "La firma ya no corresponde a la versión actual." }
  }
  if (ahora > Date.parse(d.programadaPara) + d.ventanaMinutos * 60_000) {
    return {
      ok: false,
      destino: "por_aprobar",
      porHorario: true,
      motivo: `No alcanzó a salir dentro de sus ${d.ventanaMinutos} minutos. Fírmala de nuevo con otra fecha.`,
    }
  }
  if (d.ruta !== "api") {
    return { ok: false, destino: "a_mano", motivo: "Esta cuenta se publica a mano." }
  }
  if (!d.conexionExpira || Date.parse(d.conexionExpira) <= ahora) {
    return {
      ok: false,
      destino: "a_mano",
      motivo: "La conexión de LinkedIn venció. Reconéctala en Ajustes o publícala a mano.",
    }
  }
  return { ok: true }
}
