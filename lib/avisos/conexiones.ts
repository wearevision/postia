import { seRenuevaSola } from "@/lib/marcas/estado-conexion"
import { diaEnSantiago } from "@/lib/piezas/calendario"
import { fechaLarga } from "@/lib/piezas/fechas"
import { RUTA_DE_AJUSTES } from "@/lib/sesion/rutas"
import type { Db } from "@/lib/supabase/database"
import { avisarMiembros } from "./a-miembros"
import type { ServicioPush } from "./push"
import { anotarAviso } from "./repositorio-de-avisos"
import type { MensajePush } from "./tipos"

// Calendar days before expiry that earn a digest line (a profile token lives 60 days and has no refresh).
const MARCAS_DE_AVISO = new Set([14, 3])
// The marks where a signed piece scheduled after the expiry is worth a line; every day would repeat it for weeks.
const MARCAS_DE_PIEZAS = new Set([14, 3, 1])
const DIA_MS = 86_400_000

export interface DatosDeConexion {
  expiraEn: string
  /** A page's refresh token: the daily refresh keeps the connection alive while seRenuevaSola holds. */
  renovacionExpiraEn?: string | null
  cuentas: readonly string[]
  ultimaProgramada: string | null
}

/** Chile calendar days from today to the expiry day: a 24-hour count would slip by one across a daylight saving change. */
function diasDeCalendario(expiraEn: string, ahora: number): number {
  const comoUtc = (instante: number) => Date.parse(`${diaEnSantiago(instante)}T00:00:00Z`)
  return Math.round((comoUtc(Date.parse(expiraEn)) - comoUtc(ahora)) / DIA_MS)
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
    url: RUTA_DE_AJUSTES,
  })
  if (Date.parse(d.expiraEn) <= ahora) {
    const dias = diasDeCalendario(d.expiraEn, ahora)
    const venció = aviso(`La conexión de LinkedIn de ${quien} venció. Reconéctala en Ajustes.`)
    // One push when it happens; the following days it waits for the digest instead of buzzing every morning.
    return dias >= -1 ? { urgente: venció, lineas: [] } : { urgente: null, lineas: [venció] }
  }
  if (Date.parse(d.expiraEn) - ahora < DIA_MS) {
    return {
      urgente: aviso(`La conexión de LinkedIn de ${quien} vence en menos de un día. Reconéctala en Ajustes.`),
      lineas: [],
    }
  }
  // A self-renewing connection really ends with its refresh token: that is the date worth warning about. The access
  // token still earns the urgent pushes above, in case every daily refresh failed.
  const renovable = seRenuevaSola(d.expiraEn, d.renovacionExpiraEn, ahora) && d.renovacionExpiraEn
  const fin = renovable || d.expiraEn
  const dias = diasDeCalendario(fin, ahora)
  const lineas: MensajePush[] = []
  if (MARCAS_DE_AVISO.has(dias)) {
    lineas.push(
      aviso(
        renovable
          ? `La conexión de LinkedIn de ${quien} deja de renovarse sola en ${dias} días. Reconéctala en Ajustes.`
          : `La conexión de LinkedIn de ${quien} vence en ${dias} días. Reconéctala en Ajustes.`,
      ),
    )
  }
  if (MARCAS_DE_PIEZAS.has(dias) && d.ultimaProgramada && Date.parse(d.ultimaProgramada) >= Date.parse(fin)) {
    lineas.push(
      aviso(
        `Hay piezas de ${quien} programadas después del ${fechaLarga(fin)}, cuando vence su conexión. Reconéctala en Ajustes.`,
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
    .select("id, expira_en, renovacion_expira_en, cuentas(id, nombre, marca_id, ruta)")
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
          renovacionExpiraEn: conexion.renovacion_expira_en,
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
