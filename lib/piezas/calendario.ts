import type { EstadoDePieza } from "@/lib/piezas/estados"
import { enSantiago, fechaEnSantiago } from "@/lib/piezas/horarios"

/** A calendar day in Chile, «YYYY-MM-DD». */
export type Dia = string
/** A calendar month in Chile, «YYYY-MM». */
export type Mes = string

export interface Semana {
  lunes: Dia
  /** Monday 00:00 in Chile, inclusive. */
  desde: string
  /** The next Monday 00:00 in Chile, exclusive. */
  hasta: string
}

const DIA = /^(\d{4})-(\d{2})-(\d{2})$/
const MES = /^(\d{4})-(\d{2})$/

function dos(n: number): string {
  return String(n).padStart(2, "0")
}

function analizarDia(dia: Dia): [number, number, number] | null {
  const m = DIA.exec(dia)
  if (!m) return null
  const [anio, mes, d] = [Number(m[1]), Number(m[2]), Number(m[3])]
  const fecha = new Date(Date.UTC(anio, mes - 1, d))
  // 2026-02-31 would roll over to March: refuse it instead.
  return fecha.getUTCMonth() === mes - 1 && fecha.getUTCDate() === d ? [anio, mes, d] : null
}

const PRIMER_ANIO = 2000
const ULTIMO_ANIO = 2100

// What a person may type in the address bar: a sane year keeps every neighbouring week and month computable.
function partesDelDia(dia: Dia): [number, number, number] | null {
  const partes = analizarDia(dia)
  return partes && partes[0] >= PRIMER_ANIO && partes[0] <= ULTIMO_ANIO ? partes : null
}

function exigirDia(dia: Dia): [number, number, number] {
  const partes = analizarDia(dia)
  if (!partes) throw new Error(`Día inválido: ${dia}`)
  return partes
}

export function sumarDias(dia: Dia, n: number): Dia {
  const [anio, mes, d] = exigirDia(dia)
  const f = new Date(Date.UTC(anio, mes - 1, d + n))
  return `${f.getUTCFullYear()}-${dos(f.getUTCMonth() + 1)}-${dos(f.getUTCDate())}`
}

export function diaEnSantiago(instante: number): Dia {
  const { anio, mes, dia } = fechaEnSantiago(instante)
  return `${anio}-${dos(mes)}-${dos(dia)}`
}

function inicioDelDia(dia: Dia): string {
  const [anio, mes, d] = exigirDia(dia)
  return enSantiago(anio, mes, d, 0, 0).toISOString()
}

export function semanaDelLunes(lunes: Dia): Semana {
  return { lunes, desde: inicioDelDia(lunes), hasta: inicioDelDia(sumarDias(lunes, 7)) }
}

/** The Monday-to-Sunday week, in Chile, that holds an instant (plano: verSemana). */
export function semanaDe(instante: number): Semana {
  const { diaSemana } = fechaEnSantiago(instante)
  return semanaDelLunes(sumarDias(diaEnSantiago(instante), -((diaSemana + 6) % 7)))
}

export function diasDeLaSemana(lunes: Dia): Dia[] {
  return Array.from({ length: 7 }, (_, i) => sumarDias(lunes, i))
}

// What fills a week's rhythm: a piece with a slot that is out or may still go out. Reserve pieces hold no slot yet.
const CUENTAN_PARA_EL_RITMO: ReadonlySet<EstadoDePieza> = new Set<EstadoDePieza>([
  "por_aprobar",
  "programada",
  "publicando",
  "publicada",
  "a_mano",
  "envio_dudoso",
])

/** How many pieces each account still lacks in one week against its weekly rhythm (plano: marcarHuecos). */
export function huecosDeLaSemana(
  cuentas: readonly { id: string; ritmoSemanal: number }[],
  piezas: readonly { cuentaId: string; estado: EstadoDePieza }[],
): Record<string, number> {
  return Object.fromEntries(
    cuentas.map((c) => {
      const tiene = piezas.filter((p) => p.cuentaId === c.id && CUENTAN_PARA_EL_RITMO.has(p.estado)).length
      return [c.id, Math.max(0, c.ritmoSemanal - tiene)]
    }),
  )
}

export function mesDe(instante: number): Mes {
  return diaEnSantiago(instante).slice(0, 7)
}

export function mesVecino(mes: Mes, paso: number): Mes {
  const [anio, m] = exigirDia(`${mes}-01`)
  const f = new Date(Date.UTC(anio, m - 1 + paso, 1))
  return `${f.getUTCFullYear()}-${dos(f.getUTCMonth() + 1)}`
}

export function limitesDelMes(mes: Mes): { desde: string; hasta: string } {
  return { desde: inicioDelDia(`${mes}-01`), hasta: inicioDelDia(`${mesVecino(mes, 1)}-01`) }
}

/** The weeks of a month as rows from Monday to Sunday; days of the neighbouring months are null. */
export function cuadriculaDelMes(mes: Mes): (Dia | null)[][] {
  const [anio, m] = exigirDia(`${mes}-01`)
  const largo = new Date(Date.UTC(anio, m, 0)).getUTCDate()
  const desfase = (new Date(Date.UTC(anio, m - 1, 1)).getUTCDay() + 6) % 7
  const celdas: (Dia | null)[] = [
    ...Array.from({ length: desfase }, () => null),
    ...Array.from({ length: largo }, (_, i) => sumarDias(`${mes}-01`, i)),
  ]
  while (celdas.length % 7 !== 0) celdas.push(null)
  return Array.from({ length: celdas.length / 7 }, (_, i) => celdas.slice(i * 7, i * 7 + 7))
}

export type Vista = { vista: "semana"; semana: Semana } | { vista: "mes"; mes: Mes }

/** What /calendario shows from its query string; anything malformed falls back to the present. */
export function leerVista(params: { vista?: string; semana?: string; mes?: string }, ahora: number): Vista {
  if (params.vista === "mes") {
    const valido = params.mes !== undefined && MES.test(params.mes) && partesDelDia(`${params.mes}-01`) !== null
    return { vista: "mes", mes: valido && params.mes ? params.mes : mesDe(ahora) }
  }
  const partes = params.semana ? partesDelDia(params.semana) : null
  // Noon, not midnight: any instant inside the chosen day finds its week.
  const instante = partes ? enSantiago(partes[0], partes[1], partes[2], 12, 0).getTime() : ahora
  return { vista: "semana", semana: semanaDe(instante) }
}
