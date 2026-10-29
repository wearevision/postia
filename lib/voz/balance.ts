import type { EstadoDePieza } from "@/lib/piezas/estados"
import { fechaEnSantiago } from "@/lib/piezas/horarios"

export interface PilarDeBalance {
  id: string
  nombre: string
  porSemana: number
  creadoEn: string
}

export interface PiezaDeBalance {
  pilarId: string | null
  /** The signed date for signed and published pieces; the planned slot otherwise. */
  instante: string
  estado: EstadoDePieza
}

export interface FilaDeBalance {
  pilarId: string
  nombre: string
  salieron: number
  meta: number
  planeadas: number
  /** Null when nothing of this pillar came out in the window read (DIAS_DE_LECTURA). */
  diasSinSalir: number | null
  alerta: boolean
}

export interface Balance {
  filas: FilaDeBalance[]
  sinPilar: number
}

const DIA_MS = 86_400_000
export const SEMANAS_DE_PROPORCION = 4
// D20: «avisa cuando un pilar lleva dos semanas sin salir».
export const DIAS_SIN_SALIR = 14
export const DIAS_PLANEADOS = 14
// A piece of the pillar planned this close is the answer already: alerting would be noise.
const DIAS_QUE_CALMAN = 7
/** How far back the reading goes (lib/voz/lectura.ts): enough for four weeks of proportion and the last publication. */
export const DIAS_DE_LECTURA = 56

/** Days between two instants counted on Chile's calendar, so a clock change or a late-night post does not shift it. */
function diasEnChile(desde: number, hasta: number): number {
  const dia = (instante: number) => {
    const { anio, mes, dia } = fechaEnSantiago(instante)
    return Date.UTC(anio, mes - 1, dia) / DIA_MS
  }
  return dia(hasta) - dia(desde)
}

/** D20 for one account: proportion over four weeks, what is coming, and pillars two weeks without coming out. */
export function balanceDePilares(
  pilares: readonly PilarDeBalance[],
  piezas: readonly PiezaDeBalance[],
  ahora: number,
): Balance {
  const desde = ahora - SEMANAS_DE_PROPORCION * 7 * DIA_MS
  // A piece whose date cannot be read neither came out nor is coming: it counts nowhere.
  const legibles = piezas.filter((p) => Number.isFinite(Date.parse(p.instante)))
  const salio = (p: PiezaDeBalance) => p.estado === "publicada" && Date.parse(p.instante) <= ahora
  // Only pieces waiting for a signature or already scheduled are «coming»; drafts and the rest are not a plan yet.
  const viene = (p: PiezaDeBalance) =>
    (p.estado === "por_aprobar" || p.estado === "programada") &&
    Date.parse(p.instante) > ahora &&
    Date.parse(p.instante) <= ahora + DIAS_PLANEADOS * DIA_MS

  const filas = pilares.map((pilar): FilaDeBalance => {
    const suyas = legibles.filter((p) => p.pilarId === pilar.id)
    const publicadas = suyas.filter(salio).map((p) => Date.parse(p.instante))
    const diasSinSalir = publicadas.length ? diasEnChile(Math.max(...publicadas), ahora) : null
    const cerca = suyas.some((p) => viene(p) && Date.parse(p.instante) <= ahora + DIAS_QUE_CALMAN * DIA_MS)
    const maduro = ahora - Date.parse(pilar.creadoEn) >= DIAS_SIN_SALIR * DIA_MS
    return {
      pilarId: pilar.id,
      nombre: pilar.nombre,
      salieron: publicadas.filter((t) => t > desde).length,
      meta: Math.round(pilar.porSemana * SEMANAS_DE_PROPORCION * 10) / 10,
      planeadas: suyas.filter(viene).length,
      diasSinSalir,
      alerta: maduro && !cerca && (diasSinSalir === null || diasSinSalir >= DIAS_SIN_SALIR),
    }
  })
  const sinPilar = legibles.filter(
    (p) => p.pilarId === null && ((salio(p) && Date.parse(p.instante) > desde) || viene(p)),
  ).length
  return { filas, sinPilar }
}

export function lineaDeAlerta(pilar: string, diasSinSalir: number | null, cuenta: string): string {
  return diasSinSalir === null
    ? `«${pilar}» no ha salido en ${cuenta} en más de dos semanas.`
    : `«${pilar}» lleva ${diasSinSalir} días sin salir en ${cuenta}.`
}
