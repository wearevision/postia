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
  /**
   * A Claude version whose automatic review has not landed yet. Its request is already done, so the page would offer
   * «Revisar con Claude» and pay a second review; it waits for the automatic one instead.
   */
  revisandoAuto: boolean
  /** A rewrite is open: the signature warns that signing now drops it. */
  reescribiendo: boolean
}

const MAXIMO_DE_REESCRITURAS = 3
// A write or rewrite plus its review fits in the task's 540 s; after this a missing review has failed.
const ESPERA_DE_REVISION_AUTO_MS = 5 * 60_000

export async function estadoDeRedaccion(
  db: Db,
  piezaId: string,
  versionId: string,
  ahora: number = Date.now(),
): Promise<EstadoDeRedaccion> {
  const [pedidos, revision, version] = await Promise.all([
    db
      .from("pedidos_de_texto")
      .select("tipo, estado, motivo")
      .eq("pieza_id", piezaId)
      .order("creado_en", { ascending: false }),
    db.from("revisiones_ia").select("veredicto").eq("version_id", versionId).maybeSingle(),
    db.from("versiones").select("origen, creada_en").eq("id", versionId).single(),
  ])
  if (pedidos.error) fallo("No pude leer los pedidos de la pieza", pedidos.error)
  if (revision.error) fallo("No pude leer la revisión de Claude", revision.error)
  if (version.error) fallo("No pude leer la versión de la pieza", version.error)
  const usadas = pedidos.data.filter(
    (p) => p.tipo === "reescribir" && ["pendiente", "trabajando", "hecho"].includes(p.estado),
  ).length
  const abiertos = pedidos.data.filter((p) => p.estado === "pendiente" || p.estado === "trabajando")
  const ultimo = pedidos.data[0]
  return {
    pedidoAbierto: abiertos.length > 0,
    reescriturasQuedan: Math.max(0, MAXIMO_DE_REESCRITURAS - usadas),
    revision: revision.data ? VeredictoGuardado.parse(revision.data.veredicto) : null,
    ultimoFallo: ultimo?.estado === "fallo" || ultimo?.estado === "obsoleto" ? ultimo.motivo : null,
    revisandoAuto:
      version.data.origen === "claude" &&
      !revision.data &&
      ahora - Date.parse(version.data.creada_en) < ESPERA_DE_REVISION_AUTO_MS,
    reescribiendo: abiertos.some((p) => p.tipo === "reescribir"),
  }
}
