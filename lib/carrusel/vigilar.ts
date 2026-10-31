import type { Db } from "@/lib/supabase/database"

// The cheap poller's side (Trigger.dev, service role). No Chromium here: vigilar-carruseles runs on the small machine
// every 2 minutes and only wakes armar-carruseles (medium machine) when there is something to render.

const TURNO_MS = 2 * 60_000

export interface PuertosDeVigilancia {
  abiertos(): Promise<number>
  /** Triggers armar-carruseles; the key dedupes polls of the same slot. */
  disparar(clave: string): Promise<void>
}

/** One key per 2-minute slot: two polls in the same slot trigger a single render run. */
export function claveDelTurno(ahora: Date): string {
  return `armar-carruseles-${Math.floor(ahora.getTime() / TURNO_MS)}`
}

export async function vigilarCarruseles(
  puertos: PuertosDeVigilancia,
  ahora: Date,
): Promise<{ abiertos: number; disparado: boolean }> {
  const abiertos = await puertos.abiertos()
  if (abiertos === 0) return { abiertos, disparado: false }
  await puertos.disparar(claveDelTurno(ahora))
  return { abiertos, disparado: true }
}

/** Same filter as tomar_pedidos_de_diseno: queued, or working with an expired lease (it may also close those). */
export async function contarPedidosAbiertos(db: Db): Promise<number> {
  const { count, error } = await db
    .from("pedidos_de_diseno")
    .select("id", { count: "exact", head: true })
    .or(`estado.eq.pendiente,and(estado.eq.trabajando,arrendado_hasta.lt.${new Date().toISOString()})`)
  if (error) throw new Error(`No pude contar los pedidos de diseño: ${error.message}`, { cause: error })
  return count ?? 0
}
