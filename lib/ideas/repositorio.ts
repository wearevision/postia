import { z } from "zod"
import { UMBRALES } from "@/lib/mapa/umbrales"
import { aLiteral } from "@/lib/mapa/vectores"
import type { Db } from "@/lib/supabase/database"
import { fallaDeGuardarIdeasSueltas, type PuertosDeCruce, type PuertosDeOtraSuelta } from "./cruzar"
import type { HallazgoDeCruce } from "./instrucciones"

// Service role only (Trigger.dev): it reads the whole map and writes ideas with no research.

function fallo(accion: string, error: { message: string }): never {
  throw new Error(`${accion}: ${error.message}`, { cause: error })
}

const Formato = z.enum(["texto", "carrusel_pdf"])
const Origen = z.enum(["cruce", "domingo"])

/** The findings by id with their topic's name, leaving out discarded ones. */
async function hallazgosConTema(db: Db, ids: string[]): Promise<Map<string, HallazgoDeCruce>> {
  if (ids.length === 0) return new Map()
  const { data, error } = await db
    .from("hallazgos")
    .select("id, resumen, medio, publicado_en, enlace, temas(nombre)")
    .in("id", [...new Set(ids)])
    .neq("estado", "descartado")
  if (error) fallo("No pude leer los hallazgos del cruce", error)
  return new Map(
    data.map((h) => [
      h.id,
      {
        id: h.id,
        resumen: h.resumen,
        medio: h.medio,
        publicado_en: h.publicado_en,
        enlace: h.enlace,
        tema: h.temas?.nombre ?? null,
      },
    ]),
  )
}

type Puertos = Pick<PuertosDeCruce, "paresParaCruzar" | "guardarIdeasSueltas"> &
  Pick<PuertosDeOtraSuelta, "ideaSueltaAReemplazar">

export function repositorioDeIdeas(db: Db): Puertos {
  return {
    async paresParaCruzar({ desde, limite, investigacionId }) {
      const { data, error } = await db.rpc("pares_para_cruzar", {
        p_desde: new Date(desde).toISOString(),
        p_minimo: UMBRALES.cruce.minimo,
        p_maximo: UMBRALES.cruce.maximo,
        p_limite: limite,
        ...(investigacionId ? { p_investigacion: investigacionId } : {}),
      })
      if (error) fallo("No pude leer los pares para cruzar", error)
      const hallazgos = await hallazgosConTema(
        db,
        data.flatMap((p) => [p.a, p.b]),
      )
      return data.flatMap((p) => {
        const a = hallazgos.get(p.a)
        const b = hallazgos.get(p.b)
        return a && b ? [{ a, b }] : []
      })
    },

    async guardarIdeasSueltas(origen, ideas) {
      const { data, error } = await db.rpc("guardar_ideas_sueltas", {
        p_origen: origen,
        p_ideas: ideas.map((i) => ({
          gancho: i.gancho,
          resumen: i.resumen,
          formato: i.formato,
          esqueleto: i.esqueleto,
          fuentes: i.fuentes,
          cuenta: i.cuenta,
          razon: i.razon,
          pilar: i.pilar,
          vector: aLiteral(i.vector),
          ...(i.reemplazaA ? { reemplaza_a: i.reemplazaA } : {}),
        })),
      })
      if (error) {
        const falla = fallaDeGuardarIdeasSueltas(error)
        if (falla) throw falla
        fallo("No pude guardar las ideas sueltas", error)
      }
      return data
    },

    async ideaSueltaAReemplazar(ideaId) {
      const { data, error } = await db
        .from("ideas")
        .select("origen, gancho, resumen, formato, fuentes")
        .eq("id", ideaId)
        .single()
      if (error) fallo("No pude leer la idea a reemplazar", error)
      const hallazgos = await hallazgosConTema(db, data.fuentes)
      return {
        origen: Origen.parse(data.origen),
        gancho: data.gancho,
        resumen: data.resumen,
        formato: Formato.parse(data.formato),
        fuentes: data.fuentes.flatMap((f) => hallazgos.get(f) ?? []),
      }
    },
  }
}
