import { z } from "zod"
import type { Resultado } from "@/lib/marcas/acciones"
import type { Db } from "@/lib/supabase/database"

const FUERA_DE_RANGO = "El tope va entre US$1 y US$1.000."

const TopeParaGuardar = z.object({
  marcaId: z.uuid().nullable(),
  // null removes a brand's own cap; the global cap always has one.
  dolares: z.number().min(1).max(1000).nullable(),
})

const MENSAJES: Record<string, string> = {
  solo_el_dueno_cambia_el_tope: "Solo el dueño puede cambiar el tope.",
  tope_invalido: FUERA_DE_RANGO,
}

export async function guardarTope(db: Db, entrada: unknown): Promise<Resultado> {
  const leida = TopeParaGuardar.safeParse(entrada)
  if (!leida.success || (leida.data.marcaId === null && leida.data.dolares === null)) {
    return { ok: false, error: FUERA_DE_RANGO }
  }
  const { marcaId, dolares } = leida.data
  const { error } = await db.rpc("guardar_tope", {
    p_monto_micro: dolares === null ? undefined : Math.round(dolares * 1_000_000),
    p_marca: marcaId ?? undefined,
  })
  if (error) {
    if (Object.hasOwn(MENSAJES, error.message)) return { ok: false, error: MENSAJES[error.message] }
    console.error("Falla inesperada al guardar el tope", error.code, error.message)
    return { ok: false, error: "No pude guardar el tope. Inténtalo de nuevo en un rato." }
  }
  return { ok: true }
}
