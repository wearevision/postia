import { z } from "zod"
import type { Db } from "@/lib/supabase/database"
import { aLiteral, deLiteral, enlaceNormalizado } from "./vectores"

export interface HallazgoNuevo {
  resumen: string
  cita: string | null
  enlace: string
  medio: string
  publicadoEn: string | null
  vector: number[]
}

const ResultadoDeGuardar = z.discriminatedUnion("estado", [
  z.object({ estado: z.literal("guardado"), id: z.string(), tema: z.string().nullable() }),
  z.object({ estado: z.literal("repetido"), de: z.string() }),
])
export type ResultadoDeGuardar = z.infer<typeof ResultadoDeGuardar>

export interface TemaCercano {
  id: string
  nombre: string
  descripcion: string
  similitud: number
}

export interface ParDeTemas {
  a: string
  b: string
  similitud: number
  hallazgos: { a: number; b: number }
}

function fallo(accion: string, error: { message: string }): never {
  throw new Error(`${accion}: ${error.message}`, { cause: error })
}

const PENDIENTES_POR_NOCHE = 500

/** The map's RPCs, with the service role (Trigger.dev only). */
export function repositorioDelMapa(db: Db) {
  return {
    async guardarHallazgo(h: HallazgoNuevo, umbrales: { repetido: number; tema: number }): Promise<ResultadoDeGuardar> {
      const { data, error } = await db.rpc("guardar_hallazgo", {
        p_resumen: h.resumen,
        p_enlace: h.enlace,
        p_enlace_normalizado: enlaceNormalizado(h.enlace),
        p_medio: h.medio,
        p_vector: aLiteral(h.vector),
        p_umbral_repetido: umbrales.repetido,
        p_umbral_tema: umbrales.tema,
        p_cita: h.cita ?? undefined,
        p_publicado_en: h.publicadoEn ?? undefined,
      })
      if (error) fallo("No pude guardar el hallazgo", error)
      return ResultadoDeGuardar.parse(data)
    },

    async cercanos(vector: number[], cantidad: number): Promise<TemaCercano[]> {
      const { data, error } = await db.rpc("temas_cercanos", { p_vector: aLiteral(vector), p_cantidad: cantidad })
      if (error) fallo("No pude buscar temas cercanos", error)
      return data
    },

    async pendientes(): Promise<{ id: string; resumen: string; vector: number[] }[]> {
      const { data, error } = await db.rpc("hallazgos_pendientes", { p_limite: PENDIENTES_POR_NOCHE })
      if (error) fallo("No pude leer los hallazgos sueltos", error)
      return data.map((h) => ({ id: h.id, resumen: h.resumen, vector: deLiteral(h.vector) }))
    },

    async reubicar(umbral: number): Promise<number> {
      const { data, error } = await db.rpc("reubicar_pendientes", { p_umbral: umbral })
      if (error) fallo("No pude reubicar los hallazgos sueltos", error)
      return data
    },

    async crearTema(
      tema: { nombre: string; descripcion: string },
      hallazgos: string[],
      minimo: number,
    ): Promise<string> {
      const { data, error } = await db.rpc("crear_tema", {
        p_nombre: tema.nombre,
        p_descripcion: tema.descripcion,
        p_hallazgos: hallazgos,
        p_minimo: minimo,
      })
      if (error) fallo("No pude crear el tema", error)
      return data
    },

    async casiIguales(umbral: number): Promise<ParDeTemas[]> {
      const { data, error } = await db.rpc("temas_casi_iguales", { p_umbral: umbral })
      if (error) fallo("No pude comparar los temas", error)
      return data.map((p) => ({
        a: p.tema_a,
        b: p.tema_b,
        similitud: p.similitud,
        hallazgos: { a: p.hallazgos_a, b: p.hallazgos_b },
      }))
    },

    async fusionar(de: string, en: string): Promise<boolean> {
      const { data, error } = await db.rpc("fusionar_temas", { p_de: de, p_en: en })
      if (error) fallo("No pude fusionar los temas", error)
      return data
    },
  }
}

export type RepositorioDelMapa = ReturnType<typeof repositorioDelMapa>
