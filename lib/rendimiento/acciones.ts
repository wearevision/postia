import { z } from "zod"
import type { Db } from "@/lib/supabase/database"
import { encolarLectura } from "./acciones-de-aprendizajes"

// Worker-safe: the XLSX is read in the browser (lector.ts); this validates what arrives and writes it in one RPC.

const Dia = z.iso.date()
const Entero = z.number().int().min(0)

const Exportacion = z.object({
  desde: Dia,
  hasta: Dia,
  seguidoresTotal: Entero.nullable(),
  publicaciones: z
    .array(
      z.object({
        postUrn: z.string().regex(/^urn:li:(share|ugcPost|activity):[0-9]+$/),
        publicadaEl: Dia,
        interacciones: Entero.nullable(),
        impresiones: Entero.nullable(),
        extracto: z.string().max(300).nullish(),
        clics: Entero.nullish(),
        seguidoresNuevos: Entero.nullish(),
      }),
    )
    .max(200),
  sinIdentificar: Entero,
  dias: z
    .array(
      z.object({
        dia: Dia,
        impresiones: Entero.nullable(),
        interacciones: Entero.nullable(),
        seguidoresNuevos: Entero.nullable(),
        visitas: Entero.nullish(),
        visitantesUnicos: Entero.nullish(),
      }),
    )
    .max(800),
  publico: z
    .array(
      z.object({
        tipo: z.enum(["publico", "contenido", "seguidores", "visitantes"]),
        categoria: z.string().trim().min(1).max(80),
        valor: z.string().trim().min(1).max(200),
        porcentaje: z.number().min(0).max(100).nullable(),
        menorAUno: z.boolean(),
        cantidad: Entero.nullish(),
      }),
    )
    .max(300),
})

const Entrada = z.object({ cuentaId: z.uuid(), exportacion: Exportacion, confirmado: z.boolean().optional() })

const Resumen = z.object({ publicaciones: Entero, de_postia: Entero, anteriores: Entero })

export type ResultadoDeImportacion =
  | {
      ok: true
      publicaciones: number
      dePostia: number
      anteriores: number
      sinIdentificar: number
      /** A reading of the account is queued or already open: Claude will propose learnings. */
      leyendo: boolean
    }
  | { ok: false; error: string; confirmar?: true }

const ARCHIVO_ILEGIBLE = "No pude leer el archivo. Descárgalo de nuevo desde LinkedIn."
const CUENTA_DUDOSA = "Ninguna publicación del archivo es de esta cuenta en PostIA. ¿Elegiste la cuenta correcta?"

async function algunaEsDePostia(db: Db, cuentaId: string, urns: string[]): Promise<boolean> {
  if (urns.length === 0) return true
  const { data, error } = await db
    .from("publicaciones")
    .select("post_urn, piezas!inner(cuenta_id)")
    .in("post_urn", urns)
    .eq("piezas.cuenta_id", cuentaId)
    .limit(1)
  if (error) throw new Error(`No pude revisar las publicaciones de la cuenta: ${error.message}`, { cause: error })
  return data.length > 0
}

export async function importarEstadisticas(db: Db, entrada: unknown): Promise<ResultadoDeImportacion> {
  const leida = Entrada.safeParse(entrada)
  if (!leida.success) return { ok: false, error: ARCHIVO_ILEGIBLE }
  const { cuentaId, exportacion: e, confirmado } = leida.data
  // The page's posts have no share/ugcPost URN to check against PostIA's sends: they are matched by day and text
  // inside the RPC, and the summary shows how many were PostIA's.
  const sePuedeVerificarPorUrn = e.publicaciones.every((p) => !p.extracto)
  if (
    !confirmado &&
    sePuedeVerificarPorUrn &&
    !(await algunaEsDePostia(
      db,
      cuentaId,
      e.publicaciones.map((p) => p.postUrn),
    ))
  )
    return { ok: false, error: CUENTA_DUDOSA, confirmar: true }
  const { data, error } = await db.rpc("importar_metricas", {
    p_cuenta: cuentaId,
    p_datos: {
      desde: e.desde,
      hasta: e.hasta,
      seguidores_total: e.seguidoresTotal,
      publicaciones: e.publicaciones.map((p) => ({
        post_urn: p.postUrn,
        publicada_el: p.publicadaEl,
        interacciones: p.interacciones,
        impresiones: p.impresiones,
        extracto: p.extracto ?? null,
        clics: p.clics ?? null,
        seguidores_nuevos: p.seguidoresNuevos ?? null,
      })),
      dias: e.dias.map((d) => ({
        dia: d.dia,
        impresiones: d.impresiones,
        interacciones: d.interacciones,
        seguidores_nuevos: d.seguidoresNuevos,
        visitas: d.visitas ?? null,
        visitantes_unicos: d.visitantesUnicos ?? null,
      })),
      publico: e.publico.map((p) => ({
        tipo: p.tipo,
        categoria: p.categoria,
        valor: p.valor,
        porcentaje: p.porcentaje,
        menor_a_uno: p.menorAUno,
        cantidad: p.cantidad ?? null,
      })),
    },
  })
  if (error) {
    if (error.message === "solo_el_dueno_importa")
      return { ok: false, error: "Solo el dueño de la marca de esa cuenta puede importar sus estadísticas." }
    if (error.message === "datos_invalidos") return { ok: false, error: ARCHIVO_ILEGIBLE }
    console.error("No pude importar estadísticas", error.code, error.message)
    return { ok: false, error: "No pude guardar las estadísticas. Inténtalo de nuevo en un rato." }
  }
  const r = Resumen.parse(data)
  const leyendo = await encolarLectura(db, cuentaId)
  return {
    ok: true,
    publicaciones: r.publicaciones,
    dePostia: r.de_postia,
    anteriores: r.anteriores,
    sinIdentificar: e.sinIdentificar,
    leyendo,
  }
}
