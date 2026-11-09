import type { Resultado } from "@/lib/marcas/acciones"
import {
  type Celda,
  categoriaEnEspanol,
  type DiaExportado,
  type Exportacion,
  type FilaDePublico,
  fecha,
  type Hojas,
  leerExportacion,
  type PublicacionExportada,
  parecePerfil,
  texto,
} from "./exportacion"

// Pure: LinkedIn's page exports (content, followers, visitors) are English .xls files with MM/DD/YYYY dates and
// numbers like «84.0». The browser turns each into rows (lib/rendimiento/lector.ts); this merges them.

export type TipoDeArchivo = "contenido" | "seguidores" | "visitantes"
export type ArchivosDePagina = Partial<Record<TipoDeArchivo, Hojas>>

const HOJA_DE = { contenido: "All posts", seguidores: "New followers", visitantes: "Visitor metrics" } as const
const MAX_EXTRACTO = 300
const ACTIVIDAD = /urn:li:activity:(\d+)/

const SIN_ARCHIVOS = "Sube al menos un archivo de la página: contenido, seguidores o visitantes."
const SIN_FECHAS = "Los archivos no traen datos con fecha."

function hoja(hojas: Hojas, nombre: string): Celda[][] | undefined {
  const clave = Object.keys(hojas).find((n) => n.trim().toLowerCase() === nombre.toLowerCase())
  return clave === undefined ? undefined : hojas[clave]
}

function numero(c: Celda): number | null {
  const t = texto(c)
  if (t === "") return null
  const n = Number(t)
  return Number.isFinite(n) ? Math.round(n) : null
}

const suma = (...valores: (number | null)[]) =>
  valores.every((v) => v === null) ? null : valores.reduce<number>((total, v) => total + (v ?? 0), 0)

/** Column index by header name; `desde` skips the title rows LinkedIn puts above the header. */
function columnas(filas: Celda[][], nombres: string[]): { indices: Map<string, number>; primera: number } | null {
  const cabecera = filas.findIndex((f) => nombres.every((n) => f.some((c) => texto(c) === n)))
  if (cabecera < 0) return null
  const indices = new Map(nombres.map((n) => [n, filas[cabecera].findIndex((c) => texto(c) === n)]))
  return { indices, primera: cabecera + 1 }
}

type Dias = Map<string, DiaExportado>

function dia(dias: Dias, iso: string): DiaExportado {
  let d = dias.get(iso)
  if (!d) {
    d = {
      dia: iso,
      impresiones: null,
      interacciones: null,
      seguidoresNuevos: null,
      visitas: null,
      visitantesUnicos: null,
    }
    dias.set(iso, d)
  }
  return d
}

function deContenido(hojas: Hojas, dias: Dias): { publicaciones: PublicacionExportada[]; sinIdentificar: number } {
  const metricas = hoja(hojas, "Metrics")
  const columnasDeDias = metricas && columnas(metricas, ["Date", "Impressions (total)"])
  if (metricas && columnasDeDias) {
    const { indices, primera } = columnasDeDias
    const columna = (nombre: string) => metricas[primera - 1].findIndex((c) => texto(c) === nombre)
    const [reacciones, comentarios, reposts] = ["Reactions (total)", "Comments (total)", "Reposts (total)"].map(columna)
    for (const fila of metricas.slice(primera)) {
      const iso = fecha(fila[indices.get("Date") ?? 0], "mdy")
      if (!iso) continue
      const d = dia(dias, iso)
      d.impresiones = numero(fila[indices.get("Impressions (total)") ?? 0]) ?? 0
      d.interacciones = suma(numero(fila[reacciones]), numero(fila[comentarios]), numero(fila[reposts])) ?? 0
    }
  }

  const lista = new Map<string, PublicacionExportada>()
  let sinIdentificar = 0
  const filas = hoja(hojas, HOJA_DE.contenido) ?? []
  const nombres = [
    "Post title",
    "Post link",
    "Created date",
    "Impressions",
    "Clicks",
    "Likes",
    "Comments",
    "Reposts",
    "Follows",
  ]
  const posts = columnas(filas, nombres)
  if (!posts) return { publicaciones: [], sinIdentificar }
  const c = (nombre: string) => posts.indices.get(nombre) ?? 0
  for (const fila of filas.slice(posts.primera)) {
    if (nombres.every((n) => texto(fila[c(n)]) === "")) continue
    const urn = ACTIVIDAD.exec(texto(fila[c("Post link")]))?.[1]
    const publicadaEl = fecha(fila[c("Created date")], "mdy")
    if (!urn || !publicadaEl) {
      sinIdentificar++
      continue
    }
    if (lista.has(`urn:li:activity:${urn}`)) continue
    lista.set(`urn:li:activity:${urn}`, {
      postUrn: `urn:li:activity:${urn}`,
      publicadaEl,
      interacciones: suma(numero(fila[c("Likes")]), numero(fila[c("Comments")]), numero(fila[c("Reposts")])),
      impresiones: numero(fila[c("Impressions")]),
      clics: numero(fila[c("Clicks")]),
      seguidoresNuevos: numero(fila[c("Follows")]),
      extracto: texto(fila[c("Post title")]).slice(0, MAX_EXTRACTO) || null,
    })
  }
  return { publicaciones: [...lista.values()], sinIdentificar }
}

const HOJAS_DE_PUBLICO = ["Location", "Job function", "Seniority", "Industry", "Company size"]

function deAudiencia(hojas: Hojas, tipo: "seguidores" | "visitantes"): FilaDePublico[] {
  return HOJAS_DE_PUBLICO.flatMap((nombre) =>
    (hoja(hojas, nombre) ?? []).slice(1).flatMap((fila) => {
      const valor = texto(fila[0])
      const cantidad = numero(fila[1])
      if (valor === "" || cantidad === null) return []
      return [{ tipo, categoria: categoriaEnEspanol(nombre), valor, cantidad, porcentaje: null, menorAUno: false }]
    }),
  )
}

export function leerExportacionDePagina({
  contenido,
  seguidores,
  visitantes,
}: ArchivosDePagina): Resultado<Exportacion> {
  if (!contenido && !seguidores && !visitantes) return { ok: false, error: SIN_ARCHIVOS }
  const dias: Dias = new Map()
  const { publicaciones, sinIdentificar } = contenido
    ? deContenido(contenido, dias)
    : { publicaciones: [], sinIdentificar: 0 }

  const nuevos = seguidores && hoja(seguidores, HOJA_DE.seguidores)
  if (nuevos) {
    const cols = columnas(nuevos, ["Date", "Total followers"])
    if (cols)
      for (const fila of nuevos.slice(cols.primera)) {
        const iso = fecha(fila[cols.indices.get("Date") ?? 0], "mdy")
        const n = numero(fila[cols.indices.get("Total followers") ?? 0])
        if (iso && n !== null) dia(dias, iso).seguidoresNuevos = n
      }
  }

  const visitas = visitantes && hoja(visitantes, HOJA_DE.visitantes)
  if (visitas) {
    const cols = columnas(visitas, ["Date", "Total page views (total)", "Total unique visitors (total)"])
    if (cols)
      for (const fila of visitas.slice(cols.primera)) {
        const iso = fecha(fila[cols.indices.get("Date") ?? 0], "mdy")
        if (!iso) continue
        const d = dia(dias, iso)
        d.visitas = numero(fila[cols.indices.get("Total page views (total)") ?? 0])
        d.visitantesUnicos = numero(fila[cols.indices.get("Total unique visitors (total)") ?? 0])
      }
  }

  const fechas = [...dias.keys(), ...publicaciones.map((p) => p.publicadaEl)].sort()
  if (fechas.length === 0) return { ok: false, error: SIN_FECHAS }
  return {
    ok: true,
    desde: fechas[0],
    hasta: fechas[fechas.length - 1],
    seguidoresTotal: null,
    publicaciones,
    sinIdentificar,
    dias: [...dias.values()].sort((a, b) => a.dia.localeCompare(b.dia)),
    publico: [
      ...(seguidores ? deAudiencia(seguidores, "seguidores") : []),
      ...(visitantes ? deAudiencia(visitantes, "visitantes") : []),
    ],
  }
}

function tipoDe(hojas: Hojas): TipoDeArchivo | null {
  for (const tipo of ["contenido", "seguidores", "visitantes"] as const) if (hoja(hojas, HOJA_DE[tipo])) return tipo
  return null
}

export interface ArchivoLeido {
  nombre: string
  hojas: Hojas
}

/** One profile export, or up to three page exports (one of each kind) in any order. */
export function leerArchivosDeLinkedin(archivos: ArchivoLeido[]): Resultado<Exportacion> {
  if (archivos.length === 0) return { ok: false, error: "Elige el archivo que descargaste de LinkedIn." }
  if (archivos.length === 1 && parecePerfil(archivos[0].hojas)) return leerExportacion(archivos[0].hojas)
  const porTipo: ArchivosDePagina = {}
  for (const { nombre, hojas } of archivos) {
    const tipo = tipoDe(hojas)
    if (!tipo) return { ok: false, error: `No reconozco el archivo «${nombre}». Sube las exportaciones de LinkedIn.` }
    if (porTipo[tipo]) return { ok: false, error: `Subiste dos archivos de ${tipo}. Sube uno de cada tipo.` }
    porTipo[tipo] = hojas
  }
  return leerExportacionDePagina(porTipo)
}
