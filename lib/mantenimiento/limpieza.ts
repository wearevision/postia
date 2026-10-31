import type { Db } from "@/lib/supabase/database"

// A browser uploads the PDF before the piece exists (lib/piezas/acciones.ts): a fresh orphan may be a piece being created.
const EDAD_MINIMA_MS = 24 * 3_600_000
const PAGINA_DE_STORAGE = 100
const PAGINA_DE_VERSIONES = 1000

interface Objeto {
  ruta: string
  creadoEn: string | null
}

/** Plano «Mantenimiento»: files nobody references after a day. A file without a date is kept: its age is unknown. */
export function archivosParaBorrar(
  objetos: readonly Objeto[],
  referenciadas: ReadonlySet<string>,
  ahora: number,
): string[] {
  return objetos
    .filter((o) => o.creadoEn !== null && Date.parse(o.creadoEn) < ahora - EDAD_MINIMA_MS && !referenciadas.has(o.ruta))
    .map((o) => o.ruta)
}

type Bucket = ReturnType<Db["storage"]["from"]>

async function listarTodo(bucket: Bucket, carpeta: string) {
  const todo: { name: string; id: string | null; created_at: string | null }[] = []
  for (let desde = 0; ; desde += PAGINA_DE_STORAGE) {
    const { data, error } = await bucket.list(carpeta, {
      limit: PAGINA_DE_STORAGE,
      offset: desde,
      sortBy: { column: "name", order: "asc" },
    })
    if (error) throw new Error(`No pude listar ${carpeta || "el bucket"}: ${error.message}`, { cause: error })
    todo.push(...data)
    if (data.length < PAGINA_DE_STORAGE) return todo
  }
}

async function rutasReferenciadas(db: Db, carpeta: string): Promise<Set<string>> {
  const rutas = new Set<string>()
  for (let desde = 0; ; desde += PAGINA_DE_VERSIONES) {
    const { data, error } = await db
      .from("versiones")
      .select("archivo_ruta")
      .like("archivo_ruta", `${carpeta}/%`)
      .order("archivo_ruta")
      .range(desde, desde + PAGINA_DE_VERSIONES - 1)
    if (error) throw new Error(`No pude leer las rutas de ${carpeta}: ${error.message}`, { cause: error })
    for (const v of data) if (v.archivo_ruta) rutas.add(v.archivo_ruta)
    if (data.length < PAGINA_DE_VERSIONES) return rutas
  }
}

/** One brand folder at a time: a failing folder is logged and the others still get cleaned. Returns files removed. */
export async function limpiarCarpetas(
  carpetas: readonly string[],
  limpiar: (carpeta: string) => Promise<number>,
): Promise<number> {
  let borrados = 0
  for (const carpeta of carpetas) {
    try {
      borrados += await limpiar(carpeta)
    } catch (error) {
      console.error(`No pude limpiar la carpeta ${carpeta}: ${error instanceof Error ? error.message : String(error)}`)
    }
  }
  return borrados
}

/** Removes orphan files of the «piezas» bucket, one brand folder at a time. Returns how many it removed. */
export async function limpiarArchivos(
  db: Db,
  opciones: { ahora: number; carpetas?: readonly string[] },
): Promise<number> {
  const bucket = db.storage.from("piezas")
  // Storage lists a folder as an entry without id.
  const carpetas = opciones.carpetas ?? (await listarTodo(bucket, "")).filter((o) => o.id === null).map((o) => o.name)
  return limpiarCarpetas(carpetas, async (carpeta) => {
    // Everything is listed before removing: removing while paging would shift the offsets.
    const objetos = (await listarTodo(bucket, carpeta))
      .filter((o) => o.id !== null)
      .map((o) => ({ ruta: `${carpeta}/${o.name}`, creadoEn: o.created_at }))
    const sobran = archivosParaBorrar(objetos, await rutasReferenciadas(db, carpeta), opciones.ahora)
    for (let i = 0; i < sobran.length; i += PAGINA_DE_STORAGE) {
      const { error } = await bucket.remove(sobran.slice(i, i + PAGINA_DE_STORAGE))
      if (error) throw new Error(`No pude borrar archivos de ${carpeta}: ${error.message}`, { cause: error })
    }
    return sobran.length
  })
}

function mensajeDe(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}

/** The nightly jobs are independent: each runs even if another fails, and every failure is logged and thrown together. */
export async function mantenimientoNocturno(pasos: {
  archivos(): Promise<number>
  avisos(): Promise<void>
  gastos(): Promise<number>
  elecciones(): Promise<number>
}): Promise<{ archivos: number; gastosVencidos: number; eleccionesVencidas: number }> {
  const [archivos, avisos, gastos, elecciones] = await Promise.allSettled([
    pasos.archivos(),
    pasos.avisos(),
    pasos.gastos(),
    pasos.elecciones(),
  ])
  if (
    archivos.status === "fulfilled" &&
    avisos.status === "fulfilled" &&
    gastos.status === "fulfilled" &&
    elecciones.status === "fulfilled"
  ) {
    return { archivos: archivos.value, gastosVencidos: gastos.value, eleccionesVencidas: elecciones.value }
  }
  const resultados = [
    { paso: "archivos", resultado: archivos },
    { paso: "avisos", resultado: avisos },
    { paso: "gastos", resultado: gastos },
    { paso: "elecciones", resultado: elecciones },
  ]
  const fallas: { paso: string; razon: unknown }[] = []
  const terminados: string[] = []
  for (const { paso, resultado } of resultados) {
    if (resultado.status === "rejected") {
      fallas.push({ paso, razon: resultado.reason })
      console.error(`Falló el paso nocturno «${paso}»: ${mensajeDe(resultado.reason)}`)
    } else {
      terminados.push(typeof resultado.value === "number" ? `${paso}=${resultado.value}` : paso)
    }
  }
  if (terminados.length > 0) console.log(`Pasos nocturnos que sí terminaron: ${terminados.join(", ")}`)
  throw new AggregateError(
    fallas.map((f) => f.razon),
    `Fallaron pasos nocturnos: ${fallas.map((f) => `${f.paso} (${mensajeDe(f.razon)})`).join("; ")}`,
  )
}

/** Page choices older than 10 minutes, with their tokens in Vault (supabase/migrations/…_pagina_por_api.sql). */
export async function barrerElecciones(db: Db): Promise<number> {
  const { data, error } = await db.rpc("barrer_elecciones")
  if (error) throw new Error(`No pude barrer las elecciones de página: ${error.message}`, { cause: error })
  return data
}
