import type { InvestigacionReciente } from "./lectura"

const TERMINADAS = new Set(["aprobada", "descartada"])

export interface InvestigacionesOrdenadas {
  porAprobar: InvestigacionReciente[]
  resto: InvestigacionReciente[]
  /** When the latest watch that found nothing ran; null if none was hidden. */
  ultimaVigilanciaVacia: string | null
}

export function ordenarInvestigaciones(recientes: readonly InvestigacionReciente[]): InvestigacionesOrdenadas {
  const vacia = (i: InvestigacionReciente) => i.origen === "vigilancia" && i.hallazgos === 0 && TERMINADAS.has(i.estado)
  const ocultas = recientes.filter(vacia)
  return {
    porAprobar: recientes.filter((i) => i.estado === "informe_por_aprobar"),
    resto: recientes.filter((i) => i.estado !== "informe_por_aprobar" && !vacia(i)),
    ultimaVigilanciaVacia: ocultas.reduce<string | null>(
      (max, i) => (max === null || i.creadaEn > max ? i.creadaEn : max),
      null,
    ),
  }
}
