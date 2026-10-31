import { z } from "zod"
import type { Resultado } from "@/lib/marcas/acciones"
import { revisarCarrusel } from "@/lib/plantillas/laminas"
import { esTema } from "@/lib/plantillas/temas"
import type { Db } from "@/lib/supabase/database"
import type { Json } from "@/lib/supabase/database.types"

const MENSAJES: Record<string, string> = {
  solo_el_dueno_pide_disenos: "Solo el dueño de la marca puede pedir carruseles.",
  tema_de_otra_marca: "Ese diseño no es de esta marca.",
  pieza_de_otra_cuenta: "Esa pieza es de otra cuenta.",
  solo_carruseles: "Esta pieza no es un carrusel.",
  pieza_no_editable: "Esta pieza ya no se puede editar.",
  pedido_en_curso: "Ya se está armando un carrusel para esta pieza.",
  demasiados_pedidos: "Ya hay 5 carruseles armándose para esta marca. Espera a que terminen.",
}

function falla(error: { code?: string; message: string }): { ok: false; error: string } {
  if (Object.hasOwn(MENSAJES, error.message)) return { ok: false, error: MENSAJES[error.message] }
  console.error("Falla inesperada en un pedido de carrusel", error.code, error.message)
  return { ok: false, error: "No pude guardar. Inténtalo de nuevo en un rato." }
}

const Pedido = z.object({
  cuentaId: z.uuid("Elige una cuenta."),
  piezaId: z.uuid().nullable(),
  tema: z.string().refine(esTema, "Elige un diseño."),
  titulo: z
    .string()
    .trim()
    .min(1, "Falta el título del documento.")
    .max(100, "El título del documento pasa los 100 caracteres."),
  texto: z.string().trim().min(1, "Falta el texto del post.").max(3000, "El texto del post pasa los 3000 caracteres."),
  diseno: z.unknown(),
})

export async function pedirDiseno(db: Db, entrada: unknown): Promise<Resultado<{ pedidoId: string }>> {
  const leido = Pedido.safeParse(entrada)
  if (!leido.success) return { ok: false, error: leido.error.issues[0]?.message ?? "Revisa el carrusel." }
  const carrusel = revisarCarrusel(leido.data.diseno)
  if (!carrusel.ok) return carrusel
  const { data, error } = await db.rpc("pedir_diseno", {
    p_cuenta: leido.data.cuentaId,
    p_tema: leido.data.tema,
    p_titulo: leido.data.titulo,
    p_texto: leido.data.texto,
    p_diseno: carrusel.carrusel as unknown as Json,
    p_pieza: leido.data.piezaId ?? undefined,
  })
  return error ? falla(error) : { ok: true, pedidoId: data }
}
