import { z } from "zod"
import type { Resultado } from "@/lib/marcas/acciones"
import { normalizarTexto } from "@/lib/piezas/huella"
import type { Db } from "@/lib/supabase/database"

const MENSAJES: Record<string, string> = {
  solo_el_dueno_pide_textos: "Solo el dueño de la marca puede pedir textos.",
  marca_sin_linea: "Esa marca todavía no tiene línea editorial. Escríbela en Voz antes de pedir textos.",
  pilar_no_valido: "Ese pilar no es de esta marca o ya no está en su línea.",
  demasiados_pedidos: "Ya hay 5 pedidos en curso para esta marca. Espera a que terminen.",
  pieza_no_esta_por_aprobar: "Esta pieza ya no espera tu firma.",
  solo_posts_de_texto: "Por ahora Claude solo escribe posts de texto.",
  pedido_en_curso: "Claude ya está trabajando en esta pieza.",
  sin_reescrituras: "Ya pediste 3 versiones de esta pieza. Corrígela a mano.",
  ya_revisada: "Esta versión ya tiene revisión de Claude.",
  pieza_no_editable: "Esta pieza ya no se puede editar.",
  solo_el_dueno_cambia_piezas: "Solo el dueño de la marca puede cambiar piezas.",
}

function falla(error: { code?: string; message: string }): { ok: false; error: string } {
  if (Object.hasOwn(MENSAJES, error.message)) return { ok: false, error: MENSAJES[error.message] }
  console.error("Falla inesperada en un pedido de texto", error.code, error.message)
  return { ok: false, error: "No pude guardar. Inténtalo de nuevo en un rato." }
}

const Encargo = z.object({
  cuentaId: z.uuid(),
  encargo: z.string().trim().min(1, "Cuenta de qué trata el post.").max(2000, "El encargo pasa los 2000 caracteres."),
  material: z.string().max(8000, "El material pasa los 8000 caracteres."),
  pilarId: z.uuid().nullable(),
})

function primerError(error: z.ZodError): string {
  return error.issues[0]?.message ?? "Revisa el pedido."
}

export async function pedirTexto(db: Db, entrada: unknown): Promise<Resultado<{ pedidoId: string }>> {
  const leida = Encargo.safeParse(entrada)
  if (!leida.success) return { ok: false, error: primerError(leida.error) }
  const { data, error } = await db.rpc("pedir_texto", {
    p_cuenta: leida.data.cuentaId,
    p_encargo: leida.data.encargo,
    p_material: leida.data.material.trim() || undefined,
    p_pilar: leida.data.pilarId ?? undefined,
  })
  return error ? falla(error) : { ok: true, pedidoId: data }
}

const Reescritura = z.object({
  piezaId: z.uuid(),
  instruccion: z.string().trim().min(1, "Di qué cambiar.").max(500, "La instrucción pasa los 500 caracteres."),
})

export async function pedirReescritura(db: Db, entrada: unknown): Promise<Resultado> {
  const leida = Reescritura.safeParse(entrada)
  if (!leida.success) return { ok: false, error: primerError(leida.error) }
  const { error } = await db.rpc("pedir_reescritura", {
    p_pieza: leida.data.piezaId,
    p_instruccion: leida.data.instruccion,
  })
  return error ? falla(error) : { ok: true }
}

export async function pedirRevision(db: Db, piezaId: string): Promise<Resultado> {
  if (!z.uuid().safeParse(piezaId).success) return { ok: false, error: "Revisa la pieza." }
  const { error } = await db.rpc("pedir_revision", { p_pieza: piezaId })
  return error ? falla(error) : { ok: true }
}

const Correccion = z.object({ piezaId: z.uuid(), texto: z.string() })

/** A hand correction at gate 1 (plano: corregirVariante). The new version drops nothing: the piece is not signed yet. */
export async function corregirTexto(db: Db, entrada: unknown): Promise<Resultado> {
  const leida = Correccion.safeParse(entrada)
  if (!leida.success) return { ok: false, error: "Revisa el texto." }
  const texto = normalizarTexto(leida.data.texto)
  if (!texto.trim()) return { ok: false, error: "Falta el texto." }
  if ([...texto].length > 3000) return { ok: false, error: "El texto pasa los 3000 caracteres de LinkedIn." }
  const { data: actual, error: errorAlLeer } = await db
    .from("versiones")
    .select("texto")
    .eq("pieza_id", leida.data.piezaId)
    .order("numero", { ascending: false })
    .limit(1)
    .maybeSingle()
  if (errorAlLeer) return falla(errorAlLeer)
  if (actual?.texto === texto) return { ok: false, error: "El texto no cambió." }
  const { error } = await db.rpc("nueva_version", { p_pieza: leida.data.piezaId, p_texto: texto })
  return error ? falla(error) : { ok: true }
}
