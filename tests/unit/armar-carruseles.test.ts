import { describe, expect, test, vi } from "vitest"
import { armarCarruseles, type PedidoDeDiseno, type PuertosDeArmado } from "@/lib/carrusel/armar"
import { Falla } from "@/lib/dominio/falla"
import { carruselInicial } from "@/lib/plantillas/iniciales"

const RUTA = "m1/00000000-0000-0000-0000-000000000000"
const pedido: PedidoDeDiseno = {
  id: "p1",
  marcaId: "m1",
  cuentaId: "c1",
  tema: "wav-noche",
  titulo: "Doc",
  texto: "Post",
  diseno: carruselInicial("wav"),
}

function puertos(over: Partial<PuertosDeArmado> = {}): PuertosDeArmado {
  return {
    tomar: vi.fn(async () => [pedido]),
    renderizar: vi.fn(async () => ({
      pdf: new Uint8Array([37, 80, 68, 70, 45]),
      vistas: [new Uint8Array([1]), new Uint8Array([2])],
    })),
    subir: vi.fn(async () => {}),
    guardar: vi.fn(async () => ({ piezaId: "pz", versionId: "v" })),
    terminar: vi.fn(async () => {}),
    nuevaRuta: () => RUTA,
    ...over,
  }
}

describe("armarCarruseles", () => {
  test("renders, uploads the PDF and its numbered previews, then saves with the PDF's sha256", async () => {
    const p = puertos()
    expect(await armarCarruseles(p)).toEqual({ armados: 1, fallidos: 0 })
    expect(p.subir).toHaveBeenCalledWith(`${RUTA}.pdf`, expect.any(Uint8Array), "application/pdf")
    expect(p.subir).toHaveBeenCalledWith(`${RUTA}/01.jpg`, expect.any(Uint8Array), "image/jpeg")
    expect(p.subir).toHaveBeenCalledWith(`${RUTA}/02.jpg`, expect.any(Uint8Array), "image/jpeg")
    expect(p.guardar).toHaveBeenCalledWith(pedido, `${RUTA}.pdf`, expect.stringMatching(/^[0-9a-f]{64}$/))
  })

  test("renders the request's theme and slides into the HTML it hands the renderer", async () => {
    let html = ""
    const p = puertos({
      renderizar: vi.fn(async (armar: (fuente: (archivo: string) => string) => string) => {
        html = armar((archivo) => `data:font/woff2;base64,${archivo}`)
        return { pdf: new Uint8Array([1]), vistas: [] }
      }),
    })
    await armarCarruseles(p)
    expect(html).toContain(pedido.diseno.antetitulo)
    expect(html).toContain("data:font/woff2;base64,")
  })

  test("uploads the previews before the PDF is saved, so gate 1 never shows a piece without them", async () => {
    const orden: string[] = []
    const p = puertos({
      subir: vi.fn(async (ruta: string) => {
        orden.push(ruta)
      }),
      guardar: vi.fn(async () => {
        orden.push("guardar")
        return { piezaId: "pz", versionId: "v" }
      }),
    })
    await armarCarruseles(p)
    expect(orden.at(-1)).toBe("guardar")
  })

  test("handles a slide that does not fit when rendering by closing the request with its reason and uploading nothing", async () => {
    const p = puertos({
      renderizar: vi.fn(async () => {
        throw new Falla("La lámina 3 no cabe. Acórtala o divídela en dos.")
      }),
    })
    expect(await armarCarruseles(p)).toEqual({ armados: 0, fallidos: 1 })
    expect(p.subir).not.toHaveBeenCalled()
    expect(p.terminar).toHaveBeenCalledWith("p1", "fallo", "La lámina 3 no cabe. Acórtala o divídela en dos.")
  })

  test("re-checks the slides before rendering: a request that no longer passes the schema fails without Chromium", async () => {
    const malo = { ...pedido, diseno: { antetitulo: "x", laminas: [] } }
    const p = puertos({ tomar: vi.fn(async () => [malo as unknown as PedidoDeDiseno]) })
    await armarCarruseles(p)
    expect(p.renderizar).not.toHaveBeenCalled()
    expect(p.terminar).toHaveBeenCalledWith("p1", "fallo", "Un carrusel lleva de 3 a 10 láminas.")
  })

  test("closes the request generically and rethrows at the end when an unexpected error happens", async () => {
    const p = puertos({
      subir: vi.fn(async () => {
        throw new Error("storage down")
      }),
    })
    await expect(armarCarruseles(p)).rejects.toThrow("Hubo carruseles con errores inesperados")
    expect(p.terminar).toHaveBeenCalledWith("p1", "fallo", "No pude armar el carrusel. Pídelo de nuevo en un rato.")
  })

  test("does not count an obsolete edit as a failure", async () => {
    const p = puertos({ guardar: vi.fn(async () => null) })
    expect(await armarCarruseles(p)).toEqual({ armados: 0, fallidos: 0 })
    expect(p.terminar).not.toHaveBeenCalled()
  })

  test("never opens Chromium when there is nothing to do", async () => {
    const p = puertos({ tomar: vi.fn(async () => []) })
    expect(await armarCarruseles(p)).toEqual({ armados: 0, fallidos: 0 })
    expect(p.renderizar).not.toHaveBeenCalled()
  })
})
