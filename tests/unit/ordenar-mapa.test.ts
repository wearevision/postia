import { describe, expect, test, vi } from "vitest"
import { TopeAlcanzado } from "@/lib/gasto/pagar"
import { ordenarMapa, type PuertosDelMapa } from "@/lib/mapa/ordenar"

const UMBRALES = { repetido: 0.95, tema: 0.8, fusion: 0.92, minimoParaTema: 2 }

function puertos(cambios: Partial<PuertosDelMapa> = {}): PuertosDelMapa {
  return {
    reubicar: vi.fn(async () => 0),
    pendientes: vi.fn(async () => []),
    crearTema: vi.fn(async () => "tema-nuevo"),
    casiIguales: vi.fn(async () => []),
    fusionar: vi.fn(async () => true),
    nombrar: vi.fn(async () => ({ nombre: "Nombre", descripcion: "D" })),
    ...cambios,
  }
}

const suelto = (id: string, vector: number[]) => ({ id, resumen: `resumen ${id}`, vector })

describe("ordenarMapa", () => {
  test("does nothing and spends nothing on an empty map", async () => {
    const p = puertos()
    expect(await ordenarMapa(p, "run", UMBRALES)).toEqual({
      reubicados: 0,
      temasNuevos: 0,
      sinNombre: 0,
      sinCrear: 0,
      fusionados: 0,
    })
    expect(p.nombrar).not.toHaveBeenCalled()
  })

  test("re-places first, then names and creates a topic per group with a run-scoped key", async () => {
    const orden: string[] = []
    const p = puertos({
      reubicar: vi.fn(async () => {
        orden.push("reubicar")
        return 2
      }),
      pendientes: vi.fn(async () => {
        orden.push("pendientes")
        return [suelto("a", [1, 0]), suelto("b", [1, 0.01]), suelto("x", [0, 1])]
      }),
    })
    const r = await ordenarMapa(p, "run_1", UMBRALES)
    expect(orden).toEqual(["reubicar", "pendientes"])
    expect(p.nombrar).toHaveBeenCalledWith("nombrar-tema:run_1:0", ["resumen a", "resumen b"])
    expect(p.crearTema).toHaveBeenCalledWith({ nombre: "Nombre", descripcion: "D" }, ["a", "b"], 2)
    expect(r).toMatchObject({ reubicados: 2, temasNuevos: 1 })
  })

  test("leaves a group loose when naming fails and goes on with the next", async () => {
    const nombrar = vi
      .fn()
      .mockRejectedValueOnce(new Error("Claude falló"))
      .mockResolvedValueOnce({ nombre: "Segundo", descripcion: "" })
    const p = puertos({
      nombrar,
      pendientes: vi.fn(async () => [
        suelto("a", [1, 0]),
        suelto("b", [1, 0]),
        suelto("c", [0, 1]),
        suelto("d", [0, 1]),
      ]),
    })
    const r = await ordenarMapa(p, "run", UMBRALES)
    expect(p.crearTema).toHaveBeenCalledTimes(1)
    expect(p.crearTema).toHaveBeenCalledWith({ nombre: "Segundo", descripcion: "" }, ["c", "d"], 2)
    expect(r).toMatchObject({ temasNuevos: 1, sinNombre: 1 })
  })

  test("counts a topic that could not be created and goes on with the next group and the merges", async () => {
    const crearTema = vi.fn().mockRejectedValueOnce(new Error("sin hallazgos sueltos")).mockResolvedValueOnce("t")
    const error = vi.spyOn(console, "error").mockImplementation(() => {})
    const p = puertos({
      crearTema,
      pendientes: vi.fn(async () => [
        suelto("a", [1, 0]),
        suelto("b", [1, 0]),
        suelto("c", [0, 1]),
        suelto("d", [0, 1]),
      ]),
      casiIguales: vi.fn(async () => [{ a: "t1", b: "t2", similitud: 0.95, hallazgos: { a: 3, b: 1 } }]),
    })
    const r = await ordenarMapa(p, "run", UMBRALES)
    expect(crearTema).toHaveBeenCalledTimes(2)
    expect(error).toHaveBeenCalledWith(expect.stringContaining("sin hallazgos sueltos"))
    expect(p.fusionar).toHaveBeenCalledWith("t2", "t1")
    expect(r).toMatchObject({ temasNuevos: 1, sinCrear: 1, fusionados: 1 })
    error.mockRestore()
  })

  test("stops naming when the spending cap is reached, and still merges", async () => {
    const p = puertos({
      nombrar: vi.fn(async () => {
        throw new TopeAlcanzado("global")
      }),
      pendientes: vi.fn(async () => [
        suelto("a", [1, 0]),
        suelto("b", [1, 0]),
        suelto("c", [0, 1]),
        suelto("d", [0, 1]),
      ]),
      casiIguales: vi.fn(async () => [{ a: "t1", b: "t2", similitud: 0.95, hallazgos: { a: 1, b: 3 } }]),
    })
    const r = await ordenarMapa(p, "run", UMBRALES)
    expect(p.nombrar).toHaveBeenCalledTimes(1)
    expect(p.fusionar).toHaveBeenCalledWith("t1", "t2")
    expect(r).toMatchObject({ temasNuevos: 0, sinNombre: 2, fusionados: 1 })
  })

  test("merges the smaller topic into the bigger one and follows a topic that already merged to its survivor", async () => {
    const p = puertos({
      casiIguales: vi.fn(async () => [
        { a: "t1", b: "t2", similitud: 0.97, hallazgos: { a: 5, b: 2 } },
        { a: "t2", b: "t3", similitud: 0.93, hallazgos: { a: 2, b: 2 } },
      ]),
    })
    const r = await ordenarMapa(p, "run", UMBRALES)
    expect(vi.mocked(p.fusionar).mock.calls).toEqual([
      ["t2", "t1"],
      ["t3", "t1"],
    ])
    expect(r.fusionados).toBe(2)
  })

  test("skips a pair whose two topics already ended in the same survivor", async () => {
    const p = puertos({
      casiIguales: vi.fn(async () => [
        { a: "t1", b: "t2", similitud: 0.97, hallazgos: { a: 5, b: 2 } },
        { a: "t1", b: "t3", similitud: 0.96, hallazgos: { a: 5, b: 1 } },
        { a: "t2", b: "t3", similitud: 0.95, hallazgos: { a: 2, b: 1 } },
      ]),
    })
    const r = await ordenarMapa(p, "run", UMBRALES)
    expect(vi.mocked(p.fusionar).mock.calls).toEqual([
      ["t2", "t1"],
      ["t3", "t1"],
    ])
    expect(r.fusionados).toBe(2)
  })

  test("sums sizes after a merge so the next pair compares current sizes", async () => {
    const p = puertos({
      casiIguales: vi.fn(async () => [
        { a: "t1", b: "t2", similitud: 0.97, hallazgos: { a: 3, b: 3 } },
        { a: "t2", b: "t3", similitud: 0.95, hallazgos: { a: 3, b: 4 } },
      ]),
    })
    await ordenarMapa(p, "run", UMBRALES)
    // Tie: the second goes into the first (t2 into t1, size 6). t3 (4) is smaller than t1 (6): t3 into t1.
    expect(vi.mocked(p.fusionar).mock.calls).toEqual([
      ["t2", "t1"],
      ["t3", "t1"],
    ])
  })
})
