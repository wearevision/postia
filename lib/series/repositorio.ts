import { z } from "zod"
import { leerExcepciones } from "@/lib/clientes/lectura"
import { aLiteral } from "@/lib/mapa/vectores"
import { diaEnSantiago } from "@/lib/piezas/calendario"
import { leerTipo } from "@/lib/piezas/lectura"
import { nombresVetados } from "@/lib/redaccion/instrucciones"
import type { Db } from "@/lib/supabase/database"
import { lineaDeMarca } from "@/lib/voz/lectura"
import type { PuertosDeSerie } from "./armar"
import { PREVIAS_EN_EL_MENSAJE } from "./instrucciones"
import type { CuentaDeSerie } from "./propuestas"

// Service role only (Trigger.dev): it reads every brand's line and accounts, and writes the ideas.

function fallo(accion: string, error: { message: string }): never {
  throw new Error(`${accion}: ${error.message}`, { cause: error })
}

const Angulos = z.array(z.object({ nombre: z.string(), por_que: z.string().catch("") }))
const Formato = z.enum(["texto", "carrusel_pdf"])
/** A report asked for before 4f could miss its count; the plano's default series is five ideas. */
const CANTIDAD_POR_DEFECTO = 5

export function repositorioDeSeries(db: Db): Omit<PuertosDeSerie, "pedir" | "embeberIdeas"> {
  return {
    async informeDeSerie(investigacionId) {
      const [investigacion, hallazgos] = await Promise.all([
        db.from("investigaciones").select("tema, cantidad, angulos").eq("id", investigacionId).single(),
        db
          .from("hallazgos")
          .select("id, angulo, resumen, medio, publicado_en, enlace")
          .eq("investigacion_id", investigacionId)
          .order("creado_en")
          .order("id"),
      ])
      if (investigacion.error) fallo("No pude leer el informe de la serie", investigacion.error)
      if (hallazgos.error) fallo("No pude leer los hallazgos del informe", hallazgos.error)
      return {
        tema: investigacion.data.tema,
        cantidad: investigacion.data.cantidad ?? CANTIDAD_POR_DEFECTO,
        angulos: Angulos.parse(investigacion.data.angulos),
        hallazgos: hallazgos.data.map((h) => ({ ...h, angulo: h.angulo ?? "" })),
      }
    },

    async cuentasDeSerie() {
      const { data: cuentas, error } = await db
        .from("cuentas")
        .select("id, nombre, tipo, marca_id")
        .gt("ritmo_semanal", 0)
        .order("creada_en")
        .order("id")
      if (error) fallo("No pude leer las cuentas de la serie", error)
      const marcas = [...new Set(cuentas.map((c) => c.marca_id))]
      const [lineas, pilares] = await Promise.all([
        Promise.all(marcas.map((m) => lineaDeMarca(db, m))),
        db
          .from("pilares")
          .select("id, marca_id, nombre, de_que_habla")
          .eq("activo", true)
          .in("marca_id", marcas)
          .order("orden"),
      ])
      if (pilares.error) fallo("No pude leer los pilares de la serie", pilares.error)
      return cuentas.flatMap((c): CuentaDeSerie[] => {
        const linea = lineas.find((l) => l?.marca.id === c.marca_id)
        if (!linea) return []
        return [
          {
            id: c.id,
            nombre: c.nombre,
            tipo: leerTipo(c.tipo),
            marca: linea.marca,
            pilares: pilares.data
              .filter((p) => p.marca_id === c.marca_id)
              .map((p) => ({ id: p.id, nombre: p.nombre, deQueHabla: p.de_que_habla })),
            temasVetados: linea.actual?.secciones.temasVetados ?? "",
          },
        ]
      })
    },

    async noNombrar() {
      return nombresVetados(await leerExcepciones(db), diaEnSantiago(Date.now()))
    },

    async ideasPrevias() {
      const { data, error } = await db
        .from("ideas")
        .select("gancho")
        .order("creada_en", { ascending: false })
        .limit(PREVIAS_EN_EL_MENSAJE)
      if (error) fallo("No pude leer las ideas anteriores", error)
      return data.map((i) => i.gancho)
    },

    async ideasParecidas(vector, umbral) {
      const { data, error } = await db.rpc("ideas_parecidas", {
        p_vector: aLiteral(vector),
        p_umbral: umbral,
        p_excepto: [],
      })
      if (error) fallo("No pude buscar ideas parecidas", error)
      return data.map((i) => i.id)
    },

    async ideaAReemplazar(ideaId) {
      const { data: idea, error } = await db
        .from("ideas")
        .select("gancho, resumen, formato, investigacion_id")
        .eq("id", ideaId)
        .single()
      if (error) fallo("No pude leer la idea a reemplazar", error)
      const { data: hermanas, error: errorDeHermanas } = await db
        .from("ideas")
        .select("gancho")
        .eq("investigacion_id", idea.investigacion_id ?? "")
        .in("estado", ["propuesta", "aprobada"])
        .neq("id", ideaId)
        .order("orden")
      if (errorDeHermanas) fallo("No pude leer las otras ideas de la serie", errorDeHermanas)
      return {
        gancho: idea.gancho,
        resumen: idea.resumen,
        formato: Formato.parse(idea.formato),
        hermanas: hermanas.map((h) => h.gancho),
      }
    },

    async guardarSerie(investigacionId, ideas) {
      const { data, error } = await db.rpc("guardar_serie", {
        p_investigacion: investigacionId,
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
      if (error) fallo("No pude guardar la serie", error)
      return data
    },
  }
}
