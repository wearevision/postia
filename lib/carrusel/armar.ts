import { createHash } from "node:crypto"
import { Falla } from "@/lib/dominio/falla"
import type { UrlDeFuente } from "@/lib/plantillas/estilos"
import { htmlDelCarrusel } from "@/lib/plantillas/html"
import { type Carrusel, revisarCarrusel } from "@/lib/plantillas/laminas"
import type { IdDeTema } from "@/lib/plantillas/temas"
import type { Render } from "./render"

// Trigger.dev only.

export interface PedidoDeDiseno {
  id: string
  marcaId: string
  cuentaId: string
  tema: IdDeTema
  titulo: string
  texto: string
  diseno: Carrusel
}

export interface PuertosDeArmado {
  tomar(): Promise<PedidoDeDiseno[]>
  /** HTML in, render out; the caller owns Chromium and the fonts. */
  renderizar(html: (fuente: UrlDeFuente) => string): Promise<Render>
  subir(ruta: string, datos: Uint8Array, tipo: "application/pdf" | "image/jpeg"): Promise<void>
  /** Null when an edit's piece moved on (the database closed the request as obsolete). */
  guardar(pedido: PedidoDeDiseno, ruta: string, sha256: string): Promise<{ piezaId: string; versionId: string } | null>
  terminar(pedidoId: string, estado: "fallo", motivo: string): Promise<void>
  /** `<marca>/<uuid>`, without extension. */
  nuevaRuta(marcaId: string): string
}

const GENERICO = "No pude armar el carrusel. Pídelo de nuevo en un rato."
const dosCifras = (n: number) => String(n).padStart(2, "0")

async function armarUno(p: PuertosDeArmado, pedido: PedidoDeDiseno): Promise<boolean> {
  const revisado = revisarCarrusel(pedido.diseno)
  if (!revisado.ok) throw new Falla(revisado.error)
  const render = await p.renderizar((fuente) => htmlDelCarrusel({ tema: pedido.tema, ...revisado.carrusel }, fuente))
  const base = p.nuevaRuta(pedido.marcaId)
  // Previews first: once the PDF is saved, gate 1 reads them by the PDF's path.
  for (const [i, vista] of render.vistas.entries())
    await p.subir(`${base}/${dosCifras(i + 1)}.jpg`, vista, "image/jpeg")
  await p.subir(`${base}.pdf`, render.pdf, "application/pdf")
  const sha = createHash("sha256").update(render.pdf).digest("hex")
  return (await p.guardar(pedido, `${base}.pdf`, sha)) !== null
}

/** One attempt per request; a failure closes it with a reason Federico can read. Unexpected errors rethrow at the end. */
export async function armarCarruseles(p: PuertosDeArmado): Promise<{ armados: number; fallidos: number }> {
  const pedidos = await p.tomar()
  const inesperados: unknown[] = []
  let armados = 0
  let fallidos = 0
  for (const pedido of pedidos) {
    try {
      if (await armarUno(p, pedido)) armados++
    } catch (error) {
      fallidos++
      if (!(error instanceof Falla)) {
        console.error(`Carrusel ${pedido.id} falló`, error instanceof Error ? error.message : String(error))
        inesperados.push(error)
      }
      try {
        await p.terminar(pedido.id, "fallo", error instanceof Falla ? error.message : GENERICO)
      } catch (alTerminar) {
        inesperados.push(alTerminar)
      }
    }
  }
  if (inesperados.length > 0) throw new AggregateError(inesperados, "Hubo carruseles con errores inesperados")
  return { armados, fallidos }
}
