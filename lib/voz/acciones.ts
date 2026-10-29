import type { Resultado } from "@/lib/marcas/acciones"
import type { Db } from "@/lib/supabase/database"
import { LineaParaGuardar } from "./linea"

const MENSAJES: Record<string, string> = {
  linea_cambio: "Alguien guardó otra versión mientras editabas. Recarga para ver la última.",
  solo_el_dueno_edita_la_linea: "Solo el dueño de la marca puede cambiar su línea editorial.",
  pilares_invalidos: "Revisa los pilares: entre 1 y 8, con nombres distintos.",
  pilares_repetidos: "Revisa los pilares: entre 1 y 8, con nombres distintos.",
  pilar_de_otra_marca: "Uno de los pilares es de otra marca. Recarga e inténtalo de nuevo.",
}

export async function guardarLinea(db: Db, entrada: unknown): Promise<Resultado<{ version: number }>> {
  const leida = LineaParaGuardar.safeParse(entrada)
  if (!leida.success) {
    const enPilares = leida.error.issues.some((i) => i.path[0] === "pilares")
    return { ok: false, error: enPilares ? MENSAJES.pilares_invalidos : "Revisa el largo de cada sección." }
  }
  const { marcaId, base, secciones, pilares } = leida.data
  const { data, error } = await db.rpc("guardar_linea_editorial", {
    p_marca: marcaId,
    p_base: base,
    p_secciones: secciones,
    p_pilares: pilares,
  })
  if (error) {
    const mensaje = MENSAJES[error.message]
    if (mensaje) return { ok: false, error: mensaje }
    console.error("Falla inesperada al guardar la línea editorial", error.code, error.message)
    return { ok: false, error: "No pude guardar. Inténtalo de nuevo en un rato." }
  }
  return { ok: true, version: data }
}
