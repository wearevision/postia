import { estadoDeConexion } from "@/lib/marcas/estado-conexion"
import { fechaLarga } from "@/lib/piezas/fechas"
import { RUTA_DE_MARCAS } from "@/lib/sesion/rutas"
import type { Db } from "@/lib/supabase/database"
import { avisarMiembros } from "./a-miembros"
import type { ServicioPush } from "./push"
import { anotarAviso } from "./repositorio-de-avisos"
import type { MensajePush } from "./tipos"

// Days before expiry that earn a digest line (the token lives 60 days and has no refresh).
const MARCAS_DE_AVISO = new Set([14, 3])
const DIAS_DE_VIGILANCIA = 14

export interface DatosDeConexion {
  expiraEn: string
  cuentas: readonly string[]
  ultimaProgramada: string | null
}

/** Plano «Vigilar conexiones»: what to say today about one connection. Urgent goes now; lines wait for the digest. */
export function revisarConexion(
  d: DatosDeConexion,
  ahora: number,
): { urgente: MensajePush | null; lineas: MensajePush[] } {
  const quien = d.cuentas.join(" y ")
  const aviso = (cuerpo: string): MensajePush => ({
    titulo: `Conexión de LinkedIn · ${quien}`,
    cuerpo,
    url: RUTA_DE_MARCAS,
  })
  const estado = estadoDeConexion(d.expiraEn, ahora)
  if (estado.estado === "sin_conexion") return { urgente: null, lineas: [] }
  if (estado.estado === "vencida") {
    return { urgente: aviso(`La conexión de LinkedIn de ${quien} venció. Reconéctala en Marcas.`), lineas: [] }
  }
  if (estado.dias <= 1) {
    return {
      urgente: aviso(`La conexión de LinkedIn de ${quien} vence en menos de un día. Reconéctala en Marcas.`),
      lineas: [],
    }
  }
  const lineas: MensajePush[] = []
  if (MARCAS_DE_AVISO.has(estado.dias)) {
    lineas.push(aviso(`La conexión de LinkedIn de ${quien} vence en ${estado.dias} días. Reconéctala en Marcas.`))
  }
  // Only inside the last two weeks: earlier, a piece planned far ahead would repeat this line every day for weeks.
  if (
    estado.dias <= DIAS_DE_VIGILANCIA &&
    d.ultimaProgramada &&
    Date.parse(d.ultimaProgramada) >= Date.parse(d.expiraEn)
  ) {
    lineas.push(
      aviso(
        `Hay piezas de ${quien} programadas después del ${fechaLarga(d.expiraEn)}, cuando vence su conexión. Reconéctala en Marcas.`,
      ),
    )
  }
  return { urgente: null, lineas }
}

/** One pass over every LinkedIn connection that serves an API account. A failing connection does not stop the others. */
export async function vigilarConexiones(
  db: Db,
  servicio: ServicioPush,
  ahora: number,
): Promise<{ urgentes: number; lineas: number }> {
  const { data: conexiones, error } = await db
    .from("conexiones")
    .select("id, expira_en, cuentas(id, nombre, marca_id, ruta)")
  if (error) throw new Error(`No pude leer las conexiones: ${error.message}`, { cause: error })
  const total = { urgentes: 0, lineas: 0 }
  for (const conexion of conexiones) {
    const cuentas = conexion.cuentas.filter((c) => c.ruta === "api")
    if (cuentas.length === 0) continue
    try {
      const { data: ultima, error: errorDeUltima } = await db
        .from("piezas")
        .select("programada_para")
        .in(
          "cuenta_id",
          cuentas.map((c) => c.id),
        )
        .eq("estado", "programada")
        .order("programada_para", { ascending: false })
        .limit(1)
        .maybeSingle()
      if (errorDeUltima) throw new Error(errorDeUltima.message, { cause: errorDeUltima })
      const revision = revisarConexion(
        {
          expiraEn: conexion.expira_en,
          cuentas: cuentas.map((c) => c.nombre),
          ultimaProgramada: ultima?.programada_para ?? null,
        },
        ahora,
      )
      for (const marcaId of new Set(cuentas.map((c) => c.marca_id))) {
        if (revision.urgente) {
          await avisarMiembros(db, servicio, marcaId, revision.urgente, true)
          total.urgentes++
        }
        for (const linea of revision.lineas) {
          await anotarAviso(db, marcaId, linea)
          total.lineas++
        }
      }
    } catch (errorDeConexion) {
      const causa = errorDeConexion instanceof Error ? errorDeConexion.message : String(errorDeConexion)
      console.error(`No pude revisar la conexión ${conexion.id}: ${causa}`)
    }
  }
  return total
}
