import { z } from "zod"
import { TIPOS_DE_LAMINA } from "@/lib/plantillas/laminas"
import type { Db } from "@/lib/supabase/database"
import type { FormatoDeIdea, PasoDeEsqueleto } from "./propuestas"

// Worker-safe readers for «Ideas y series».

export const ESTADOS_DE_IDEA = ["propuesta", "aprobada", "descartada"] as const
export type EstadoDeIdea = (typeof ESTADOS_DE_IDEA)[number]
export const ESTADOS_DE_ASIGNACION = ["por_escribir", "escribiendo", "escrita", "fallo", "descartada"] as const
export type EstadoDeAsignacion = (typeof ESTADOS_DE_ASIGNACION)[number]

export interface FuenteDeIdea {
  id: string
  medio: string
  enlace: string
  publicadoEn: string | null
}

export interface AsignacionDeIdea {
  id: string
  cuentaId: string
  cuenta: string
  planeadaPara: string
  estado: EstadoDeAsignacion
  motivo: string | null
  piezaId: string | null
}

export interface IdeaDeSerie {
  id: string
  orden: number
  estado: EstadoDeIdea
  gancho: string
  resumen: string
  formato: FormatoDeIdea
  esqueleto: PasoDeEsqueleto[]
  fuentes: FuenteDeIdea[]
  cuentaSugerida: { id: string; nombre: string }
  razon: string
  asignaciones: AsignacionDeIdea[]
  /** A replacement job for this idea is queued or running. */
  pidiendoOtra: boolean
}

export interface SerieDeIdeas {
  investigacionId: string
  tema: string
  /** How many pieces the report asked for; null for a watch report. */
  cantidad: number | null
  /** A series or replacement job is queued or running: the page refreshes itself. */
  trabajando: boolean
  /** Why the latest series job failed, while no other is running. */
  fallo: string | null
  ideas: IdeaDeSerie[]
}

export const ORIGENES_SUELTOS = ["cruce", "domingo"] as const
export type OrigenSuelto = (typeof ORIGENES_SUELTOS)[number]

export interface FuenteConResumen extends FuenteDeIdea {
  /** The finding's summary, cut to an excerpt so the page stays light. */
  resumen: string
}

/** A cross of two findings or a Sunday idea: it hangs from no report. */
export interface IdeaSuelta extends IdeaDeSerie {
  origen: OrigenSuelto
  creadaEn: string
  fuentes: FuenteConResumen[]
}

export interface IdeasYSeries {
  cruces: IdeaSuelta[]
  sueltas: IdeaSuelta[]
  series: SerieDeIdeas[]
}

export interface CuentaParaIdeas {
  id: string
  nombre: string
}

const Esqueleto = z.array(
  z.union([z.object({ tipo: z.enum(TIPOS_DE_LAMINA), idea: z.string() }), z.object({ idea: z.string() })]),
)
const EstadoDeIdeaLeido = z.enum(ESTADOS_DE_IDEA)
const EstadoDeAsignacionLeido = z.enum(ESTADOS_DE_ASIGNACION)

function fallo(accion: string, error: { message: string }): never {
  throw new Error(`${accion}: ${error.message}`, { cause: error })
}

const ABIERTO = new Set(["pendiente", "trabajando"])
const SERIES_POR_PAGINA = 20
const SUELTAS_POR_GRUPO = 30
const LARGO_DEL_EXTRACTO = 180

type FilaDeIdea = {
  id: string
  orden: number
  estado: string
  gancho: string
  resumen: string
  formato: string
  esqueleto: unknown
  razon: string
  cuenta_sugerida: string
  cuentas: { nombre: string } | null
  asignaciones: {
    id: string
    cuenta_id: string
    planeada_para: string
    estado: string
    motivo: string | null
    pieza_id: string | null
    cuentas: { nombre: string } | null
  }[]
}

/** Everything of an idea but its sources, read the same way for a series idea and a loose one. */
function ideaLeida(i: FilaDeIdea, pidiendoOtra: boolean): Omit<IdeaDeSerie, "fuentes"> {
  return {
    id: i.id,
    orden: i.orden,
    estado: EstadoDeIdeaLeido.parse(i.estado),
    gancho: i.gancho,
    resumen: i.resumen,
    formato: i.formato === "carrusel_pdf" ? "carrusel_pdf" : "texto",
    esqueleto: Esqueleto.catch([]).parse(i.esqueleto),
    cuentaSugerida: { id: i.cuenta_sugerida, nombre: i.cuentas?.nombre ?? "" },
    razon: i.razon,
    asignaciones: [...i.asignaciones]
      .sort((a, b) => Date.parse(a.planeada_para) - Date.parse(b.planeada_para))
      .map((a) => ({
        id: a.id,
        cuentaId: a.cuenta_id,
        cuenta: a.cuentas?.nombre ?? "",
        planeadaPara: a.planeada_para,
        estado: EstadoDeAsignacionLeido.parse(a.estado),
        motivo: a.motivo,
        piezaId: a.pieza_id,
      })),
    pidiendoOtra,
  }
}

const abierto = (trabajos: { estado: string }[]) => trabajos.some((t) => ABIERTO.has(t.estado))

function extracto(texto: string): string {
  const limpio = texto.trim()
  return limpio.length <= LARGO_DEL_EXTRACTO ? limpio : `${limpio.slice(0, LARGO_DEL_EXTRACTO - 1).trimEnd()}…`
}

/**
 * Approved reports with their series, newest first: their ideas in order (replaced ones left out), each with its
 * sources, suggested account and slots. A report shows once it has ideas or a series job.
 */
export async function series(db: Db, filtro: { investigacionId?: string } = {}): Promise<SerieDeIdeas[]> {
  if (filtro.investigacionId !== undefined && !z.uuid().safeParse(filtro.investigacionId).success) return []
  let consulta = db
    .from("investigaciones")
    .select(
      "id, tema, cantidad, creada_en, hallazgos(id, medio, enlace, publicado_en), trabajos_de_investigacion!trabajos_de_investigacion_investigacion_id_fkey(tipo, estado, motivo, idea_id, creado_en), ideas!ideas_investigacion_id_fkey(id, orden, estado, gancho, resumen, formato, esqueleto, fuentes, razon, cuenta_sugerida, cuentas!ideas_cuenta_sugerida_fkey(id, nombre), asignaciones(id, cuenta_id, planeada_para, estado, motivo, pieza_id, cuentas(nombre)))",
    )
    .eq("estado", "aprobada")
    .order("creada_en", { ascending: false })
    .limit(SERIES_POR_PAGINA)
  if (filtro.investigacionId) consulta = consulta.eq("id", filtro.investigacionId)
  const { data, error } = await consulta
  if (error) fallo("No pude leer las series", error)
  return data.flatMap((inv) => {
    const trabajos = inv.trabajos_de_investigacion
      .filter((t) => t.tipo === "serie" || t.tipo === "otra_idea")
      .sort((a, b) => b.creado_en.localeCompare(a.creado_en))
    if (inv.ideas.length === 0 && trabajos.length === 0) return []
    const abiertos = trabajos.filter((t) => ABIERTO.has(t.estado))
    const ultimo = trabajos[0]
    const hallazgos = new Map(inv.hallazgos.map((h) => [h.id, h]))
    const pidiendoOtra = (ideaId: string) => abiertos.some((t) => t.idea_id === ideaId)
    const ideas = inv.ideas
      .filter((i) => i.estado !== "reemplazada")
      .sort((a, b) => a.orden - b.orden)
      .map(
        (i): IdeaDeSerie => ({
          ...ideaLeida(i, pidiendoOtra(i.id)),
          fuentes: i.fuentes.flatMap((id) => {
            const h = hallazgos.get(id)
            return h ? [{ id: h.id, medio: h.medio, enlace: h.enlace, publicadoEn: h.publicado_en }] : []
          }),
        }),
      )
    return [
      {
        investigacionId: inv.id,
        tema: inv.tema,
        cantidad: inv.cantidad,
        trabajando: abiertos.length > 0,
        fallo: abiertos.length === 0 && ultimo?.estado === "fallo" ? ultimo.motivo : null,
        ideas,
      },
    ]
  })
}

const COLUMNAS_DE_SUELTA =
  "id, orden, estado, gancho, resumen, formato, esqueleto, fuentes, razon, cuenta_sugerida, creada_en, cuentas!ideas_cuenta_sugerida_fkey(nombre), asignaciones(id, cuenta_id, planeada_para, estado, motivo, pieza_id, cuentas(nombre)), trabajos_de_investigacion!trabajos_de_investigacion_idea_id_fkey(estado)"

/** With a state, the filter runs here: the newest 30 of that state, not the newest 30 then filtered. */
async function sueltasDe(db: Db, origen: OrigenSuelto, estado: EstadoDeIdea | null) {
  const consulta = db
    .from("ideas")
    .select(COLUMNAS_DE_SUELTA)
    .eq("origen", origen)
    .is("investigacion_id", null)
    .neq("estado", "reemplazada")
  const { data, error } = await (estado ? consulta.eq("estado", estado) : consulta)
    .order("creada_en", { ascending: false })
    .limit(SUELTAS_POR_GRUPO)
  if (error) fallo("No pude leer las ideas sueltas", error)
  return data.map((fila) => ({ fila, origen }))
}

/**
 * The page's three groups: crosses and Sunday ideas (newest first, at most 30 each, of `estado` when given, with an
 * excerpt of each source) and the series. Filtered to one series, only that series.
 */
export async function ideasYSeries(
  db: Db,
  filtro: { investigacionId?: string; estado?: EstadoDeIdea | null } = {},
): Promise<IdeasYSeries> {
  if (filtro.investigacionId !== undefined) {
    return { cruces: [], sueltas: [], series: await series(db, { investigacionId: filtro.investigacionId }) }
  }
  const estado = filtro.estado ?? null
  const [lista, cruces, delDomingo] = await Promise.all([
    series(db),
    sueltasDe(db, "cruce", estado),
    sueltasDe(db, "domingo", estado),
  ])
  const filas = [...cruces, ...delDomingo]
  const ids = [...new Set(filas.flatMap(({ fila }) => fila.fuentes))]
  const hallazgos = new Map<string, FuenteConResumen>()
  if (ids.length > 0) {
    const { data, error } = await db.from("hallazgos").select("id, medio, enlace, publicado_en, resumen").in("id", ids)
    if (error) fallo("No pude leer las fuentes de las ideas", error)
    for (const h of data) {
      hallazgos.set(h.id, {
        id: h.id,
        medio: h.medio,
        enlace: h.enlace,
        publicadoEn: h.publicado_en,
        resumen: extracto(h.resumen),
      })
    }
  }
  const leida = ({ fila, origen }: (typeof filas)[number]): IdeaSuelta => ({
    ...ideaLeida(fila, abierto(fila.trabajos_de_investigacion)),
    origen,
    creadaEn: fila.creada_en,
    fuentes: fila.fuentes.flatMap((id) => hallazgos.get(id) ?? []),
  })
  return { cruces: cruces.map(leida), sueltas: delDomingo.map(leida), series: lista }
}

/** Proposals waiting for a decision; ideas belong to no brand, so everyone with access hears the same count. */
export async function ideasPorRevisar(db: Db): Promise<number> {
  const { count, error } = await db.from("ideas").select("id", { count: "exact", head: true }).eq("estado", "propuesta")
  if (error) fallo("No pude contar las ideas por revisar", error)
  return count ?? 0
}

/** The accounts a person can confirm an idea for. */
export async function cuentasParaIdeas(db: Db): Promise<CuentaParaIdeas[]> {
  const { data, error } = await db.from("cuentas").select("id, nombre").order("nombre")
  if (error) fallo("No pude leer las cuentas", error)
  return data
}

/** A report approved before 4f, or whose series did not come out, can ask for one (pedir_serie decides). */
export async function serieDelInforme(
  db: Db,
  investigacionId: string,
): Promise<{ ideas: number; trabajando: boolean } | null> {
  if (!z.uuid().safeParse(investigacionId).success) return null
  const [ideas, trabajos] = await Promise.all([
    db.from("ideas").select("id", { count: "exact", head: true }).eq("investigacion_id", investigacionId),
    db
      .from("trabajos_de_investigacion")
      .select("id", { count: "exact", head: true })
      .eq("investigacion_id", investigacionId)
      .eq("tipo", "serie")
      .in("estado", ["pendiente", "trabajando"]),
  ])
  if (ideas.error) fallo("No pude leer la serie del informe", ideas.error)
  if (trabajos.error) fallo("No pude leer la serie del informe", trabajos.error)
  return { ideas: ideas.count ?? 0, trabajando: (trabajos.count ?? 0) > 0 }
}
