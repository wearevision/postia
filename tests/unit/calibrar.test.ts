import { describe, expect, test, vi } from "vitest"
import { calibrar, PARES } from "@/lib/mapa/calibrar"

describe("calibrar", () => {
  test("does nothing and spends nothing without the typed confirmation", async () => {
    const embeber = vi.fn()
    expect(await calibrar({ confirmacion: "gastar" }, "run_1", embeber)).toEqual({ hecho: false })
    expect(embeber).not.toHaveBeenCalled()
  })

  test("embeds every distinct sentence once and reports the similarity of each labelled pair", async () => {
    const embeber = vi.fn(async (_paso: { clave: string; paso: string }, textos: string[]) =>
      textos.map((_, i) => (i % 2 === 0 ? [1, 0] : [0, 1])),
    )
    const r = await calibrar({ confirmacion: "GASTAR" }, "run_1", embeber)
    if (!r.hecho) throw new Error("se esperaba hecho")
    const [paso, textos] = embeber.mock.calls[0]
    expect(paso).toEqual({ clave: "probar-voyage:run_1", paso: "probar" })
    expect(new Set(textos).size).toBe(textos.length)
    expect(r.pares).toHaveLength(PARES.length)
    for (const par of r.pares) expect(["repetido", "mismo_tema", "vecino", "ajeno"]).toContain(par.etiqueta)
  })
})
