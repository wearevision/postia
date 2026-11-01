import { fechaLarga } from "@/lib/piezas/fechas"
import { estaAbierta, type InvestigacionReciente } from "./lectura"

const TERMINADAS = new Set(["aprobada", "descartada"])

export interface InvestigacionesOrdenadas {
  /** Queued or running: shown first, so a research just asked for is on screen without scrolling. */
  enCurso: InvestigacionReciente[]
  porAprobar: InvestigacionReciente[]
  resto: InvestigacionReciente[]
  /** When the latest watch that found nothing ran; null if none was hidden. */
  ultimaVigilanciaVacia: string | null
}

export function ordenarInvestigaciones(recientes: readonly InvestigacionReciente[]): InvestigacionesOrdenadas {
  const vacia = (i: InvestigacionReciente) => i.origen === "vigilancia" && i.hallazgos === 0 && TERMINADAS.has(i.estado)
  const ocultas = recientes.filter(vacia)
  return {
    enCurso: recientes.filter((i) => estaAbierta(i.estado)),
    porAprobar: recientes.filter((i) => i.estado === "informe_por_aprobar"),
    resto: recientes.filter((i) => i.estado !== "informe_por_aprobar" && !estaAbierta(i.estado) && !vacia(i)),
    ultimaVigilanciaVacia: ocultas.reduce<string | null>(
      (max, i) => (max === null || i.creadaEn > max ? i.creadaEn : max),
      null,
    ),
  }
}

/** A watch also ends approved with no findings when every one of its topics errored, so it says «hallazgos», not «novedades». */
export function notaDeUltimaVigilancia(instante: string): string {
  return `Última vigilancia: ${fechaLarga(instante)}, sin hallazgos.`
}
