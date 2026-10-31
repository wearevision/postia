// @vitest-environment node
import { describe, expect, test, vi } from "vitest"
import { Falla } from "@/lib/dominio/falla"
import { PasoYaPagado, TopeAlcanzado } from "@/lib/gasto/pagar"
import type { Pedir } from "@/lib/ia/claude"
import { atenderPedidos, motivoDe, type PedidoDeTexto, type PuertosDeAtencion } from "@/lib/redaccion/atender"
import type { ContextoDeRedaccion } from "@/lib/redaccion/instrucciones"

const CONTEXTO: ContextoDeRedaccion = {
  marca: { id: "m1", nombre: "WAV", voz: "nosotros" },
  cuenta: { nombre: "Página", tipo: "empresa" },
  linea: {
    version: 3,
    secciones: { deQueHablamos: "", tono: "", formatos: "", temasVetados: "", temasAVigilar: "", ejemplos: "" },
    pilares: [],
  },
  noNombrar: [],
}
const VEREDICTO = { voz: { ok: true, comentario: "" }, hallazgos: [] }

const escribirPedido: PedidoDeTexto = {
  id: "p1",
  tipo: "escribir",
  marcaId: "m1",
  encargo: "Post",
  material: null,
  pilar: null,
  instruccion: null,
  piezaId: null,
  versionId: null,
}

function puertos(cambios: Partial<PuertosDeAtencion> = {}, pedir?: Pedir): PuertosDeAtencion {
  return {
    tomar: vi.fn(async () => [escribirPedido]),
    contexto: vi.fn(async () => CONTEXTO),
    base: vi.fn(async () => ({ texto: "Actual", vigente: true, revisada: false })),
    crearPieza: vi.fn(async () => ({ piezaId: "pz", versionId: "v1" })),
    nuevaVersion: vi.fn(async () => "v2"),
    guardarRevision: vi.fn(async () => {}),
    terminar: vi.fn(async () => {}),
    pedir:
      pedir ??
      vi.fn<Pedir>(async (paso) => ({
        texto: JSON.stringify(paso.paso === "revisar" ? VEREDICTO : { texto: "Nuevo", nota: "" }),
        detenido: "end_turn",
        bloques: [],
      })),
    ...cambios,
  }
}

describe("atenderPedidos", () => {
  test("a write creates the piece with the line version and reviews it under the version's auto key", async () => {
    const p = puertos()
    expect(await atenderPedidos(p)).toEqual({ atendidos: 1, fallidos: 0 })
    expect(p.crearPieza).toHaveBeenCalledWith(escribirPedido, "Nuevo", 3)
    expect(vi.mocked(p.pedir).mock.calls.map(([paso]) => paso.clave)).toEqual(["escribir:p1", "revisar:v1:auto"])
    expect(p.guardarRevision).toHaveBeenCalledWith("v1", VEREDICTO, null)
    expect(p.terminar).not.toHaveBeenCalled()
  })

  test("a failed review never loses the written piece", async () => {
    const pedir = vi.fn<Pedir>(async (paso) => {
      if (paso.paso === "revisar") throw new Error("se cayó")
      return { texto: JSON.stringify({ texto: "Nuevo", nota: "" }), detenido: "end_turn", bloques: [] }
    })
    const p = puertos({}, pedir)
    expect(await atenderPedidos(p)).toEqual({ atendidos: 1, fallidos: 0 })
    expect(p.crearPieza).toHaveBeenCalled()
    expect(p.terminar).not.toHaveBeenCalled()
  })

  test("a rewrite of a piece that moved on is obsolete and pays nothing", async () => {
    const reescritura: PedidoDeTexto = {
      ...escribirPedido,
      id: "p2",
      tipo: "reescribir",
      encargo: null,
      instruccion: "Corto",
      piezaId: "pz",
      versionId: "v1",
    }
    const p = puertos({
      tomar: vi.fn(async () => [reescritura]),
      base: vi.fn(async () => ({ texto: "x", vigente: false, revisada: false })),
    })
    await atenderPedidos(p)
    expect(p.pedir).not.toHaveBeenCalled()
    expect(p.terminar).toHaveBeenCalledWith(
      "p2",
      "obsoleto",
      "La pieza cambió antes de que Claude empezara; no se aplicó.",
    )
  })

  test("a rewrite becomes a new version and is reviewed", async () => {
    const reescritura: PedidoDeTexto = {
      ...escribirPedido,
      id: "p3",
      tipo: "reescribir",
      encargo: null,
      instruccion: "Corto",
      piezaId: "pz",
      versionId: "v1",
    }
    const p = puertos({ tomar: vi.fn(async () => [reescritura]) })
    await atenderPedidos(p)
    expect(p.nuevaVersion).toHaveBeenCalledWith(reescritura, "Nuevo", 3)
    expect(vi.mocked(p.pedir).mock.calls.map(([paso]) => paso.clave)).toEqual(["reescribir:p3", "revisar:v2:auto"])
  })

  test("a requested review is stored with its request", async () => {
    const revision: PedidoDeTexto = {
      ...escribirPedido,
      id: "p4",
      tipo: "revisar",
      encargo: null,
      piezaId: "pz",
      versionId: "v7",
    }
    const p = puertos({ tomar: vi.fn(async () => [revision]) })
    await atenderPedidos(p)
    expect(vi.mocked(p.pedir).mock.calls[0]?.[0].clave).toBe("revisar:v7:p4")
    expect(p.guardarRevision).toHaveBeenCalledWith("v7", VEREDICTO, "p4")
  })

  test("a requested review of a version that already has Claude's review is obsolete and pays nothing", async () => {
    const revision: PedidoDeTexto = {
      ...escribirPedido,
      id: "p6",
      tipo: "revisar",
      encargo: null,
      piezaId: "pz",
      versionId: "v7",
    }
    const p = puertos({
      tomar: vi.fn(async () => [revision]),
      base: vi.fn(async () => ({ texto: "Actual", vigente: true, revisada: true })),
    })
    expect(await atenderPedidos(p)).toEqual({ atendidos: 1, fallidos: 0 })
    expect(p.pedir).not.toHaveBeenCalled()
    expect(p.guardarRevision).not.toHaveBeenCalled()
    expect(p.terminar).toHaveBeenCalledWith("p6", "obsoleto", "Esta versión ya tenía revisión de Claude.")
  })

  test("a rewrite and a requested review carry the material of the request that wrote the piece", async () => {
    const reescritura: PedidoDeTexto = {
      ...escribirPedido,
      id: "p8",
      tipo: "reescribir",
      encargo: null,
      material: "Fuente original",
      instruccion: "Corto",
      piezaId: "pz",
      versionId: "v1",
    }
    const revision: PedidoDeTexto = { ...reescritura, id: "p9", tipo: "revisar", instruccion: null }
    const p = puertos({ tomar: vi.fn(async () => [reescritura, revision]) })
    await atenderPedidos(p)
    const mensajes = vi.mocked(p.pedir).mock.calls.map(([paso, pedido]) => [paso.clave, pedido.mensajes[0]?.content])
    expect(mensajes.map(([clave]) => clave)).toEqual(["reescribir:p8", "revisar:v2:auto", "revisar:v1:p9"])
    for (const [, contenido] of mensajes) expect(contenido).toContain("<material>\nFuente original\n</material>")
  })

  test("closes a failing request with its reason and keeps going; an unexpected error fails the run afterwards", async () => {
    const otro: PedidoDeTexto = { ...escribirPedido, id: "p5" }
    const p = puertos({
      tomar: vi.fn(async () => [escribirPedido, otro]),
      contexto: vi
        .fn<PuertosDeAtencion["contexto"]>()
        .mockRejectedValueOnce(new Error("db caída"))
        .mockResolvedValueOnce(CONTEXTO),
    })
    await expect(atenderPedidos(p)).rejects.toBeInstanceOf(AggregateError)
    expect(p.terminar).toHaveBeenCalledWith("p1", "fallo", "No pude terminar el pedido. Pídelo de nuevo en un rato.")
    expect(p.crearPieza).toHaveBeenCalledWith(otro, "Nuevo", 3)
  })
})

describe("motivoDe", () => {
  test("says why in words Federico can act on", () => {
    expect(motivoDe(new TopeAlcanzado("global"))).toBe(
      "Se alcanzó el tope de gasto del mes. Súbelo en Ajustes o escribe a mano.",
    )
    expect(motivoDe(new PasoYaPagado("k"))).toBe(
      "Este pedido ya se había empezado a pagar y no sé si terminó. Pídelo de nuevo.",
    )
    expect(motivoDe(new Falla("Claude no quiso."))).toBe("Claude no quiso.")
    expect(motivoDe(new Error("x"))).toBe("No pude terminar el pedido. Pídelo de nuevo en un rato.")
  })
})
