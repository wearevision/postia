import type { Db } from "@/lib/supabase/database"
import {
  type DiaDeRendimiento,
  type FilaDePublico,
  type FilaDePublicoConCambio,
  type Marca,
  type MesDeRendimiento,
  marcar,
  mediana,
  muestraChica,
  porMes,
  publicoConCambios,
  type TipoDePublico,
} from "./resumen"

// Worker-safe reader of the «Rendimiento» screen. Everything runs under the caller's RLS: another owner's account
// simply returns no rows.

export type { FilaDePublicoConCambio, MesDeRendimiento }

const PAGINA = 1000
const POR_LOTE = 100
const LARGO_DEL_TEXTO = 140
const TEXTO_SIN_PIEZA = "Publicación anterior a PostIA"

export interface CuentaConRendimiento {
  id: string
  nombre: string
  tipo: string
  tieneDatos: boolean
}

export interface PublicacionConRendimiento {
  id: string
  publicadaEl: string
  texto: string
  piezaId: string | null
  impresiones: number | null
  interacciones: number | null
  tasa: number | null
  clics: number | null
  seguidoresNuevos: number | null
  marca: Marca | null
  /** Among the 3 widest-reaching (impressions), apart from the engagement mark. */
  masAlcance: boolean
}

export interface ImportacionLeida {
  id: string
  desde: string
  hasta: string
  creadaEn: string
}

export interface RendimientoDeCuenta {
  publicaciones: PublicacionConRendimiento[]
  meses: MesDeRendimiento[]
  /** Top audience values of the latest import, each with its movement since the one before. */
  publico: FilaDePublicoConCambio[]
  ultimaImportacion: ImportacionLeida | null
  seguidoresTotal: number | null
  medianaDeTasa: number | null
  /** Too few posts with a rate to call any of them best or worst. */
  muestraChica: boolean
}

function fallo(accion: string, error: { message: string }): never {
  throw new Error(`${accion}: ${error.message}`, { cause: error })
}

type Pagina<T> = PromiseLike<{ data: T[] | null; error: { message: string } | null }>

/** PostgREST caps a response at 1,000 rows: reads every page of an ordered query. */
async function leerTodo<T>(accion: string, pagina: (desde: number, hasta: number) => Pagina<T>): Promise<T[]> {
  const filas: T[] = []
  for (let desde = 0; ; desde += PAGINA) {
    const { data, error } = await pagina(desde, desde + PAGINA - 1)
    if (error) fallo(accion, error)
    filas.push(...(data ?? []))
    if (!data || data.length < PAGINA) return filas
  }
}

async function hayFilas(db: Db, tabla: "metricas_de_publicacion" | "importaciones_de_metricas", cuentaId: string) {
  const { data, error } = await db.from(tabla).select("cuenta_id").eq("cuenta_id", cuentaId).limit(1)
  if (error) fallo("No pude revisar si la cuenta tiene cifras", error)
  return data.length > 0
}

export async function cuentasConRendimiento(db: Db): Promise<CuentaConRendimiento[]> {
  const { data, error } = await db.from("cuentas").select("id, nombre, tipo").order("nombre")
  if (error) fallo("No pude leer las cuentas", error)
  return Promise.all(
    data.map(async (c) => ({
      ...c,
      tieneDatos:
        (await hayFilas(db, "metricas_de_publicacion", c.id)) ||
        (await hayFilas(db, "importaciones_de_metricas", c.id)),
    })),
  )
}

type FilaDePublicacion = {
  id: string
  post_urn: string
  pieza_id: string | null
  publicada_el: string
  interacciones: number | null
  impresiones: number | null
  extracto: string | null
  clics: number | null
  seguidores_nuevos: number | null
  origen: string
}

/** Rows of one URN can come from the API and from an import: the API's wins. */
function unaPorUrn(filas: FilaDePublicacion[]): FilaDePublicacion[] {
  const elegidas = new Map<string, FilaDePublicacion>()
  for (const f of filas) {
    const previa = elegidas.get(f.post_urn)
    if (!previa || (previa.origen !== "api" && f.origen === "api")) elegidas.set(f.post_urn, f)
  }
  return [...elegidas.values()]
}

async function textosDeLasPiezas(db: Db, piezaIds: string[]): Promise<Map<string, string>> {
  const textos = new Map<string, string>()
  for (let i = 0; i < piezaIds.length; i += POR_LOTE) {
    const lote = piezaIds.slice(i, i + POR_LOTE)
    const versiones = await leerTodo<{ pieza_id: string; texto: string; numero: number }>(
      "No pude leer los textos de las piezas",
      (desde, hasta) =>
        db
          .from("versiones")
          .select("pieza_id, texto, numero")
          .in("pieza_id", lote)
          .order("pieza_id")
          .order("numero", { ascending: false })
          .range(desde, hasta),
    )
    // Newest version first within each piece: the first one seen is the latest.
    for (const v of versiones) if (!textos.has(v.pieza_id)) textos.set(v.pieza_id, v.texto)
  }
  return textos
}

async function leerPublicaciones(db: Db, cuentaId: string): Promise<PublicacionConRendimiento[]> {
  const filas = await leerTodo<FilaDePublicacion>("No pude leer las publicaciones", (desde, hasta) =>
    db
      .from("metricas_de_publicacion")
      .select(
        "id, post_urn, pieza_id, publicada_el, interacciones, impresiones, extracto, clics, seguidores_nuevos, origen",
      )
      .eq("cuenta_id", cuentaId)
      .order("id")
      .range(desde, hasta),
  )
  const unicas = unaPorUrn(filas)
  const textos = await textosDeLasPiezas(db, [...new Set(unicas.flatMap((f) => (f.pieza_id ? [f.pieza_id] : [])))])
  const conTasa = marcar(
    unicas.map((f) => ({
      id: f.id,
      publicadaEl: f.publicada_el,
      texto:
        (f.pieza_id ? textos.get(f.pieza_id) : undefined)?.slice(0, LARGO_DEL_TEXTO) ?? f.extracto ?? TEXTO_SIN_PIEZA,
      piezaId: f.pieza_id,
      impresiones: f.impresiones,
      interacciones: f.interacciones,
      clics: f.clics,
      seguidoresNuevos: f.seguidores_nuevos,
    })),
  )
  return conTasa.sort((a, b) => b.publicadaEl.localeCompare(a.publicadaEl) || a.id.localeCompare(b.id))
}

type FilaDiaria = {
  dia: string
  impresiones: number | null
  interacciones: number | null
  seguidores_nuevos: number | null
  visitas: number | null
  visitantes_unicos: number | null
  origen: string
}

async function leerDias(db: Db, cuentaId: string): Promise<DiaDeRendimiento[]> {
  const filas = await leerTodo<FilaDiaria>("No pude leer las cifras diarias", (desde, hasta) =>
    db
      .from("metricas_diarias")
      .select("dia, impresiones, interacciones, seguidores_nuevos, visitas, visitantes_unicos, origen")
      .eq("cuenta_id", cuentaId)
      .order("dia")
      .order("origen")
      .range(desde, hasta),
  )
  const porDia = new Map<string, FilaDiaria>()
  for (const f of filas) {
    const previa = porDia.get(f.dia)
    if (!previa || (previa.origen !== "api" && f.origen === "api")) porDia.set(f.dia, f)
  }
  return [...porDia.values()].map((f) => ({
    dia: f.dia,
    impresiones: f.impresiones,
    interacciones: f.interacciones,
    seguidoresNuevos: f.seguidores_nuevos,
    visitas: f.visitas,
    visitantesUnicos: f.visitantes_unicos,
  }))
}

async function leerPublico(db: Db, importacionId: string): Promise<FilaDePublico[]> {
  const filas = await leerTodo<{
    tipo: string
    categoria: string
    valor: string
    porcentaje: number | null
    menor_a_uno: boolean
    cantidad: number | null
  }>("No pude leer el público", (desde, hasta) =>
    db
      .from("publico_de_la_cuenta")
      .select("tipo, categoria, valor, porcentaje, menor_a_uno, cantidad")
      .eq("importacion_id", importacionId)
      .order("id")
      .range(desde, hasta),
  )
  return filas.map((f) => ({
    tipo: f.tipo as TipoDePublico,
    categoria: f.categoria,
    valor: f.valor,
    porcentaje: f.porcentaje,
    menorAUno: f.menor_a_uno,
    cantidad: f.cantidad,
  }))
}

export async function rendimientoDeCuenta(db: Db, cuentaId: string): Promise<RendimientoDeCuenta> {
  const [publicaciones, dias, importaciones] = await Promise.all([
    leerPublicaciones(db, cuentaId),
    leerDias(db, cuentaId),
    db
      .from("importaciones_de_metricas")
      .select("id, desde, hasta, creada_en, seguidores_total")
      .eq("cuenta_id", cuentaId)
      .order("hasta", { ascending: false })
      .order("creada_en", { ascending: false })
      .limit(2),
  ])
  if (importaciones.error) fallo("No pude leer las importaciones", importaciones.error)
  const [ultima, anterior] = importaciones.data
  const [actual, previo] = await Promise.all([
    ultima ? leerPublico(db, ultima.id) : [],
    anterior ? leerPublico(db, anterior.id) : null,
  ])
  const tasas = publicaciones.flatMap((p) => (p.tasa === null ? [] : [p.tasa]))
  return {
    publicaciones,
    meses: porMes(dias),
    publico: publicoConCambios(actual, previo),
    ultimaImportacion: ultima
      ? { id: ultima.id, desde: ultima.desde, hasta: ultima.hasta, creadaEn: ultima.creada_en }
      : null,
    seguidoresTotal: ultima?.seguidores_total ?? null,
    medianaDeTasa: mediana(tasas),
    muestraChica: muestraChica(publicaciones),
  }
}
