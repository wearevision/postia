import { describe, expect, test } from "vitest"
import { agrupar } from "@/lib/mapa/agrupar"

const h = (id: string, vector: number[]) => ({ id, vector })
const cerca = (x: number) => [1, x]

describe("agrupar", () => {
  test("forms groups of at least the minimum around each seed, in order, using each finding once", () => {
    const sueltos = [h("a", cerca(0)), h("x", [0, 1]), h("b", cerca(0.1)), h("c", cerca(0.2)), h("d", cerca(0.05))]
    expect(agrupar(sueltos, { umbral: 0.95, minimo: 3, maximo: 5 })).toEqual([["a", "b", "c", "d"]])
  })

  test("drops a seed whose group stays under the minimum, so its findings can join a later seed", () => {
    const sueltos = [h("solo", [0, 1]), h("a", cerca(0)), h("b", cerca(0.1)), h("c", cerca(0.2))]
    expect(agrupar(sueltos, { umbral: 0.95, minimo: 3, maximo: 5 })).toEqual([["a", "b", "c"]])
  })

  test("stops at the maximum number of groups", () => {
    const sueltos = [
      ...["a1", "a2", "a3"].map((id) => h(id, [1, 0, 0])),
      ...["b1", "b2", "b3"].map((id) => h(id, [0, 1, 0])),
    ]
    expect(agrupar(sueltos, { umbral: 0.95, minimo: 3, maximo: 1 })).toEqual([["a1", "a2", "a3"]])
  })
})
