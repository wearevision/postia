import { z } from "zod"
import type { Db } from "@/lib/supabase/database"

export type EstadoDePedidoDeDiseno = "pendiente" | "trabajando" | "hecho" | "fallo" | "obsoleto"

export interface PedidoDeDisenoReciente {
  id: string
  cuenta: string
  estado: EstadoDePedidoDeDiseno
  motivo: string | null
  piezaId: string | null
  creadoEn: string
  titulo: string
}

const Estado = z.enum(["pendiente", "trabajando", "hecho", "fallo", "obsoleto"])
const ABIERTOS: readonly string[] = ["pendiente", "trabajando"]

function fallo(accion: string, error: { message: string }): never {
  throw new Error(`${accion}: ${error.message}`, { cause: error })
}

export async function pedidosDeDisenoRecientes(db: Db, limite = 10): Promise<PedidoDeDisenoReciente[]> {
  const { data, error } = await db
    .from("pedidos_de_diseno")
    .select("id, titulo, estado, motivo, resultado_pieza_id, creado_en, cuentas(nombre)")
    .order("creado_en", { ascending: false })
    .limit(limite)
  if (error) fallo("No pude leer los carruseles pedidos", error)
  return data.map((p) => ({
    id: p.id,
    cuenta: p.cuentas?.nombre ?? "",
    estado: Estado.parse(p.estado),
    motivo: p.motivo,
    piezaId: p.resultado_pieza_id,
    creadoEn: p.creado_en,
    titulo: p.titulo,
  }))
}

export interface DisenoDePieza {
  /** A render is queued or running: the page waits for it instead of offering the signature. */
  abierto: boolean
  /** Why the latest request did not apply, while no newer version replaced what it tried to change. */
  ultimoFallo: string | null
}

export async function disenoDePieza(db: Db, piezaId: string): Promise<DisenoDePieza> {
  const [pedidos, version] = await Promise.all([
    db
      .from("pedidos_de_diseno")
      .select("estado, motivo, creado_en")
      .eq("pieza_id", piezaId)
      .order("creado_en", { ascending: false }),
    db
      .from("versiones")
      .select("creada_en")
      .eq("pieza_id", piezaId)
      .order("numero", { ascending: false })
      .limit(1)
      .maybeSingle(),
  ])
  if (pedidos.error) fallo("No pude leer los carruseles de la pieza", pedidos.error)
  if (version.error) fallo("No pude leer la versión de la pieza", version.error)
  const ultimo = pedidos.data[0]
  const fallido =
    ultimo !== undefined &&
    (ultimo.estado === "fallo" || ultimo.estado === "obsoleto") &&
    (!version.data || Date.parse(ultimo.creado_en) > Date.parse(version.data.creada_en))
  return {
    abierto: pedidos.data.some((p) => ABIERTOS.includes(p.estado)),
    ultimoFallo: fallido ? ultimo.motivo : null,
  }
}
