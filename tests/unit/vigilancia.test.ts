// @vitest-environment node
import { createHash } from "node:crypto"
import type Anthropic from "@anthropic-ai/sdk"
import { describe, expect, test, vi } from "vitest"
import { Falla } from "@/lib/dominio/falla"
import { PasoYaPagado, TopeAlcanzado } from "@/lib/gasto/pagar"
import type { Pedir, RespuestaDeClaude } from "@/lib/ia/claude"
import type { Trabajo } from "@/lib/investigacion/investigar"
import {
  atenderInvestigaciones,
  type PuertosDeAtencionDeInvestigacion,
  type PuertosDeVigilancia,
  temasAVigilar,
  vigilar,
} from "@/lib/investigacion/vigilancia"

// Saturday 2026-10-31 22:00 in Santiago (UTC-3): already Sunday in UTC.
const AHORA = Date.UTC(2026, 10, 1, 1, 0)

const busqueda = (urls: string[]): RespuestaDeClaude => ({
  texto: "notas",
  detenido: "end_turn",
  bloques: [
    {
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
    } as Anthropic.ContentBlock,
  ],
})

const orden = (nombre: string, enlace: string): RespuestaDeClaude => ({
  texto: JSON.stringify({
    angulos: [
      { nombre, por_que: "x", hallazgos: [{ resumen: "r", cita: null, enlace, medio: "m", publicado_en: null }] },
    ],
  }),
  detenido: "end_turn",
  bloques: [],
})

/** The ledger key's topic part: the first 12 hex characters of the sha256 of the lowercased, trimmed topic. */
const h = (tema: string) => createHash("sha256").update(tema.trim().toLowerCase()).digest("hex").slice(0, 12)

const SUGERENCIAS = [{ tema: "Ferias", enriquece: "Cruza eventos con retail." }]

/** Each topic n searches https://n.cl/<n> and sorts it into the angle «Angulo <n>»; suggestions answer SUGERENCIAS. */
function pedirPorTema(): Pedir {
  return vi.fn<Pedir>(async (paso) => {
    if (paso.paso === "sugerir")
      return { texto: JSON.stringify({ sugerencias: SUGERENCIAS }), detenido: "end_turn", bloques: [] }
    const n = paso.clave.split(":")[2]
    return paso.paso === "buscar" ? busqueda([`https://n.cl/${n}`]) : orden(`Angulo ${n}`, `https://n.cl/${n}`)
  })
}

function puertosDeVigilancia(over: Partial<PuertosDeVigilancia> = {}): PuertosDeVigilancia {
  return {
    pedir: pedirPorTema(),
    embeber: vi.fn(async (_c: string, textos: string[]) => textos.map(() => new Array(1024).fill(0.1))),
    guardarHallazgo: vi.fn(async () => ({ estado: "guardado" as const, id: "h", tema: null })),
    cerrar: vi.fn(async () => {}),
    temasDeLasLineas: vi.fn(async () => ["Eventos\nRetail", "eventos"]),
    crearVigilancia: vi.fn(async () => "v1"),
    temasDelMapa: vi.fn(async () => ({
      activos: 3,
      temas: [
        { nombre: "A", descripcion: "a" },
        { nombre: "B", descripcion: "b" },
        { nombre: "C", descripcion: "c" },
      ],
    })),
    guardarSugerencias: vi.fn(async () => {}),
    ...over,
  }
}

describe("temasAVigilar", () => {
  test("splits by line, strips list markers, trims, drops empties and dedupes keeping the first spelling", () => {
    expect(
      temasAVigilar(["- Eventos\n• Retail\n\n  * Ferias  \n1. Marketing\n2) Música", "eventos\nRETAIL\nNuevos"]),
    ).toEqual(["Eventos", "Retail", "Ferias", "Marketing", "Música", "Nuevos"])
  })

  test("keeps at most 10", () => {
    expect(temasAVigilar([Array.from({ length: 14 }, (_, i) => `Tema ${i}`).join("\n")])).toHaveLength(10)
  })
})

describe("vigilar", () => {
  test("with no topics it creates nothing and pays nothing", async () => {
    const p = puertosDeVigilancia({ temasDeLasLineas: vi.fn(async () => ["", "  \n"]) })
    await vigilar(p, AHORA)
    expect(p.crearVigilancia).not.toHaveBeenCalled()
    expect(p.pedir).not.toHaveBeenCalled()
  })

  test("creates one watch, researches each topic under its day key from 14 days back, and closes once", async () => {
    const p = puertosDeVigilancia()
    const r = await vigilar(p, AHORA)
    expect(p.crearVigilancia).toHaveBeenCalledWith("2026-10-31", ["Eventos", "Retail"])
    const claves = vi.mocked(p.pedir).mock.calls.map(([paso]) => paso.clave)
    expect(claves).toEqual([
      `vigilar:2026-10-31:${h("Eventos")}:buscar:0`,
      `vigilar:2026-10-31:${h("Eventos")}:ordenar`,
      `vigilar:2026-10-31:${h("Retail")}:buscar:0`,
      `vigilar:2026-10-31:${h("Retail")}:ordenar`,
      "sugerir:2026-10-31",
    ])
    expect(JSON.stringify(vi.mocked(p.pedir).mock.calls[0][1].mensajes)).toContain("2026-10-17")
    expect(p.guardarHallazgo).toHaveBeenCalledWith(expect.objectContaining({ investigacionId: "v1" }))
    expect(p.cerrar).toHaveBeenCalledTimes(1)
    expect(p.cerrar).toHaveBeenCalledWith(
      "v1",
      [
        { nombre: `Angulo ${h("Eventos")}`, por_que: "x" },
        { nombre: `Angulo ${h("Retail")}`, por_que: "x" },
      ],
      { repetidos: 0, descartados: 0 },
    )
    expect(r).toMatchObject({ temas: 2, guardados: 2, fallidos: 0 })
  })

  test("keys each topic by its text, not its position, so editing the list the same day keeps the paid keys", async () => {
    const antes = puertosDeVigilancia({ temasDeLasLineas: vi.fn(async () => ["Eventos\nRetail"]) })
    await vigilar(antes, AHORA)
    const despues = puertosDeVigilancia({ temasDeLasLineas: vi.fn(async () => ["Ferias\nRETAIL "]) })
    await vigilar(despues, AHORA)
    const claves = (p: PuertosDeVigilancia) =>
      vi.mocked(p.pedir).mock.calls.flatMap(([paso]) => (paso.paso === "buscar" ? [paso.clave] : []))
    expect(claves(antes)[1]).toBe(claves(despues)[1])
    expect(claves(despues)[0]).toBe(`vigilar:2026-10-31:${h("Ferias")}:buscar:0`)
  })

  test("a re-run that finds every topic already paid still closes the watch, adding no angles", async () => {
    const pedir = vi.fn<Pedir>(async (paso) => {
      if (paso.paso === "sugerir")
        return { texto: JSON.stringify({ sugerencias: [] }), detenido: "end_turn", bloques: [] }
      throw new PasoYaPagado(paso.clave)
    })
    const p = puertosDeVigilancia({ pedir })
    const r = await vigilar(p, AHORA)
    expect(p.cerrar).toHaveBeenCalledWith("v1", [], { repetidos: 0, descartados: 0 })
    expect(r).toMatchObject({ temas: 2, guardados: 0, fallidos: 2 })
  })

  test("closes with the repeats and discarded sources of every topic added up", async () => {
    const pedir = vi.fn<Pedir>(async (paso) => {
      if (paso.paso === "sugerir")
        return { texto: JSON.stringify({ sugerencias: [] }), detenido: "end_turn", bloques: [] }
      const n = paso.clave.split(":")[2]
      if (paso.paso === "buscar") return busqueda([`https://n.cl/${n}`, `https://m.cl/${n}`])
      return {
        texto: JSON.stringify({
          angulos: [
            {
              nombre: `Angulo ${n}`,
              por_que: "x",
              hallazgos: [`https://n.cl/${n}`, `https://m.cl/${n}`, "https://inventado.cl"].map((enlace) => ({
                resumen: "r",
                cita: null,
                enlace,
                medio: "m",
                publicado_en: null,
              })),
            },
          ],
        }),
        detenido: "end_turn",
        bloques: [],
      }
    })
    const guardarHallazgo = vi
      .fn<PuertosDeVigilancia["guardarHallazgo"]>()
      .mockResolvedValueOnce({ estado: "repetido", de: "h0" })
      .mockResolvedValue({ estado: "guardado", id: "h", tema: null })
    const p = puertosDeVigilancia({ pedir, guardarHallazgo })
    await vigilar(p, AHORA)
    expect(p.cerrar).toHaveBeenCalledWith("v1", expect.any(Array), { repetidos: 1, descartados: 2 })
  })

  test("closes with each angle name once when two topics share it", async () => {
    const pedir = vi.fn<Pedir>(async (paso) => {
      if (paso.paso === "sugerir")
        return { texto: JSON.stringify({ sugerencias: [] }), detenido: "end_turn", bloques: [] }
      const n = paso.clave.split(":")[2]
      return paso.paso === "buscar" ? busqueda([`https://n.cl/${n}`]) : orden("Semana", `https://n.cl/${n}`)
    })
    const p = puertosDeVigilancia({ pedir })
    await vigilar(p, AHORA)
    expect(p.cerrar).toHaveBeenCalledWith("v1", [{ nombre: "Semana", por_que: "x" }], expect.anything())
  })

  test("a topic that fails expectedly is skipped; an unexpected error is rethrown after the rest ran and the watch closed", async () => {
    const base = pedirPorTema()
    const pedir = vi.fn<Pedir>(async (paso, pedido) => {
      if (paso.clave === `vigilar:2026-10-31:${h("Uno")}:buscar:0`)
        throw new Falla("Claude no quiso investigar este tema.")
      if (paso.clave === `vigilar:2026-10-31:${h("Dos")}:buscar:0`) throw new Error("red caída")
      if (paso.clave === `vigilar:2026-10-31:${h("Tres")}:buscar:0`) throw new TopeAlcanzado("global")
      return base(paso, pedido)
    })
    const p = puertosDeVigilancia({ pedir, temasDeLasLineas: vi.fn(async () => ["Uno\nDos\nTres\nCuatro"]) })
    await expect(vigilar(p, AHORA)).rejects.toBeInstanceOf(AggregateError)
    expect(p.guardarHallazgo).toHaveBeenCalledTimes(1)
    expect(p.cerrar).toHaveBeenCalledWith("v1", [{ nombre: `Angulo ${h("Cuatro")}`, por_que: "x" }], expect.anything())
    expect(p.guardarSugerencias).toHaveBeenCalled()
  })

  test("asks for suggestions once with the map's topics as data and saves them", async () => {
    const p = puertosDeVigilancia()
    await vigilar(p, AHORA)
    const [paso, pedido] = vi.mocked(p.pedir).mock.calls.at(-1) ?? []
    expect(paso).toEqual({ clave: "sugerir:2026-10-31", paso: "sugerir", marcaId: null })
    expect(pedido).toMatchObject({ modelo: "claude-sonnet-5-5", esfuerzo: "low", maxTokens: 2000 })
    expect(pedido?.herramientas).toBeUndefined()
    expect(JSON.stringify(pedido?.mensajes)).toContain("A")
    expect(p.guardarSugerencias).toHaveBeenCalledWith(SUGERENCIAS)
  })

  test("skips suggestions when the map has fewer than 3 active topics", async () => {
    const p = puertosDeVigilancia({
      temasDelMapa: vi.fn(async () => ({ activos: 2, temas: [{ nombre: "A", descripcion: "" }] })),
    })
    await vigilar(p, AHORA)
    expect(vi.mocked(p.pedir).mock.calls.map(([paso]) => paso.paso)).not.toContain("sugerir")
    expect(p.guardarSugerencias).not.toHaveBeenCalled()
  })

  test("a refused suggestion is logged, not saved and not an error", async () => {
    const base = pedirPorTema()
    const pedir = vi.fn<Pedir>(async (paso, pedido) =>
      paso.paso === "sugerir" ? { texto: "", detenido: "refusal", bloques: [] } : base(paso, pedido),
    )
    const p = puertosDeVigilancia({ pedir })
    await vigilar(p, AHORA)
    expect(p.guardarSugerencias).not.toHaveBeenCalled()
  })
})

const TRABAJO: Trabajo = {
  id: "j1",
  tipo: "investigar",
  investigacionId: "i1",
  angulo: null,
  tema: "WR3",
  cantidad: 3,
  formato: "texto",
  enfoque: null,
  origen: "encargo",
  ya: [],
}

function puertosDeAtencion(over: Partial<PuertosDeAtencionDeInvestigacion> = {}): PuertosDeAtencionDeInvestigacion {
  return {
    pedir: vi.fn<Pedir>(async (paso) =>
      paso.paso === "buscar" ? busqueda(["https://a.cl/1"]) : orden("Presupuesto", "https://a.cl/1"),
    ),
    embeber: vi.fn(async (_c: string, textos: string[]) => textos.map(() => new Array(1024).fill(0.1))),
    guardarHallazgo: vi.fn(async () => ({ estado: "guardado" as const, id: "h", tema: null })),
    cerrar: vi.fn(async () => {}),
    tomar: vi.fn(async () => TRABAJO),
    terminar: vi.fn(async () => {}),
    ...over,
  }
}

describe("atenderInvestigaciones", () => {
  test("with no job it does nothing", async () => {
    const p = puertosDeAtencion({ tomar: vi.fn(async () => null) })
    expect(await atenderInvestigaciones(p)).toBeNull()
    expect(p.pedir).not.toHaveBeenCalled()
  })

  test("takes one job, runs it and closes the job as done", async () => {
    const p = puertosDeAtencion()
    expect(await atenderInvestigaciones(p)).toMatchObject({ guardados: 1 })
    expect(p.cerrar).toHaveBeenCalledWith("i1", [{ nombre: "Presupuesto", por_que: "x" }], {
      repetidos: 0,
      descartados: 0,
    })
    expect(p.terminar).toHaveBeenCalledWith("j1", "hecho")
  })

  test("a Falla closes the job as failed with its message", async () => {
    const p = puertosDeAtencion({ pedir: vi.fn<Pedir>(async () => busqueda([])) })
    await atenderInvestigaciones(p)
    expect(p.terminar).toHaveBeenCalledWith(
      "j1",
      "fallo",
      "La búsqueda no encontró fuentes que pueda citar. Prueba con otro enfoque.",
    )
  })

  test("the spending cap and a step already paid close the job with their own reasons", async () => {
    const tope = puertosDeAtencion({ pedir: vi.fn<Pedir>(async () => Promise.reject(new TopeAlcanzado("global"))) })
    await atenderInvestigaciones(tope)
    expect(vi.mocked(tope.terminar).mock.calls[0][2]).toMatch(/tope de gasto/)
    const pagado = puertosDeAtencion({ pedir: vi.fn<Pedir>(async () => Promise.reject(new PasoYaPagado("k"))) })
    await atenderInvestigaciones(pagado)
    expect(vi.mocked(pagado.terminar).mock.calls[0][2]).toMatch(/ya se había empezado a pagar/)
  })

  test("an unexpected error closes the job with a generic reason and is rethrown", async () => {
    const p = puertosDeAtencion({ pedir: vi.fn<Pedir>(async () => Promise.reject(new Error("red caída"))) })
    await expect(atenderInvestigaciones(p)).rejects.toThrow("red caída")
    expect(p.terminar).toHaveBeenCalledWith(
      "j1",
      "fallo",
      "No pude terminar la investigación. Pídela de nuevo en un rato.",
    )
  })
})
