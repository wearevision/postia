import type { Resultado } from "@/lib/marcas/acciones"
import type { Db } from "@/lib/supabase/database"
import { LineaParaGuardar } from "./linea"

const PILARES_INVALIDOS = "Revisa los pilares: entre 1 y 8, con nombres distintos y una decimal como máximo por semana."

const MENSAJES: Record<string, string> = {
  linea_cambio: "Alguien guardó otra versión mientras editabas. Recarga para ver la última.",
  solo_el_dueno_edita_la_linea: "Solo el dueño de la marca puede cambiar su línea editorial.",
  pilares_invalidos: PILARES_INVALIDOS,
  pilares_repetidos: PILARES_INVALIDOS,
  pilar_de_otra_marca: "Uno de los pilares es de otra marca. Recarga e inténtalo de nuevo.",
}

export async function guardarLinea(db: Db, entrada: unknown): Promise<Resultado<{ version: number }>> {
  const leida = LineaParaGuardar.safeParse(entrada)
  if (!leida.success) {
    const partes = new Set(leida.error.issues.map((i) => i.path[0]))
    if (partes.has("pilares")) return { ok: false, error: PILARES_INVALIDOS }
    if (partes.has("secciones")) return { ok: false, error: "Revisa el largo de cada sección." }
    return { ok: false, error: "Revisa los datos de la línea." }
  }
  const { marcaId, base, secciones, pilares } = leida.data
  const { data, error } = await db.rpc("guardar_linea_editorial", {
    p_marca: marcaId,
    p_base: base,
    p_secciones: secciones,
    p_pilares: pilares,
  })
  if (error) {
    if (Object.hasOwn(MENSAJES, error.message)) return { ok: false, error: MENSAJES[error.message] }
    console.error("Falla inesperada al guardar la línea editorial", error.code, error.message)
    return { ok: false, error: "No pude guardar. Inténtalo de nuevo en un rato." }
  }
  return { ok: true, version: data }
}
