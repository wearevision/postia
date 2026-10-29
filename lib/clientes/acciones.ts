import { z } from "zod"
import type { Resultado } from "@/lib/marcas/acciones"
import { diaEnSantiago } from "@/lib/piezas/calendario"
import type { Db } from "@/lib/supabase/database"

const MENSAJES: Record<string, string> = {
  solo_el_dueno_marca_excepciones: "Solo el dueño de una marca puede marcar excepciones.",
  caso_de_otro_cliente: "Ese caso es de otro cliente.",
  excepcion_ya_quitada: "Esa excepción ya no estaba.",
  excepcion_invalida: "Revisa el cliente, el tipo y los alias: sin alias repetidos.",
}

const FECHA_PASADA = "La fecha ya pasó."

/** `hoy` is Chile's calendar day: an end date is inclusive, so today is still allowed. */
function nuevaExcepcion(hoy: string) {
  return z.object({
    cliente: z.string().trim().min(1).max(120),
    casoSlug: z
      .string()
      .regex(/^[a-z0-9-]{3,140}$/)
      .optional(),
    tipo: z.enum(["no_nombrar", "sin_fotos", "sin_logo", "confidencial"]),
    // The form sends text: aliases separated by commas, and an empty date for «until removed».
    alias: z.string().max(600),
    hasta: z.union([z.literal(""), z.iso.date()]).refine((d) => d === "" || d >= hoy, { message: FECHA_PASADA }),
  })
}

function falla(error: { code?: string; message: string }): { ok: false; error: string } {
  if (error.code === "23505") return { ok: false, error: "Ese cliente ya tiene esa excepción." }
  if (Object.hasOwn(MENSAJES, error.message)) return { ok: false, error: MENSAJES[error.message] }
  console.error("Falla inesperada al guardar una excepción", error.code, error.message)
  return { ok: false, error: "No pude guardar. Inténtalo de nuevo en un rato." }
}

export async function marcarExcepcion(
  db: Db,
  entrada: unknown,
  ahora = Date.now(),
): Promise<Resultado<{ id: string }>> {
  const leida = nuevaExcepcion(diaEnSantiago(ahora)).safeParse(entrada)
  if (!leida.success) {
    const pasada = leida.error.issues.some((i) => i.message === FECHA_PASADA)
    return { ok: false, error: pasada ? FECHA_PASADA : "Revisa el cliente, el tipo y la fecha." }
  }
  const e = leida.data
  const alias = e.alias
    .split(",")
    .map((a) => a.trim())
    .filter(Boolean)
  if (alias.length > 10) return { ok: false, error: "Hasta 10 alias por excepción." }
  // Optional arguments are left out (undefined), never null: the RPC's defaults apply.
  const { data, error } = await db.rpc("marcar_excepcion", {
    p_cliente: e.cliente,
    p_caso: e.casoSlug,
    p_tipo: e.tipo,
    p_alias: alias,
    p_hasta: e.hasta || undefined,
  })
  return error ? falla(error) : { ok: true, id: data }
}

export async function quitarExcepcion(db: Db, id: string): Promise<Resultado> {
  if (!z.uuid().safeParse(id).success) return { ok: false, error: MENSAJES.excepcion_ya_quitada }
  const { error } = await db.rpc("quitar_excepcion", { p_id: id })
  return error ? falla(error) : { ok: true }
}
