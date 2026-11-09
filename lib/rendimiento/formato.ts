import type { PublicacionConRendimiento } from "./lectura"

// Presentation of the «Rendimiento» screen: pure, worker-safe.

const SIN_DATO = "—"

const PORCENTAJE = new Intl.NumberFormat("es-CL", { maximumFractionDigits: 1 })
const CIFRA = new Intl.NumberFormat("es-CL")

/** «4,2 %» from a ratio such as 0.042; «—» when the rate cannot be computed. */
export function porcentajeDeTasa(tasa: number | null): string {
  return tasa === null ? SIN_DATO : `${PORCENTAJE.format(tasa * 100)} %`
}

/** LinkedIn's own audience percentage: «4 %» or «< 1 %»; null when the row has none. */
export function porcentajeDeAudiencia(fila: { porcentaje: number | null; menorAUno: boolean }): string | null {
  if (fila.porcentaje !== null) return `${PORCENTAJE.format(fila.porcentaje)} %`
  return fila.menorAUno ? "< 1 %" : null
}

/** A missing figure is never shown as zero. */
export function cifra(valor: number | null): string {
  return valor === null ? SIN_DATO : CIFRA.format(valor)
}

const DIA_Y_MES = new Intl.DateTimeFormat("es-CL", { timeZone: "UTC", day: "numeric", month: "short", year: "numeric" })
const DIA_DE_PUBLICACION = new Intl.DateTimeFormat("es-CL", {
  timeZone: "UTC",
  weekday: "short",
  day: "numeric",
  month: "short",
  year: "numeric",
})
const MES = new Intl.DateTimeFormat("es-CL", { timeZone: "UTC", month: "short", year: "numeric" })

function sinPunto(partes: Intl.DateTimeFormatPart[]): Record<string, string> {
  return Object.fromEntries(partes.map((p) => [p.type, p.value.replace(/\.$/, "")]))
}

/** «nov 2025» from `2025-11`. */
export function mesLegible(mes: string): string {
  const p = sinPunto(MES.formatToParts(new Date(`${mes}-01T00:00:00Z`)))
  return `${p.month} ${p.year}`
}

function diaLegible(dia: string): string {
  const p = sinPunto(DIA_Y_MES.formatToParts(new Date(`${dia}T00:00:00Z`)))
  return `${p.day} ${p.month} ${p.year}`
}

/**
 * «dom 1 nov 2026» from the `YYYY-MM-DD` day LinkedIn gives: read in UTC so the day never shifts, with no hour, since
 * the export has none.
 */
export function fechaDePublicacion(dia: string): string {
  const p = sinPunto(DIA_DE_PUBLICACION.formatToParts(new Date(`${dia.slice(0, 10)}T00:00:00Z`)))
  return `${p.weekday} ${p.day} ${p.month} ${p.year}`
}

/** «10 nov 2025 al 9 nov 2026» from two `YYYY-MM-DD` days. */
export function periodoLegible(desde: string, hasta: string): string {
  return `${diaLegible(desde)} al ${diaLegible(hasta)}`
}

export type CampoDeOrden = "fecha" | "tasa" | "impresiones" | "interacciones"

export const CAMPOS_DE_ORDEN: { campo: CampoDeOrden; nombre: string }[] = [
  { campo: "fecha", nombre: "Fecha" },
  { campo: "tasa", nombre: "Enganche" },
  { campo: "impresiones", nombre: "Impresiones" },
  { campo: "interacciones", nombre: "Interacciones" },
]

/** Descending by the chosen field; posts without that figure go last, newest first. */
export function ordenarPublicaciones(
  publicaciones: PublicacionConRendimiento[],
  campo: CampoDeOrden,
): PublicacionConRendimiento[] {
  const porFecha = (a: PublicacionConRendimiento, b: PublicacionConRendimiento) =>
    b.publicadaEl.localeCompare(a.publicadaEl) || a.id.localeCompare(b.id)
  if (campo === "fecha") return [...publicaciones].sort(porFecha)
  return [...publicaciones].sort((a, b) => {
    const x = a[campo]
    const y = b[campo]
    if (x === null && y === null) return porFecha(a, b)
    if (x === null) return 1
    if (y === null) return -1
    return y - x || porFecha(a, b)
  })
}
