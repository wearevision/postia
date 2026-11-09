import type { Resultado } from "@/lib/marcas/acciones"

// Pure: the browser reads the XLSX into rows (lib/rendimiento/lector.ts) and this turns them into figures.

export type Celda = string | number | null | undefined
export type Hojas = Record<string, Celda[][]>

export interface PublicacionExportada {
  postUrn: string
  publicadaEl: string
  interacciones: number | null
  impresiones: number | null
}

export interface DiaExportado {
  dia: string
  impresiones: number
  interacciones: number
  seguidoresNuevos: number | null
}

export interface FilaDePublico {
  tipo: "publico" | "contenido"
  categoria: string
  valor: string
  porcentaje: number | null
  menorAUno: boolean
}

export interface Exportacion {
  desde: string
  hasta: string
  seguidoresTotal: number | null
  publicaciones: PublicacionExportada[]
  /** Posts whose URL carries no share or ugcPost id: they cannot be matched, so they are only counted. */
  sinIdentificar: number
  dias: DiaExportado[]
  publico: FilaDePublico[]
}

// LinkedIn cuts sheet names at 31 characters, so they are matched by prefix.
const HOJAS = {
  descubrimiento: "DESCUBRIMIENTO",
  interaccion: "INTERACCIÓN",
  seguidores: "SEGUIDORES",
  publicaciones: "PUBLICACIONES PRINCIPALES",
  publico: "INFORMACIÓN DETALLADA DEL PÚBLI",
  contenido: "INFORMACIÓN DETALLADA DEL CONTE",
} as const

const NO_ES_LINKEDIN =
  "Ese archivo no es la exportación de estadísticas de LinkedIn. Descárgalo desde Analytics de tu perfil."

function hoja(hojas: Hojas, prefijo: string): Celda[][] | undefined {
  const nombre = Object.keys(hojas).find((n) => n.trim().toUpperCase().startsWith(prefijo))
  return nombre === undefined ? undefined : hojas[nombre]
}

const texto = (c: Celda) => (c === null || c === undefined ? "" : String(c).trim())

function entero(c: Celda): number | null {
  const t = texto(c).replace(/[.\s\u00a0]/g, "")
  return /^\d+$/.test(t) ? Number(t) : null
}

/** «16/11/2025» → «2025-11-16». */
function fecha(c: Celda): string | null {
  const m = /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/.exec(texto(c))
  return m ? `${m[3]}-${m[2].padStart(2, "0")}-${m[1].padStart(2, "0")}` : null
}

const ID_DE_PUBLICACION = /-(share|ugcPost)-(\d+)(?:-|$)/

function urnDe(url: Celda): string | null {
  const m = ID_DE_PUBLICACION.exec(texto(url))
  return m ? `urn:li:${m[1]}:${m[2]}` : null
}

function porcentaje(c: Celda): { porcentaje: number | null; menorAUno: boolean } {
  const t = texto(c).replace(/\u00a0/g, " ")
  if (t.startsWith("<")) return { porcentaje: null, menorAUno: true }
  const n = Number.parseFloat(t.replace("%", "").replace(",", "."))
  return { porcentaje: Number.isFinite(n) ? n : null, menorAUno: false }
}

function publicaciones(filas: Celda[][]): { lista: PublicacionExportada[]; sinIdentificar: number } {
  const porUrn = new Map<string, PublicacionExportada>()
  let sinIdentificar = 0
  const anotar = (url: Celda, dia: Celda, valor: Celda, campo: "interacciones" | "impresiones") => {
    if (!texto(url)) return
    const urn = urnDe(url)
    if (!urn) {
      sinIdentificar++
      return
    }
    const actual = porUrn.get(urn) ?? {
      postUrn: urn,
      publicadaEl: fecha(dia) ?? "",
      interacciones: null,
      impresiones: null,
    }
    actual[campo] = entero(valor)
    porUrn.set(urn, actual)
  }
  for (const fila of filas.slice(3)) {
    anotar(fila[0], fila[1], fila[2], "interacciones")
    anotar(fila[4], fila[5], fila[6], "impresiones")
  }
  return { lista: [...porUrn.values()].filter((p) => p.publicadaEl !== ""), sinIdentificar }
}

function publico(filas: Celda[][], tipo: FilaDePublico["tipo"]): FilaDePublico[] {
  return filas
    .slice(1)
    .filter((f) => texto(f[0]) && texto(f[1]))
    .map((f) => ({ tipo, categoria: texto(f[0]), valor: texto(f[1]), ...porcentaje(f[2]) }))
}

export function leerExportacion(hojas: Hojas): Resultado<Exportacion> {
  const encontradas = Object.fromEntries(
    Object.entries(HOJAS).map(([clave, prefijo]) => [clave, hoja(hojas, prefijo)]),
  ) as Record<keyof typeof HOJAS, Celda[][] | undefined>
  if (!encontradas.descubrimiento && !encontradas.publicaciones) return { ok: false, error: NO_ES_LINKEDIN }
  for (const [clave, prefijo] of Object.entries(HOJAS)) {
    if (!encontradas[clave as keyof typeof HOJAS])
      return { ok: false, error: `Al archivo le falta la hoja «${prefijo}».` }
  }
  const {
    descubrimiento,
    interaccion,
    seguidores,
    publicaciones: principales,
  } = encontradas as Record<keyof typeof HOJAS, Celda[][]>

  const [inicio, fin] = texto(descubrimiento[0]?.[1]).split(/\s*-\s*/)
  const desde = fecha(inicio)
  const hasta = fecha(fin)
  if (!desde || !hasta) return { ok: false, error: NO_ES_LINKEDIN }

  const nuevos = new Map<string, number>()
  for (const fila of seguidores.slice(3)) {
    const dia = fecha(fila[0])
    const n = entero(fila[1])
    if (dia && n !== null) nuevos.set(dia, n)
  }
  const dias: DiaExportado[] = interaccion.slice(1).flatMap((fila) => {
    const dia = fecha(fila[0])
    const impresiones = entero(fila[1])
    const interacciones = entero(fila[2])
    if (!dia || impresiones === null || interacciones === null) return []
    return [{ dia, impresiones, interacciones, seguidoresNuevos: nuevos.get(dia) ?? null }]
  })

  const { lista, sinIdentificar } = publicaciones(principales)
  return {
    ok: true,
    desde,
    hasta,
    seguidoresTotal: entero(seguidores[0]?.[1]),
    publicaciones: lista,
    sinIdentificar,
    dias,
    publico: [...publico(encontradas.publico ?? [], "publico"), ...publico(encontradas.contenido ?? [], "contenido")],
  }
}
