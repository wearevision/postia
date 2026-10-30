import { Falla } from "@/lib/dominio/falla"
import { PasoYaPagado, TopeAlcanzado } from "@/lib/gasto/pagar"
import type { Pedir } from "@/lib/ia/claude"
import type { ContextoDeRedaccion } from "./instrucciones"
import { escribir, reescribir, revisar, type VeredictoDeClaude } from "./redactar"

// Trigger.dev only (imports lib/ia through ./redactar).

export interface PedidoDeTexto {
  id: string
  tipo: "escribir" | "reescribir" | "revisar"
  marcaId: string
  encargo: string | null
  material: string | null
  /** The pillar's name, for the prompt. */
  pilar: string | null
  instruccion: string | null
  piezaId: string | null
  versionId: string | null
}

export interface PuertosDeAtencion {
  tomar(): Promise<PedidoDeTexto[]>
  contexto(pedido: PedidoDeTexto): Promise<ContextoDeRedaccion>
  /** The text of the version a rewrite or review starts from, and whether it is still the unsigned current one. */
  base(pedido: PedidoDeTexto): Promise<{ texto: string; vigente: boolean }>
  crearPieza(
    pedido: PedidoDeTexto,
    texto: string,
    lineaVersion: number,
  ): Promise<{ piezaId: string; versionId: string }>
  /** Null when the piece moved on while Claude wrote (the request is closed as obsolete by the database). */
  nuevaVersion(pedido: PedidoDeTexto, texto: string, lineaVersion: number): Promise<string | null>
  guardarRevision(versionId: string, veredicto: VeredictoDeClaude, pedidoId: string | null): Promise<void>
  terminar(pedidoId: string, estado: "fallo" | "obsoleto", motivo: string): Promise<void>
  pedir: Pedir
}

const GENERICO = "No pude terminar el pedido. Pídelo de nuevo en un rato."

export function motivoDe(error: unknown): string {
  if (error instanceof TopeAlcanzado) return "Se alcanzó el tope de gasto del mes. Súbelo en Ajustes o escribe a mano."
  if (error instanceof PasoYaPagado)
    return "Este pedido ya se había empezado a pagar y no sé si terminó. Pídelo de nuevo."
  if (error instanceof Falla) return error.message
  return GENERICO
}

const esperado = (error: unknown) =>
  error instanceof TopeAlcanzado || error instanceof PasoYaPagado || error instanceof Falla

/** The piece already exists: a failed review is logged and the page offers «Revisar con Claude». */
async function revisarSinPerder(
  p: PuertosDeAtencion,
  c: ContextoDeRedaccion,
  versionId: string,
  texto: string,
  material: string | null,
) {
  try {
    const veredicto = await revisar(p.pedir, c, { clave: `revisar:${versionId}:auto`, texto, material })
    await p.guardarRevision(versionId, veredicto, null)
  } catch (error) {
    console.error(`No pude revisar la versión ${versionId}`, error instanceof Error ? error.message : String(error))
  }
}

async function atenderUno(p: PuertosDeAtencion, pedido: PedidoDeTexto): Promise<void> {
  if (pedido.tipo === "escribir") {
    const c = await p.contexto(pedido)
    const escrito = await escribir(p.pedir, c, {
      clave: `escribir:${pedido.id}`,
      encargo: pedido.encargo ?? "",
      material: pedido.material,
      pilar: pedido.pilar,
    })
    const { versionId } = await p.crearPieza(pedido, escrito.texto, c.linea.version)
    await revisarSinPerder(p, c, versionId, escrito.texto, pedido.material)
    return
  }
  const base = await p.base(pedido)
  if (!base.vigente) {
    await p.terminar(pedido.id, "obsoleto", "La pieza cambió antes de que Claude empezara; no se aplicó.")
    return
  }
  const c = await p.contexto(pedido)
  if (pedido.tipo === "reescribir") {
    const escrito = await reescribir(p.pedir, c, {
      clave: `reescribir:${pedido.id}`,
      textoActual: base.texto,
      instruccion: pedido.instruccion ?? "",
    })
    const versionId = await p.nuevaVersion(pedido, escrito.texto, c.linea.version)
    if (versionId) await revisarSinPerder(p, c, versionId, escrito.texto, null)
    return
  }
  const versionId = pedido.versionId ?? ""
  const veredicto = await revisar(p.pedir, c, {
    clave: `revisar:${versionId}:${pedido.id}`,
    texto: base.texto,
    material: null,
  })
  await p.guardarRevision(versionId, veredicto, pedido.id)
}

/**
 * One attempt per request. A failure closes the request with a reason Federico can read; the others still run. Errors
 * nobody expected are rethrown together at the end so the Trigger.dev run shows as failed.
 */
export async function atenderPedidos(p: PuertosDeAtencion): Promise<{ atendidos: number; fallidos: number }> {
  const pedidos = await p.tomar()
  const inesperados: unknown[] = []
  let fallidos = 0
  for (const pedido of pedidos) {
    try {
      await atenderUno(p, pedido)
    } catch (error) {
      fallidos++
      if (!esperado(error)) {
        console.error(`Pedido ${pedido.id} falló`, error instanceof Error ? error.message : String(error))
        inesperados.push(error)
      }
      try {
        await p.terminar(pedido.id, "fallo", motivoDe(error))
      } catch (errorAlTerminar) {
        inesperados.push(errorAlTerminar)
      }
    }
  }
  if (inesperados.length > 0) throw new AggregateError(inesperados, "Hubo pedidos de texto con errores inesperados")
  return { atendidos: pedidos.length - fallidos, fallidos }
}
