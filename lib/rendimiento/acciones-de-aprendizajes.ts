import { z } from "zod"
import type { Resultado } from "@/lib/marcas/acciones"
import type { Db } from "@/lib/supabase/database"

// Worker-safe: the owner's actions on the learnings. The reading itself is done by the Trigger.dev task.

export const LARGO_MAXIMO_DEL_APRENDIZAJE = 400

const Id = z.uuid()

const Decision = z.object({
  id: Id,
  estado: z.enum(["aprobado", "descartado"]),
  texto: z.string().trim().min(1, "Escribe el aprendizaje.").max(LARGO_MAXIMO_DEL_APRENDIZAJE).optional(),
})

const GENERICO_AL_PEDIR = "No pude pedir la lectura. Inténtalo de nuevo en un rato."
const GENERICO_AL_DECIDIR = "No pude guardar tu decisión. Inténtalo de nuevo en un rato."

export async function pedirLectura(db: Db, cuentaId: string): Promise<Resultado> {
  if (!Id.safeParse(cuentaId).success) return { ok: false, error: "Revisa la cuenta." }
  const { error } = await db.rpc("pedir_lectura", { p_cuenta: cuentaId })
  if (!error) return { ok: true }
  if (error.message === "lectura_en_curso") return { ok: false, error: "Ya hay una lectura en curso." }
  if (error.message === "solo_el_dueno_pide_lecturas")
    return { ok: false, error: "Solo el dueño de la marca de esa cuenta puede pedir una lectura." }
  console.error("No pude pedir la lectura", error.code, error.message)
  return { ok: false, error: GENERICO_AL_PEDIR }
}

/**
 * After a successful import. True when a reading is queued or already open; false when it could not be queued. That is
 * logged and never fails the import: the figures are saved, and «Leer de nuevo» is there to retry.
 */
export async function encolarLectura(db: Db, cuentaId: string): Promise<boolean> {
  const { error } = await db.rpc("pedir_lectura", { p_cuenta: cuentaId })
  if (!error || error.message === "lectura_en_curso") return true
  console.error("No pude encolar la lectura tras importar", error.code, error.message)
  return false
}

export async function decidirAprendizaje(db: Db, entrada: unknown): Promise<Resultado> {
  const leida = Decision.safeParse(entrada)
  if (!leida.success) {
    const sobreElTexto = leida.error.issues.find((i) => i.path[0] === "texto")
    if (sobreElTexto)
      return {
        ok: false,
        error:
          sobreElTexto.code === "too_big"
            ? `El aprendizaje pasa los ${LARGO_MAXIMO_DEL_APRENDIZAJE} caracteres.`
            : sobreElTexto.message,
      }
    return { ok: false, error: "Revisa el aprendizaje." }
  }
  const { id, estado, texto } = leida.data
  const { error } = await db.rpc("decidir_aprendizaje", { p_id: id, p_estado: estado, p_texto: texto })
  if (!error) return { ok: true }
  if (error.message === "aprendizaje_no_encontrado") return { ok: false, error: "Ese aprendizaje ya no existe." }
  if (error.message === "solo_el_dueno_decide")
    return { ok: false, error: "Solo el dueño de la marca de esa cuenta puede decidir los aprendizajes." }
  if (error.message === "texto_invalido")
    return { ok: false, error: `El aprendizaje debe tener entre 1 y ${LARGO_MAXIMO_DEL_APRENDIZAJE} caracteres.` }
  console.error("No pude decidir el aprendizaje", error.code, error.message)
  return { ok: false, error: GENERICO_AL_DECIDIR }
}
