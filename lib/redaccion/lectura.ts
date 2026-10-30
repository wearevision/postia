import { z } from "zod"
import type { Db } from "@/lib/supabase/database"

// Worker-safe: no SDK. The verdict schema is repeated here on purpose, so the Worker never imports ./redactar.
const VeredictoGuardado = z.object({
  voz: z.object({ ok: z.boolean(), comentario: z.string() }),
  hallazgos: z.array(z.object({ tipo: z.string(), fragmento: z.string(), comentario: z.string() })),
})
export type VeredictoGuardado = z.infer<typeof VeredictoGuardado>

export type EstadoDePedido = "pendiente" | "trabajando" | "hecho" | "fallo" | "obsoleto"

export interface PedidoReciente {
  id: string
  cuenta: string
  encargo: string
  estado: EstadoDePedido
  motivo: string | null
  piezaId: string | null
  creadoEn: string
}

function fallo(accion: string, error: { message: string }): never {
  throw new Error(`${accion}: ${error.message}`, { cause: error })
}

const Estado = z.enum(["pendiente", "trabajando", "hecho", "fallo", "obsoleto"])

export async function pedidosRecientes(db: Db): Promise<PedidoReciente[]> {
  const { data, error } = await db
    .from("pedidos_de_texto")
    .select("id, encargo, estado, motivo, resultado_pieza_id, creado_en, cuentas(nombre)")
    .eq("tipo", "escribir")
    .order("creado_en", { ascending: false })
    .limit(20)
  if (error) fallo("No pude leer los pedidos de texto", error)
  return data.map((p) => ({
    id: p.id,
    cuenta: p.cuentas?.nombre ?? "",
    encargo: p.encargo ?? "",
    estado: Estado.parse(p.estado),
    motivo: p.motivo,
    piezaId: p.resultado_pieza_id,
    creadoEn: p.creado_en,
  }))
}

export interface EstadoDeRedaccion {
  pedidoAbierto: boolean
  reescriturasQuedan: number
  /** Claude's review of the version shown; null when it has none. */
  revision: VeredictoGuardado | null
  /** The reason of the latest request on the piece when it failed, so the page can say why. */
  ultimoFallo: string | null
}

const MAXIMO_DE_REESCRITURAS = 3

export async function estadoDeRedaccion(db: Db, piezaId: string, versionId: string): Promise<EstadoDeRedaccion> {
  const [pedidos, revision] = await Promise.all([
    db
      .from("pedidos_de_texto")
      .select("tipo, estado, motivo")
      .eq("pieza_id", piezaId)
      .order("creado_en", { ascending: false }),
    db.from("revisiones_ia").select("veredicto").eq("version_id", versionId).maybeSingle(),
  ])
  if (pedidos.error) fallo("No pude leer los pedidos de la pieza", pedidos.error)
  if (revision.error) fallo("No pude leer la revisión de Claude", revision.error)
  const usadas = pedidos.data.filter(
    (p) => p.tipo === "reescribir" && ["pendiente", "trabajando", "hecho"].includes(p.estado),
  ).length
  const ultimo = pedidos.data[0]
  return {
    pedidoAbierto: pedidos.data.some((p) => p.estado === "pendiente" || p.estado === "trabajando"),
    reescriturasQuedan: Math.max(0, MAXIMO_DE_REESCRITURAS - usadas),
    revision: revision.data ? VeredictoGuardado.parse(revision.data.veredicto) : null,
    ultimoFallo: ultimo?.estado === "fallo" || ultimo?.estado === "obsoleto" ? ultimo.motivo : null,
  }
}
