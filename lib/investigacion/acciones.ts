import { z } from "zod"
import type { Resultado } from "@/lib/marcas/acciones"
import type { Db } from "@/lib/supabase/database"

// Worker-safe: people only queue work here; the search and the sort run in Trigger.dev (lib/investigacion/investigar).

const MENSAJES: Record<string, string> = {
  solo_duenos_investigan: "Solo el dueño de una marca puede pedir investigaciones.",
  demasiadas_investigaciones: "Ya hay 3 investigaciones en curso. Espera a que terminen.",
  formato_no_disponible: "Ese formato llega con Instagram.",
  trabajo_en_curso: "Ya se está ampliando este informe.",
  angulo_desconocido: "Ese ángulo no está en el informe.",
  informe_no_esta_por_aprobar: "Este informe ya no espera tu revisión.",
}

function falla(error: { code?: string; message: string }): { ok: false; error: string } {
  if (Object.hasOwn(MENSAJES, error.message)) return { ok: false, error: MENSAJES[error.message] }
  console.error("Falla inesperada en una investigación", error.code, error.message)
  return { ok: false, error: "No pude guardar. Inténtalo de nuevo en un rato." }
}

export const ENFOQUES = ["tendencias", "desafios", "mitos", "guia"] as const
export type Enfoque = (typeof ENFOQUES)[number]
export const FORMATOS_DE_INVESTIGACION = ["texto", "carrusel_pdf"] as const
export type FormatoDeInvestigacion = (typeof FORMATOS_DE_INVESTIGACION)[number]

const Encargo = z.object({
  tema: z.string().trim().min(1, "Escribe qué quieres investigar.").max(300, "El tema pasa los 300 caracteres."),
  cantidad: z.number("Elige cuántas piezas.").int("Elige cuántas piezas.").min(1).max(30, "Son 30 piezas como máximo."),
  formato: z.enum(FORMATOS_DE_INVESTIGACION, "Elige un formato."),
  enfoque: z.enum(ENFOQUES, "Elige un enfoque.").nullish(),
})

function primerError(error: z.ZodError): string {
  return error.issues[0]?.message ?? "Revisa el pedido."
}

export async function pedirInvestigacion(db: Db, entrada: unknown): Promise<Resultado<{ investigacionId: string }>> {
  const leido = Encargo.safeParse(entrada)
  if (!leido.success) return { ok: false, error: primerError(leido.error) }
  const { data, error } = await db.rpc("pedir_investigacion", {
    p_tema: leido.data.tema,
    p_cantidad: leido.data.cantidad,
    p_formato: leido.data.formato,
    p_enfoque: leido.data.enfoque ?? undefined,
  })
  return error ? falla(error) : { ok: true, investigacionId: data }
}

const Ampliacion = z.object({
  investigacionId: z.uuid("Revisa el informe."),
  angulo: z.string().trim().min(1, "Elige un ángulo.").max(80, "Ese ángulo no está en el informe."),
})

export async function pedirAmpliacion(db: Db, entrada: unknown): Promise<Resultado> {
  const leida = Ampliacion.safeParse(entrada)
  if (!leida.success) return { ok: false, error: primerError(leida.error) }
  const { error } = await db.rpc("pedir_ampliacion", {
    p_investigacion: leida.data.investigacionId,
    p_angulo: leida.data.angulo,
  })
  return error ? falla(error) : { ok: true }
}

export async function aprobarInforme(db: Db, investigacionId: string): Promise<Resultado> {
  if (!z.uuid().safeParse(investigacionId).success) return { ok: false, error: "Revisa el informe." }
  const { error } = await db.rpc("aprobar_informe", { p_investigacion: investigacionId })
  return error ? falla(error) : { ok: true }
}

export async function descartarInforme(db: Db, investigacionId: string): Promise<Resultado> {
  if (!z.uuid().safeParse(investigacionId).success) return { ok: false, error: "Revisa el informe." }
  const { error } = await db.rpc("descartar_informe", { p_investigacion: investigacionId })
  return error ? falla(error) : { ok: true }
}

export async function descartarHallazgo(db: Db, hallazgoId: string): Promise<Resultado> {
  if (!z.uuid().safeParse(hallazgoId).success) return { ok: false, error: "Revisa el hallazgo." }
  const { error } = await db.rpc("descartar_hallazgo", { p_hallazgo: hallazgoId })
  return error ? falla(error) : { ok: true }
}
