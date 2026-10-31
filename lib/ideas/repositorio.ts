import { z } from "zod"
import { UMBRALES } from "@/lib/mapa/umbrales"
import { aLiteral } from "@/lib/mapa/vectores"
import { ASIGNACION_ABIERTA, CON_HORARIO } from "@/lib/piezas/lectura"
import type { Db } from "@/lib/supabase/database"
import { balancePorCuenta } from "@/lib/voz/lectura"
import type { PuertosDeCalibracion } from "./calibrar"
import { fallaDeGuardarIdeasSueltas, type PuertosDeCruce, type PuertosDeOtraSuelta } from "./cruzar"
import { HALLAZGOS_DEL_DOMINGO, type PuertosDelDomingo } from "./domingo"
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
  Pick<PuertosDeOtraSuelta, "ideaSueltaAReemplazar"> &
  Pick<
    PuertosDelDomingo,
    "hallazgosDeLaSemana" | "pilaresPendientes" | "ganchosRecientes" | "crucesGuardadosDesde" | "ocupacionDeLaSemana"
  > &
  PuertosDeCalibracion

/** How many rows of `filas` belong to each account. */
function porCuenta(filas: { cuenta_id: string }[]): Map<string, number> {
  const cuentas = new Map<string, number>()
  for (const f of filas) cuentas.set(f.cuenta_id, (cuentas.get(f.cuenta_id) ?? 0) + 1)
  return cuentas
}

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

    async hallazgosDeLaSemana(desde) {
      const { data, error } = await db
        .from("hallazgos")
        .select("id, angulo, resumen, medio, publicado_en, enlace")
        .neq("estado", "descartado")
        .gte("creado_en", new Date(desde).toISOString())
        .order("creado_en", { ascending: false })
        .order("id")
        .limit(HALLAZGOS_DEL_DOMINGO)
      if (error) fallo("No pude leer los hallazgos de la semana", error)
      return data.map((h) => ({ ...h, angulo: h.angulo ?? "" }))
    },

    async pilaresPendientes(ahora) {
      const balances = await balancePorCuenta(db, ahora)
      return balances.flatMap((b) =>
        b.balance.filas.filter((f) => f.alerta).map((f) => ({ cuenta: b.cuenta, pilar: f.nombre })),
      )
    },

    async ganchosRecientes(limite) {
      const { data, error } = await db
        .from("ideas")
        .select("gancho")
        .order("creada_en", { ascending: false })
        .limit(limite)
      if (error) fallo("No pude leer las ideas anteriores", error)
      return data.map((i) => i.gancho)
    },

    async crucesGuardadosDesde(desde) {
      const { count, error } = await db
        .from("ideas")
        .select("id", { count: "exact", head: true })
        .eq("origen", "cruce")
        .gte("creada_en", desde)
      if (error) fallo("No pude contar los cruces de hoy", error)
      return count ?? 0
    },

    async ocupacionDeLaSemana(desde, hasta) {
      const [cuentas, piezas, asignaciones] = await Promise.all([
        db.from("cuentas").select("id, ritmo_semanal").gt("ritmo_semanal", 0).order("id"),
        db
          .from("piezas")
          .select("cuenta_id")
          .in("estado", [...CON_HORARIO])
          .gte("planeada_para", desde)
          .lt("planeada_para", hasta),
        db
          .from("asignaciones")
          .select("cuenta_id")
          .in("estado", [...ASIGNACION_ABIERTA])
          .gte("planeada_para", desde)
          .lt("planeada_para", hasta),
      ])
      if (cuentas.error) fallo("No pude leer las cuentas de la semana", cuentas.error)
      if (piezas.error) fallo("No pude leer las piezas de la semana", piezas.error)
      if (asignaciones.error) fallo("No pude leer las asignaciones de la semana", asignaciones.error)
      const dePiezas = porCuenta(piezas.data)
      const deAsignaciones = porCuenta(asignaciones.data)
      return cuentas.data.map((c) => ({
        cuentaId: c.id,
        ritmo: c.ritmo_semanal,
        ocupadas: (dePiezas.get(c.id) ?? 0) + (deAsignaciones.get(c.id) ?? 0),
      }))
    },

    async similitudesDePares(desde, limite) {
      const { data, error } = await db.rpc("similitudes_de_pares", {
        p_desde: new Date(desde).toISOString(),
        p_limite: limite,
      })
      if (error) fallo("No pude leer las similitudes de los pares", error)
      return data.map((p) => ({ similitud: p.similitud, mismoTema: p.mismo_tema }))
    },
  }
}
