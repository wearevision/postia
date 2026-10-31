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
    const ideas = inv.ideas
      .filter((i) => i.estado !== "reemplazada")
      .sort((a, b) => a.orden - b.orden)
      .map(
        (i): IdeaDeSerie => ({
          id: i.id,
          orden: i.orden,
          estado: EstadoDeIdeaLeido.parse(i.estado),
          gancho: i.gancho,
          resumen: i.resumen,
          formato: i.formato === "carrusel_pdf" ? "carrusel_pdf" : "texto",
          esqueleto: Esqueleto.catch([]).parse(i.esqueleto),
          fuentes: i.fuentes.flatMap((id) => {
            const h = hallazgos.get(id)
            return h ? [{ id: h.id, medio: h.medio, enlace: h.enlace, publicadoEn: h.publicado_en }] : []
          }),
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
          pidiendoOtra: abiertos.some((t) => t.idea_id === i.id),
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
