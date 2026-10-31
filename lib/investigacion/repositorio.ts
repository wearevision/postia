import { z } from "zod"
import { repositorioDelMapa } from "@/lib/mapa/repositorio"
import { UMBRALES } from "@/lib/mapa/umbrales"
import type { Db } from "@/lib/supabase/database"
import type { PuertosDeInvestigacion, Trabajo } from "./investigar"
import type { PuertosDeAtencionDeInvestigacion, PuertosDeVigilancia } from "./vigilancia"

// Service role only (Trigger.dev): it reads every brand's line and writes the map.

function fallo(accion: string, error: { message: string }): never {
  throw new Error(`${accion}: ${error.message}`, { cause: error })
}

/** Bounds the extension prompt: a report rarely has this many links, and guardar_hallazgo refuses repeats anyway. */
const ENLACES_YA_GUARDADOS = 100
const TEMAS_DEL_MAPA = 40

const Formato = z.enum(["texto", "carrusel_pdf"]).nullable()
const Enfoque = z.enum(["tendencias", "desafios", "mitos", "guia"]).nullable()

type Puertos = Omit<PuertosDeInvestigacion, "pedir" | "embeber"> &
  Pick<PuertosDeAtencionDeInvestigacion, "tomar" | "terminar"> &
  Omit<PuertosDeVigilancia, keyof PuertosDeInvestigacion>

export function repositorioDeInvestigaciones(db: Db): Puertos {
  const mapa = repositorioDelMapa(db)
  return {
    async tomar(): Promise<Trabajo | null> {
      const { data, error } = await db.rpc("tomar_trabajo_de_investigacion")
      if (error) fallo("No pude tomar el trabajo de investigación", error)
      const trabajo = data[0]
      if (!trabajo) return null
      const [investigacion, ya] = await Promise.all([
        db
          .from("investigaciones")
          .select("tema, cantidad, formato, enfoque, origen")
          .eq("id", trabajo.investigacion_id)
          .single(),
        trabajo.tipo === "ampliar"
          ? db
              .from("hallazgos")
              .select("enlace")
              .eq("investigacion_id", trabajo.investigacion_id)
              .order("creado_en")
              .limit(ENLACES_YA_GUARDADOS)
          : Promise.resolve({ data: [] as { enlace: string }[], error: null }),
      ])
      if (investigacion.error) fallo("No pude leer la investigación del trabajo", investigacion.error)
      if (ya.error) fallo("No pude leer los hallazgos de la investigación", ya.error)
      const i = investigacion.data
      return {
        id: trabajo.id,
        tipo: z.enum(["investigar", "ampliar"]).parse(trabajo.tipo),
        investigacionId: trabajo.investigacion_id,
        angulo: trabajo.angulo,
        tema: i.tema,
        cantidad: i.cantidad,
        formato: Formato.parse(i.formato),
        enfoque: Enfoque.parse(i.enfoque),
        origen: z.enum(["encargo", "vigilancia"]).parse(i.origen),
        ya: ya.data.map((h) => h.enlace),
      }
    },

    async terminar(trabajoId, estado, motivo) {
      const { error } = await db.rpc("terminar_trabajo_de_investigacion", {
        p_trabajo: trabajoId,
        p_estado: estado,
        p_motivo: motivo,
      })
      if (error) fallo("No pude cerrar el trabajo de investigación", error)
    },

    guardarHallazgo: (h) => mapa.guardarHallazgo(h, UMBRALES),

    async cerrar(investigacionId, angulos) {
      const { error } = await db.rpc("cerrar_investigacion", {
        p_investigacion: investigacionId,
        p_angulos: angulos.map((a) => ({ nombre: a.nombre, por_que: a.por_que })),
      })
      if (error) fallo("No pude cerrar la investigación", error)
    },

    async temasDeLasLineas() {
      const { data, error } = await db
        .from("lineas_editoriales")
        .select("marca_id, temas_a_vigilar")
        .order("marca_id")
        .order("version", { ascending: false })
      if (error) fallo("No pude leer los temas a vigilar", error)
      const vigentes = new Map<string, string>()
      for (const l of data) if (!vigentes.has(l.marca_id)) vigentes.set(l.marca_id, l.temas_a_vigilar)
      return [...vigentes.values()]
    },

    async crearVigilancia(temas) {
      const { data, error } = await db.rpc("crear_vigilancia", { p_temas: temas })
      if (error) fallo("No pude crear la vigilancia", error)
      return data
    },

    async temasDelMapa() {
      const { data, count, error } = await db
        .from("temas")
        .select("nombre, descripcion", { count: "exact" })
        .is("fusionado_en", null)
        .order("creado_en", { ascending: false })
        .limit(TEMAS_DEL_MAPA)
      if (error) fallo("No pude leer los temas del mapa", error)
      return { activos: count ?? data.length, temas: data }
    },

    async guardarSugerencias(sugerencias) {
      const { error } = await db.rpc("guardar_sugerencias", { p_sugerencias: sugerencias })
      if (error) fallo("No pude guardar las sugerencias", error)
    },
  }
}
