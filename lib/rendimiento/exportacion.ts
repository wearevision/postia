import type { Resultado } from "@/lib/marcas/acciones"

// Pure: the browser reads the XLSX into rows (lib/rendimiento/lector.ts) and this turns them into figures.

export type Celda = string | number | null | undefined
export type Hojas = Record<string, Celda[][]>

// The fields marked optional are only filled by the page parser (exportacion-pagina.ts); the profile leaves them out.
export interface PublicacionExportada {
  postUrn: string
  publicadaEl: string
  interacciones: number | null
  impresiones: number | null
  /** Start of the page post's text, used to match it to a PostIA piece. */
  extracto?: string | null
  clics?: number | null
  seguidoresNuevos?: number | null
}

export interface DiaExportado {
  dia: string
  impresiones: number
  interacciones: number
  seguidoresNuevos: number | null
  visitas?: number | null
  visitantesUnicos?: number | null
}

export interface FilaDePublico {
  tipo: "publico" | "contenido" | "seguidores" | "visitantes"
  categoria: string
  valor: string
  porcentaje: number | null
  menorAUno: boolean
  /** Page audience rows carry counts instead of percentages. */
  cantidad?: number | null
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

type ClaveDeHoja = "descubrimiento" | "interaccion" | "seguidores" | "publicaciones" | "publico" | "contenido"

// LinkedIn cuts sheet names at 31 characters, so they are matched by prefix.
const IDIOMAS: Record<"es" | "en", { hojas: Record<ClaveDeHoja, string>; recientes: string | null }> = {
  es: {
    hojas: {
      descubrimiento: "DESCUBRIMIENTO",
      interaccion: "INTERACCIÓN",
      seguidores: "SEGUIDORES",
      publicaciones: "PUBLICACIONES PRINCIPALES",
      publico: "INFORMACIÓN DETALLADA DEL PÚBLI",
      contenido: "INFORMACIÓN DETALLADA DEL CONTE",
    },
    recientes: null,
  },
  en: {
    hojas: {
      descubrimiento: "DISCOVERY",
      interaccion: "ENGAGEMENT",
      seguidores: "FOLLOWERS",
      publicaciones: "TOP POSTS",
      publico: "AUDIENCE DEMOGRAPHICS",
      contenido: "CONTENT DEMOGRAPHICS",
    },
    recientes: "MOST RECENT POSTS",
  },
}

// Both languages store the same Spanish category names.
const CATEGORIAS: Record<string, string> = {
  Company: "Empresa",
  "Job title": "Cargo",
  Location: "Ubicación",
  Industry: "Sector",
  Seniority: "Nivel de responsabilidad",
  "Company size": "Tamaño de la empresa",
  "Job function": "Área",
}

export const categoriaEnEspanol = (nombre: string) => CATEGORIAS[nombre] ?? nombre

const NO_ES_LINKEDIN =
  "Ese archivo no es la exportación de estadísticas de LinkedIn. Descárgalo desde Analytics de tu perfil."

function hoja(hojas: Hojas, prefijo: string): Celda[][] | undefined {
  const nombre = Object.keys(hojas).find((n) => n.trim().toUpperCase().startsWith(prefijo))
  return nombre === undefined ? undefined : hojas[nombre]
}

function idiomaDe(hojas: Hojas): "es" | "en" | null {
  for (const idioma of ["es", "en"] as const) {
    const { descubrimiento, publicaciones } = IDIOMAS[idioma].hojas
    if (hoja(hojas, descubrimiento) || hoja(hojas, publicaciones)) return idioma
  }
  return null
}

export const parecePerfil = (hojas: Hojas) => idiomaDe(hojas) !== null

export const texto = (c: Celda) => (c === null || c === undefined ? "" : String(c).trim())

function entero(c: Celda): number | null {
  const t = texto(c).replace(/[.,\s\u00a0]/g, "")
  return /^\d+$/.test(t) ? Number(t) : null
}

type OrdenDeFecha = "dmy" | "mdy"

/** «16/11/2025» (dmy) or «11/16/2025» (mdy) → «2025-11-16». The order is decided per file, never per cell. */
export function fecha(c: Celda, orden: OrdenDeFecha): string | null {
  const m = /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/.exec(texto(c))
  if (!m) return null
  const [dia, mes] = orden === "dmy" ? [m[1], m[2]] : [m[2], m[1]]
  return `${m[3]}-${mes.padStart(2, "0")}-${dia.padStart(2, "0")}`
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

function publicaciones(
  filas: Celda[][],
  recientes: Celda[][],
  orden: OrdenDeFecha,
): { lista: PublicacionExportada[]; sinIdentificar: number } {
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
      publicadaEl: fecha(dia, orden) ?? "",
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
  // The top lists win; recent posts only add posts they do not have or fill a missing impressions figure.
  for (const fila of recientes.slice(1)) {
    const urn = urnDe(fila[0])
    if (!urn) {
      if (texto(fila[0])) sinIdentificar++
      continue
    }
    const actual = porUrn.get(urn)
    if (actual) actual.impresiones ??= entero(fila[3])
    else
      porUrn.set(urn, {
        postUrn: urn,
        publicadaEl: fecha(fila[1], orden) ?? "",
        interacciones: null,
        impresiones: entero(fila[3]),
      })
  }
  return { lista: [...porUrn.values()].filter((p) => p.publicadaEl !== ""), sinIdentificar }
}

function publico(filas: Celda[][], tipo: FilaDePublico["tipo"]): FilaDePublico[] {
  return filas
    .slice(1)
    .filter((f) => texto(f[0]) && texto(f[1]))
    .map((f) => ({ tipo, categoria: categoriaEnEspanol(texto(f[0])), valor: texto(f[1]), ...porcentaje(f[2]) }))
}

export function leerExportacion(hojas: Hojas): Resultado<Exportacion> {
  const idioma = idiomaDe(hojas)
  if (!idioma) return { ok: false, error: NO_ES_LINKEDIN }
  const nombres = IDIOMAS[idioma].hojas
  const orden: OrdenDeFecha = idioma === "es" ? "dmy" : "mdy"
  const encontradas = Object.fromEntries(
    Object.entries(nombres).map(([clave, prefijo]) => [clave, hoja(hojas, prefijo)]),
  ) as Record<ClaveDeHoja, Celda[][] | undefined>
  for (const [clave, prefijo] of Object.entries(nombres)) {
    if (!encontradas[clave as ClaveDeHoja]) return { ok: false, error: `Al archivo le falta la hoja «${prefijo}».` }
  }
  const {
    descubrimiento,
    interaccion,
    seguidores,
    publicaciones: principales,
  } = encontradas as Record<ClaveDeHoja, Celda[][]>

  const [inicio, fin] = texto(descubrimiento[0]?.[1]).split(/\s*-\s*/)
  const desde = fecha(inicio, orden)
  const hasta = fecha(fin, orden)
  if (!desde || !hasta) return { ok: false, error: NO_ES_LINKEDIN }

  const nuevos = new Map<string, number>()
  for (const fila of seguidores.slice(3)) {
    const dia = fecha(fila[0], orden)
    const n = entero(fila[1])
    if (dia && n !== null) nuevos.set(dia, n)
  }
  const dias: DiaExportado[] = interaccion.slice(1).flatMap((fila) => {
    const dia = fecha(fila[0], orden)
    const impresiones = entero(fila[1])
    const interacciones = entero(fila[2])
    if (!dia || impresiones === null || interacciones === null) return []
    return [{ dia, impresiones, interacciones, seguidoresNuevos: nuevos.get(dia) ?? null }]
  })

  const nombreDeRecientes = IDIOMAS[idioma].recientes
  const recientes = nombreDeRecientes ? (hoja(hojas, nombreDeRecientes) ?? []) : []
  const { lista, sinIdentificar } = publicaciones(principales, recientes, orden)
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
