// @vitest-environment node
import type Anthropic from "@anthropic-ai/sdk"
import { describe, expect, test, vi } from "vitest"
import { Falla } from "@/lib/dominio/falla"
import type { Pedir, RespuestaDeClaude } from "@/lib/ia/claude"
import { investigarUno, type PuertosDeInvestigacion, type Trabajo } from "@/lib/investigacion/investigar"

function resultados(urls: string[]): Anthropic.ContentBlock {
  return {
    type: "web_search_tool_result",
    tool_use_id: "t",
    caller: { type: "direct" },
    content: urls.map((url) => ({
      type: "web_search_result",
      url,
      title: "t",
      page_age: null,
      encrypted_content: "x",
    })),
  } as Anthropic.ContentBlock
}

function usoDeBusqueda(): Anthropic.ContentBlock {
  return {
    type: "server_tool_use",
    id: "s",
    name: "web_search",
    input: { query: "q" },
    caller: { type: "direct" },
  } as Anthropic.ContentBlock
}

const busqueda = (urls: string[], usos = 1): RespuestaDeClaude => ({
  texto: "notas",
  detenido: "end_turn",
  bloques: [...Array.from({ length: usos }, usoDeBusqueda), resultados(urls)],
})

const orden = (enlaces: string[], nombre = "Presupuesto"): RespuestaDeClaude => ({
  texto: JSON.stringify({
    angulos: [
      {
        nombre,
        por_que: "x",
        hallazgos: enlaces.map((enlace) => ({ resumen: "r", cita: null, enlace, medio: "m", publicado_en: null })),
      },
    ],
  }),
  detenido: "end_turn",
  bloques: [],
})

const trabajo: Trabajo = {
  id: "j1",
  tipo: "investigar",
  investigacionId: "i1",
  angulo: null,
  tema: "WR3",
  cantidad: 6,
  formato: "carrusel_pdf",
  enfoque: null,
  origen: "encargo",
  ya: [],
}

function puertos(over: Partial<PuertosDeInvestigacion> = {}): PuertosDeInvestigacion {
  return {
    pedir: vi.fn<Pedir>(async (paso) =>
      paso.paso === "buscar"
        ? busqueda(["https://a.cl/1", "https://b.cl/2"])
        : orden(["https://a.cl/1", "https://inventado.cl"]),
    ),
    embeber: vi.fn(async (_clave: string, textos: string[]) => textos.map(() => new Array(1024).fill(0.1))),
    guardarHallazgo: vi.fn(async () => ({ estado: "guardado" as const, id: "h", tema: null })),
    cerrar: vi.fn(async () => {}),
    ...over,
  }
}

describe("investigarUno", () => {
  test("searches with a bounded tool, sorts, keeps only returned links, embeds and saves with the research and angle", async () => {
    const p = puertos()
    const r = await investigarUno(p, trabajo)
    const [pasoBusqueda, pedidoBusqueda] = vi.mocked(p.pedir).mock.calls[0]
    expect(pasoBusqueda).toEqual({ clave: "investigar:j1:buscar:0", paso: "buscar", marcaId: null })
    expect(pedidoBusqueda).toMatchObject({ modelo: "claude-opus-5-5", esfuerzo: "medium" })
    expect(pedidoBusqueda.herramientas?.[0]).toMatchObject({ type: "web_search_20260209", max_uses: 8 })
    const [pasoOrden, pedidoOrden] = vi.mocked(p.pedir).mock.calls[1]
    expect(pasoOrden).toEqual({ clave: "investigar:j1:ordenar", paso: "ordenar", marcaId: null })
    expect(pedidoOrden).toMatchObject({ modelo: "claude-sonnet-5-5", esfuerzo: "low" })
    expect(pedidoOrden.herramientas).toBeUndefined()
    expect(pedidoOrden.formato).toBeDefined()
    expect(p.embeber).toHaveBeenCalledWith("investigar:j1:vectores", ["r"])
    expect(p.guardarHallazgo).toHaveBeenCalledTimes(1)
    expect(p.guardarHallazgo).toHaveBeenCalledWith(
      expect.objectContaining({ enlace: "https://a.cl/1", investigacionId: "i1", angulo: "Presupuesto" }),
    )
    expect(p.cerrar).toHaveBeenCalledWith("i1", [{ nombre: "Presupuesto", por_que: "x" }], {
      repetidos: 0,
      descartados: 1,
    })
    expect(r).toEqual({
      guardados: 1,
      repetidos: 0,
      inventados: 1,
      linkedin: 0,
      angulos: [{ nombre: "Presupuesto", por_que: "x" }],
    })
  })

  test("caps an encargo at 8 searches", async () => {
    const p = puertos()
    await investigarUno(p, { ...trabajo, cantidad: 30 })
    expect(vi.mocked(p.pedir).mock.calls[0][1].herramientas?.[0]).toMatchObject({ max_uses: 8 })
  })

  test("an encargo for 2 pieces searches 6 times", async () => {
    const p = puertos()
    await investigarUno(p, { ...trabajo, cantidad: 2 })
    expect(vi.mocked(p.pedir).mock.calls[0][1].herramientas?.[0]).toMatchObject({ max_uses: 6 })
  })

  test("continues a paused search with the assistant turn, a new ledger key and the searches left, at most twice", async () => {
    const pausada = { ...busqueda(["https://a.cl/1"], 2), detenido: "pause_turn" as const }
    const pedir = vi
      .fn<Pedir>()
      .mockResolvedValueOnce(pausada)
      .mockResolvedValueOnce(pausada)
      .mockResolvedValueOnce(pausada)
      .mockResolvedValue(orden(["https://a.cl/1"]))
    const p = puertos({ pedir })
    await investigarUno(p, trabajo)
    expect(pedir.mock.calls.map((c) => c[0].clave)).toEqual([
      "investigar:j1:buscar:0",
      "investigar:j1:buscar:1",
      "investigar:j1:buscar:2",
      "investigar:j1:ordenar",
    ])
    expect(pedir.mock.calls[1][1].mensajes.at(-1)).toMatchObject({ role: "assistant" })
    expect(pedir.mock.calls.slice(0, 3).map((c) => c[1].herramientas?.[0])).toMatchObject([
      { max_uses: 8 },
      { max_uses: 6 },
      { max_uses: 4 },
    ])
  })

  test("a paused search with no searches left stops there and sorts what it gathered", async () => {
    const pausada = { ...busqueda(["https://a.cl/1"], 8), detenido: "pause_turn" as const }
    const p = puertos({
      pedir: vi.fn<Pedir>(async (paso) => (paso.paso === "ordenar" ? orden(["https://a.cl/1"]) : pausada)),
    })
    const r = await investigarUno(p, trabajo)
    expect(vi.mocked(p.pedir).mock.calls.map((c) => c[0].clave)).toEqual([
      "investigar:j1:buscar:0",
      "investigar:j1:ordenar",
    ])
    expect(r.guardados).toBe(1)
  })

  test("a refused search fails with a readable reason and pays nothing more", async () => {
    const p = puertos({ pedir: vi.fn<Pedir>(async () => ({ ...busqueda([]), detenido: "refusal" })) })
    await expect(investigarUno(p, trabajo)).rejects.toThrow(new Falla("Claude no quiso investigar este tema."))
    expect(p.pedir).toHaveBeenCalledTimes(1)
  })

  test("a search that found nothing usable fails the job with a readable reason, skips the sort and saves nothing", async () => {
    const p = puertos({
      pedir: vi.fn<Pedir>(async (paso) => (paso.paso === "buscar" ? busqueda([]) : orden([]))),
    })
    await expect(investigarUno(p, trabajo)).rejects.toThrow(
      new Falla("La búsqueda no encontró fuentes que pueda citar. Prueba con otro enfoque."),
    )
    expect(p.pedir).toHaveBeenCalledTimes(1)
    expect(p.guardarHallazgo).not.toHaveBeenCalled()
  })

  test("a sort whose every link was invented fails the same way, before embedding", async () => {
    const p = puertos({
      pedir: vi.fn<Pedir>(async (paso) =>
        paso.paso === "buscar" ? busqueda(["https://a.cl/1"]) : orden(["https://www.linkedin.com/posts/x"]),
      ),
    })
    await expect(investigarUno(p, trabajo)).rejects.toThrow(
      new Falla("La búsqueda no encontró fuentes que pueda citar. Prueba con otro enfoque."),
    )
    expect(p.embeber).not.toHaveBeenCalled()
  })

  test("an unreadable sort raises a Falla", async () => {
    const p = puertos({
      pedir: vi.fn<Pedir>(async (paso) =>
        paso.paso === "buscar" ? busqueda(["https://a.cl/1"]) : { texto: "{no", detenido: "end_turn", bloques: [] },
      ),
    })
    await expect(investigarUno(p, trabajo)).rejects.toBeInstanceOf(Falla)
  })

  test("a repeat is counted, not saved twice, and the count reaches the close", async () => {
    const p = puertos({
      pedir: vi.fn<Pedir>(async (paso) =>
        paso.paso === "buscar"
          ? busqueda(["https://a.cl/1", "https://b.cl/2"])
          : orden(["https://a.cl/1", "https://b.cl/2", "https://www.linkedin.com/posts/x", "https://inventado.cl"]),
      ),
      guardarHallazgo: vi
        .fn<PuertosDeInvestigacion["guardarHallazgo"]>()
        .mockResolvedValueOnce({ estado: "repetido", de: "h0" })
        .mockResolvedValue({ estado: "guardado", id: "h", tema: null }),
    })
    const r = await investigarUno(p, trabajo)
    expect(r).toMatchObject({ guardados: 1, repetidos: 1, inventados: 1, linkedin: 1 })
    expect(p.cerrar).toHaveBeenCalledWith("i1", expect.any(Array), { repetidos: 1, descartados: 2 })
  })

  test("a request whose every finding was already in the map fails instead of leaving an empty report", async () => {
    const p = puertos({ guardarHallazgo: vi.fn(async () => ({ estado: "repetido" as const, de: "h0" })) })
    await expect(investigarUno(p, trabajo)).rejects.toThrow(
      new Falla("Todo lo que encontró ya estaba en el mapa. Prueba con otro enfoque."),
    )
    expect(p.cerrar).not.toHaveBeenCalled()
  })

  test("an extension whose every finding was already in the map fails the same way", async () => {
    const p = puertos({ guardarHallazgo: vi.fn(async () => ({ estado: "repetido" as const, de: "h0" })) })
    await expect(investigarUno(p, { ...trabajo, tipo: "ampliar", angulo: "Presupuesto", ya: [] })).rejects.toThrow(
      "Todo lo que encontró ya estaba en el mapa. Prueba con otro enfoque.",
    )
    expect(p.cerrar).not.toHaveBeenCalled()
  })

  test("a watched topic whose every finding was a repeat is not an error", async () => {
    const p = puertos({ guardarHallazgo: vi.fn(async () => ({ estado: "repetido" as const, de: "h0" })) })
    const r = await investigarUno(
      p,
      { ...trabajo, origen: "vigilancia", cantidad: null, formato: null },
      {
        cerrar: false,
      },
    )
    expect(r).toMatchObject({ guardados: 0, repetidos: 1, angulos: [] })
  })

  test("an extension searches only its angle, with 4 searches, and saves under that angle", async () => {
    const p = puertos({
      pedir: vi.fn<Pedir>(async (paso) =>
        paso.paso === "buscar" ? busqueda(["https://a.cl/1"]) : orden(["https://a.cl/1"], "Otro nombre"),
      ),
    })
    await investigarUno(p, { ...trabajo, tipo: "ampliar", angulo: "Presupuesto", ya: ["https://a.cl/0"] })
    const pedido = vi.mocked(p.pedir).mock.calls[0][1]
    expect(pedido.herramientas?.[0]).toMatchObject({ max_uses: 4 })
    expect(JSON.stringify(pedido.mensajes)).toContain("https://a.cl/0")
    expect(p.guardarHallazgo).toHaveBeenCalledWith(expect.objectContaining({ angulo: "Presupuesto" }))
    expect(p.cerrar).toHaveBeenCalledWith("i1", [], { repetidos: 0, descartados: 0 })
  })

  test("a watched topic uses Sonnet, 3 searches, its own key, drops old findings and does not close", async () => {
    const p = puertos({
      pedir: vi.fn<Pedir>(async (paso) =>
        paso.paso === "buscar"
          ? busqueda(["https://a.cl/1", "https://b.cl/2"])
          : {
              ...orden([]),
              texto: JSON.stringify({
                angulos: [
                  {
                    nombre: "Semana",
                    por_que: "x",
                    hallazgos: [
                      {
                        resumen: "nuevo",
                        cita: null,
                        enlace: "https://a.cl/1",
                        medio: "m",
                        publicado_en: "2026-10-28",
                      },
                      {
                        resumen: "viejo",
                        cita: null,
                        enlace: "https://b.cl/2",
                        medio: "m",
                        publicado_en: "2026-09-01",
                      },
                    ],
                  },
                ],
              }),
            },
      ),
    })
    const r = await investigarUno(
      p,
      { ...trabajo, id: "v", origen: "vigilancia", cantidad: null, formato: null },
      { clave: "vigilar:2026-10-31:0", desde: "2026-10-17", cerrar: false },
    )
    const [paso, pedido] = vi.mocked(p.pedir).mock.calls[0]
    expect(paso.clave).toBe("vigilar:2026-10-31:0:buscar:0")
    expect(pedido).toMatchObject({ modelo: "claude-sonnet-5-5", esfuerzo: "low" })
    expect(pedido.herramientas?.[0]).toMatchObject({ max_uses: 3 })
    expect(JSON.stringify(pedido.mensajes)).toContain("2026-10-17")
    expect(p.embeber).toHaveBeenCalledWith("vigilar:2026-10-31:0:vectores", ["nuevo"])
    expect(p.cerrar).not.toHaveBeenCalled()
    expect(r.angulos).toEqual([{ nombre: "Semana", por_que: "x" }])
  })
})
