import { z } from "zod"
import type { Db } from "@/lib/supabase/database"

// Worker-safe readers for the Investigar pages.

export const ESTADOS_DE_INVESTIGACION = [
  "en_cola",
  "investigando",
  "informe_por_aprobar",
  "aprobada",
  "descartada",
  "fallo",
] as const
export type EstadoDeInvestigacion = (typeof ESTADOS_DE_INVESTIGACION)[number]
const Estado = z.enum(ESTADOS_DE_INVESTIGACION)
const Origen = z.enum(["encargo", "vigilancia"])
export type OrigenDeInvestigacion = z.infer<typeof Origen>

const ABIERTAS: readonly EstadoDeInvestigacion[] = ["en_cola", "investigando"]

/** Queued or running: the page refreshes itself while any is. */
export function estaAbierta(estado: EstadoDeInvestigacion): boolean {
  return ABIERTAS.includes(estado)
}

function fallo(accion: string, error: { message: string }): never {
  throw new Error(`${accion}: ${error.message}`, { cause: error })
}

export interface InvestigacionReciente {
  id: string
  tema: string
  origen: OrigenDeInvestigacion
  estado: EstadoDeInvestigacion
  motivo: string | null
  creadaEn: string
  hallazgos: number
}

export async function investigacionesRecientes(db: Db, limite = 20): Promise<InvestigacionReciente[]> {
  const { data, error } = await db
    .from("investigaciones")
    .select("id, tema, origen, estado, motivo, creada_en, hallazgos(count)")
    .order("creada_en", { ascending: false })
    .limit(limite)
  if (error) fallo("No pude leer las investigaciones", error)
  return data.map((i) => ({
    id: i.id,
    tema: i.tema,
    origen: Origen.parse(i.origen),
    estado: Estado.parse(i.estado),
    motivo: i.motivo,
    creadaEn: i.creada_en,
    hallazgos: i.hallazgos[0]?.count ?? 0,
  }))
}

export interface HallazgoDeInforme {
  id: string
  resumen: string
  cita: string | null
  enlace: string
  medio: string
  publicadoEn: string | null
  estado: string
}

export interface AnguloDeInforme {
  nombre: string
  porQue: string
  hallazgos: HallazgoDeInforme[]
}

export interface InformeDeInvestigacion {
  id: string
  tema: string
  origen: OrigenDeInvestigacion
  estado: EstadoDeInvestigacion
  motivo: string | null
  creadaEn: string
  angulos: AnguloDeInforme[]
  /** Findings refused as already in the map. */
  repetidos: number
  /** Sources dropped as invented or from LinkedIn. */
  descartados: number
}

const Angulos = z.array(z.object({ nombre: z.string(), por_que: z.string().catch("") }))

/** The research with its angles; each angle's findings newest first, discarded ones last. Null if not found. */
export async function informe(db: Db, id: string): Promise<InformeDeInvestigacion | null> {
  if (!z.uuid().safeParse(id).success) return null
  const { data: i, error } = await db
    .from("investigaciones")
    .select("id, tema, origen, estado, motivo, creada_en, angulos, repetidos, descartados")
    .eq("id", id)
    .maybeSingle()
  if (error) fallo("No pude leer el informe", error)
  if (!i) return null
  const { data: hallazgos, error: errorDeHallazgos } = await db
    .from("hallazgos")
    .select("id, resumen, cita, enlace, medio, publicado_en, estado, angulo, creado_en")
    .eq("investigacion_id", id)
    .order("creado_en", { ascending: false })
  if (errorDeHallazgos) fallo("No pude leer los hallazgos del informe", errorDeHallazgos)

  const angulos: AnguloDeInforme[] = Angulos.parse(i.angulos).map((a) => ({
    nombre: a.nombre,
    porQue: a.por_que,
    hallazgos: [],
  }))
  const porNombre = new Map(angulos.map((a) => [a.nombre, a]))
  const ordenados = [...hallazgos].sort((a, b) => Number(a.estado === "descartado") - Number(b.estado === "descartado"))
  for (const h of ordenados) {
    const nombre = h.angulo ?? ""
    let angulo = porNombre.get(nombre)
    // A finding saved under an angle the closing call did not list still shows, under its own name.
    if (!angulo) {
      angulo = { nombre, porQue: "", hallazgos: [] }
      porNombre.set(nombre, angulo)
      angulos.push(angulo)
    }
    angulo.hallazgos.push({
      id: h.id,
      resumen: h.resumen,
      cita: h.cita,
      enlace: h.enlace,
      medio: h.medio,
      publicadoEn: h.publicado_en,
      estado: h.estado,
    })
  }
  return {
    id: i.id,
    tema: i.tema,
    origen: Origen.parse(i.origen),
    estado: Estado.parse(i.estado),
    motivo: i.motivo,
    creadaEn: i.creada_en,
    angulos,
    repetidos: i.repetidos,
    descartados: i.descartados,
  }
}

export interface Sugerencia {
  id: string
  tema: string
  enriquece: string
}

export async function sugerencias(db: Db): Promise<Sugerencia[]> {
  const { data, error } = await db
    .from("sugerencias_de_investigacion")
    .select("id, tema, enriquece")
    .order("creada_en", { ascending: true })
    .limit(5)
  if (error) fallo("No pude leer las sugerencias", error)
  return data
}

export const NOMBRE_DEL_ESTADO_DE_INVESTIGACION: Record<EstadoDeInvestigacion, string> = {
  en_cola: "En cola",
  investigando: "Investigando",
  informe_por_aprobar: "Informe listo",
  aprobada: "Aprobada",
  descartada: "Descartada",
  fallo: "No salió",
}

/** Reports waiting for Federico's approval, for Inicio. */
export async function informesPorAprobar(db: Db): Promise<number> {
  const { count, error } = await db
    .from("investigaciones")
    .select("id", { count: "exact", head: true })
    .eq("estado", "informe_por_aprobar")
  if (error) fallo("No pude contar los informes por aprobar", error)
  return count ?? 0
}
