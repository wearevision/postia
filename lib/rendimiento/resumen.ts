// Pure calculations of the «Rendimiento» screen: no I/O, worker-safe.

export const MINIMO_PARA_CONCLUIR = 8
const MINIMO_PARA_MARCAR = 6
const CUANTAS_MARCAS = 3
const CUANTOS_DE_PUBLICO = 5

export type Marca = "mejor" | "peor"

export interface CifrasDeUnaPublicacion {
  publicadaEl: string
  interacciones: number | null
  impresiones: number | null
}

export function tasa(p: Pick<CifrasDeUnaPublicacion, "interacciones" | "impresiones">): number | null {
  if (p.interacciones === null || p.impresiones === null || p.impresiones <= 0) return null
  return p.interacciones / p.impresiones
}

export function mediana(valores: number[]): number | null {
  if (valores.length === 0) return null
  const ordenados = [...valores].sort((a, b) => a - b)
  const medio = Math.floor(ordenados.length / 2)
  if (ordenados.length % 2 === 1) return ordenados[medio] ?? null
  return ((ordenados[medio - 1] ?? 0) + (ordenados[medio] ?? 0)) / 2
}

/** Keeps the input order; adds the rate and, among the posts that have one, the best and worst. */
/**
 * The posts at or beyond the `CUANTAS_MARCAS`-th value, ties included so equal figures never get different marks; none
 * when those ties take every post (then the mark would not single anything out).
 */
function extremos<P>(posts: P[], valor: (p: P) => number, orden: "alto" | "bajo"): Set<P> {
  if (posts.length < CUANTAS_MARCAS) return new Set()
  const ordenados = [...posts].sort((a, b) => (orden === "alto" ? valor(b) - valor(a) : valor(a) - valor(b)))
  const corte = valor(ordenados[CUANTAS_MARCAS - 1] as P)
  const elegidos = ordenados.filter((p) => (orden === "alto" ? valor(p) >= corte : valor(p) <= corte))
  return elegidos.length === posts.length ? new Set() : new Set(elegidos)
}

/**
 * Engagement marks (rate = interactions ÷ impressions) and a separate reach mark (impressions), each for the top 3
 * once at least `MINIMO_PARA_MARCAR` posts have that figure. A post is never both best and worst engagement.
 */
export function marcar<T extends CifrasDeUnaPublicacion>(
  publicaciones: T[],
): Array<T & { tasa: number | null; marca: Marca | null; masAlcance: boolean }> {
  const conTasa = publicaciones.map((p) => ({ ...p, tasa: tasa(p), marca: null as Marca | null, masAlcance: false }))
  const comparables = conTasa.filter((p): p is typeof p & { tasa: number } => p.tasa !== null)
  if (comparables.length >= MINIMO_PARA_MARCAR) {
    const mejores = extremos(comparables, (p) => p.tasa, "alto")
    for (const p of mejores) p.marca = "mejor"
    const resto = comparables.filter((p) => !mejores.has(p))
    for (const p of extremos(resto, (p) => p.tasa, "bajo")) p.marca = "peor"
  }
  const conImpresiones = conTasa.filter((p): p is typeof p & { impresiones: number } => p.impresiones !== null)
  if (conImpresiones.length >= MINIMO_PARA_MARCAR)
    for (const p of extremos(conImpresiones, (p) => p.impresiones, "alto")) p.masAlcance = true
  return conTasa
}

export function muestraChica(
  publicaciones: Array<Pick<CifrasDeUnaPublicacion, "interacciones" | "impresiones">>,
): boolean {
  return publicaciones.filter((p) => tasa(p) !== null).length < MINIMO_PARA_CONCLUIR
}

export interface DiaDeRendimiento {
  dia: string
  impresiones: number | null
  interacciones: number | null
  seguidoresNuevos: number | null
  visitas: number | null
  visitantesUnicos: number | null
}

export interface MesDeRendimiento {
  /** `YYYY-MM`. */
  mes: string
  impresiones: number | null
  interacciones: number | null
  seguidoresNuevos: number | null
  visitas: number | null
  visitantesUnicos: number | null
}

const CIFRAS_DIARIAS = ["impresiones", "interacciones", "seguidoresNuevos", "visitas", "visitantesUnicos"] as const

export function porMes(dias: DiaDeRendimiento[]): MesDeRendimiento[] {
  const meses = new Map<string, MesDeRendimiento>()
  for (const d of dias) {
    const clave = d.dia.slice(0, 7)
    const mes =
      meses.get(clave) ??
      ({
        mes: clave,
        impresiones: null,
        interacciones: null,
        seguidoresNuevos: null,
        visitas: null,
        visitantesUnicos: null,
      } satisfies MesDeRendimiento)
    for (const cifra of CIFRAS_DIARIAS) {
      const valor = d[cifra]
      if (valor !== null) mes[cifra] = (mes[cifra] ?? 0) + valor
    }
    meses.set(clave, mes)
  }
  return [...meses.values()].sort((a, b) => a.mes.localeCompare(b.mes))
}

export type TipoDePublico = "publico" | "contenido" | "seguidores" | "visitantes"
export type CambioDePublico = "nuevo" | "sube" | "baja" | "igual"

export interface FilaDePublico {
  tipo: TipoDePublico
  categoria: string
  valor: string
  porcentaje: number | null
  menorAUno: boolean
  cantidad: number | null
}

export interface FilaDePublicoConCambio extends FilaDePublico {
  /** Null when the account has no earlier import to compare with. */
  cambio: CambioDePublico | null
}

function peso(f: FilaDePublico): number {
  return f.porcentaje ?? f.cantidad ?? (f.menorAUno ? 0.5 : 0)
}

function claveDeGrupo(f: FilaDePublico): string {
  return `${f.tipo}\u0000${f.categoria}`
}

/** The top values of each type and category of the latest import, with how each moved since the one before. */
export function publicoConCambios(actual: FilaDePublico[], anterior: FilaDePublico[] | null): FilaDePublicoConCambio[] {
  const previos = anterior ? new Map(anterior.map((f) => [`${claveDeGrupo(f)}\u0000${f.valor}`, peso(f)])) : null
  const grupos = new Map<string, FilaDePublico[]>()
  for (const f of actual) grupos.set(claveDeGrupo(f), [...(grupos.get(claveDeGrupo(f)) ?? []), f])
  const resultado: FilaDePublicoConCambio[] = []
  for (const filas of grupos.values()) {
    const mejores = [...filas].sort((a, b) => peso(b) - peso(a)).slice(0, CUANTOS_DE_PUBLICO)
    for (const f of mejores) {
      const antes = previos?.get(`${claveDeGrupo(f)}\u0000${f.valor}`)
      let cambio: CambioDePublico | null = null
      if (previos) {
        if (antes === undefined) cambio = "nuevo"
        else cambio = peso(f) > antes ? "sube" : peso(f) < antes ? "baja" : "igual"
      }
      resultado.push({ ...f, cambio })
    }
  }
  return resultado
}
