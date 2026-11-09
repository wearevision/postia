import { describe, expect, test } from "vitest"
import {
  type DiaDeRendimiento,
  type FilaDePublico,
  MINIMO_PARA_CONCLUIR,
  marcar,
  mediana,
  muestraChica,
  porMes,
  publicoConCambios,
  tasa,
} from "@/lib/rendimiento/resumen"

function post(dia: number, interacciones: number | null, impresiones: number | null) {
  return { publicadaEl: `2026-01-${String(dia).padStart(2, "0")}`, interacciones, impresiones }
}

describe("tasa", () => {
  test("divides interactions by impressions", () => {
    expect(tasa({ interacciones: 18, impresiones: 900 })).toBeCloseTo(0.02)
  })
  test("is null when a figure is missing or impressions are zero", () => {
    expect(tasa({ interacciones: null, impresiones: 900 })).toBeNull()
    expect(tasa({ interacciones: 5, impresiones: null })).toBeNull()
    expect(tasa({ interacciones: 5, impresiones: 0 })).toBeNull()
  })
  test("is zero when there are impressions and no interactions", () => {
    expect(tasa({ interacciones: 0, impresiones: 100 })).toBe(0)
  })
})

describe("mediana", () => {
  test("is null for an empty list", () => {
    expect(mediana([])).toBeNull()
  })
  test("takes the middle value of an odd list", () => {
    expect(mediana([9, 1, 5])).toBe(5)
  })
  test("averages the two middle values of an even list", () => {
    expect(mediana([4, 1, 3, 10])).toBe(3.5)
  })
})

describe("marcar", () => {
  test("marks the 3 best and the 3 worst rates once there are 6 posts with a rate", () => {
    const posts = [1, 2, 3, 4, 5, 6, 7].map((n) => post(n, n, 100))
    const marcas = marcar(posts).map((p) => p.marca)
    expect(marcas).toEqual(["peor", "peor", "peor", null, "mejor", "mejor", "mejor"])
  })
  test("marks nobody with fewer than 6 posts with a rate", () => {
    const posts = [
      post(1, 1, 100),
      post(2, 2, 100),
      post(3, 3, 100),
      post(4, 4, 100),
      post(5, 5, 100),
      post(6, null, 100),
    ]
    expect(marcar(posts).every((p) => p.marca === null)).toBe(true)
  })
  test("never marks a post without a rate", () => {
    const posts = [1, 2, 3, 4, 5, 6].map((n) => post(n, n, 100))
    const sinTasa = post(20, null, null)
    const resultado = marcar([...posts, sinTasa])
    expect(resultado.at(-1)).toMatchObject({ tasa: null, marca: null })
  })
  test("marks every post tied at the edge of the top 3, so equal rates never get different marks", () => {
    const tasas = [10, 9, 8, 8, 5, 4, 3, 2]
    const marcas = marcar(tasas.map((t, n) => post(n + 1, t, 100))).map((p) => p.marca)
    expect(marcas).toEqual(["mejor", "mejor", "mejor", "mejor", null, "peor", "peor", "peor"])
  })
  test("marks nobody when every post ties, and nobody is both", () => {
    const iguales = [1, 2, 3, 4, 5, 6].map((n) => post(n, 10, 100))
    expect(marcar(iguales).every((p) => p.marca === null)).toBe(true)
  })
  test("marks the 3 widest-reaching posts apart from the rate, ties included", () => {
    const impresiones = [962, 337, 323, 299, 292, 50, 40]
    const alcance = marcar(impresiones.map((i, n) => post(n + 1, 1, i))).map((p) => p.masAlcance)
    expect(alcance).toEqual([true, true, true, false, false, false, false])
    const empatadas = marcar([500, 400, 300, 300, 10, 5].map((i, n) => post(n + 1, 1, i))).map((p) => p.masAlcance)
    expect(empatadas).toEqual([true, true, true, true, false, false])
  })
  test("keeps the input order and adds the rate", () => {
    const posts = [post(3, 4, 100), post(1, 2, 100)]
    expect(marcar(posts).map((p) => [p.publicadaEl, p.tasa])).toEqual([
      ["2026-01-03", 0.04],
      ["2026-01-01", 0.02],
    ])
  })
})

describe("muestraChica", () => {
  test("is true below the minimum posts with a rate and false from it", () => {
    expect(MINIMO_PARA_CONCLUIR).toBe(8)
    const siete = [1, 2, 3, 4, 5, 6, 7].map((n) => post(n, 1, 10))
    expect(muestraChica(siete)).toBe(true)
    expect(muestraChica([...siete, post(8, 1, 10)])).toBe(false)
  })
  test("does not count posts without a rate", () => {
    const ocho = [1, 2, 3, 4, 5, 6, 7].map((n) => post(n, 1, 10))
    expect(muestraChica([...ocho, post(8, null, null)])).toBe(true)
  })
})

describe("porMes", () => {
  const dia = (d: string, extra: Partial<DiaDeRendimiento> = {}): DiaDeRendimiento => ({
    dia: d,
    impresiones: null,
    interacciones: null,
    seguidoresNuevos: null,
    visitas: null,
    visitantesUnicos: null,
    ...extra,
  })
  test("sums each figure per month and sorts months ascending", () => {
    const meses = porMes([
      dia("2026-02-03", { impresiones: 5, interacciones: 1 }),
      dia("2026-01-30", { impresiones: 10, interacciones: 2, seguidoresNuevos: 1 }),
      dia("2026-01-31", { impresiones: 20, interacciones: 3, seguidoresNuevos: 2 }),
    ])
    expect(meses).toEqual([
      { mes: "2026-01", impresiones: 30, interacciones: 5, seguidoresNuevos: 3, visitas: null, visitantesUnicos: null },
      {
        mes: "2026-02",
        impresiones: 5,
        interacciones: 1,
        seguidoresNuevos: null,
        visitas: null,
        visitantesUnicos: null,
      },
    ])
  })
  test("keeps null for a figure that is null on every day, and treats a null day as zero when others have it", () => {
    const [mes] = porMes([dia("2026-01-01", { visitas: 4 }), dia("2026-01-02", { visitas: null, impresiones: 7 })])
    expect(mes).toMatchObject({ visitas: 4, impresiones: 7, interacciones: null })
  })
  test("is empty without days", () => {
    expect(porMes([])).toEqual([])
  })
})

describe("publicoConCambios", () => {
  const fila = (valor: string, extra: Partial<FilaDePublico> = {}): FilaDePublico => ({
    tipo: "publico",
    categoria: "Cargo",
    valor,
    porcentaje: null,
    menorAUno: false,
    cantidad: null,
    ...extra,
  })

  test("has no change information when there is no previous import", () => {
    const [primera] = publicoConCambios([fila("Gerente", { porcentaje: 10 })], null)
    expect(primera).toMatchObject({ valor: "Gerente", cambio: null })
  })
  test("marks new, rising, falling and equal values against the previous import", () => {
    const actual = [
      fila("A", { porcentaje: 10 }),
      fila("B", { porcentaje: 8 }),
      fila("C", { porcentaje: 6 }),
      fila("D", { porcentaje: 4 }),
    ]
    const anterior = [fila("A", { porcentaje: 7 }), fila("B", { porcentaje: 9 }), fila("C", { porcentaje: 6 })]
    expect(publicoConCambios(actual, anterior).map((f) => [f.valor, f.cambio])).toEqual([
      ["A", "sube"],
      ["B", "baja"],
      ["C", "igual"],
      ["D", "nuevo"],
    ])
  })
  test("keeps the top 5 per type and category, by percentage for the profile", () => {
    const actual = [10, 9, 8, 7, 6, 5, 4].map((p) => fila(`v${p}`, { porcentaje: p }))
    const otra = fila("Otra", { categoria: "Sector", porcentaje: 1 })
    const resultado = publicoConCambios([...actual, otra], null)
    expect(resultado.filter((f) => f.categoria === "Cargo").map((f) => f.valor)).toEqual([
      "v10",
      "v9",
      "v8",
      "v7",
      "v6",
    ])
    expect(resultado.filter((f) => f.categoria === "Sector")).toHaveLength(1)
  })
  test("sorts by count for the page and keeps types apart", () => {
    const actual = [
      fila("Pocos", { tipo: "seguidores", cantidad: 3 }),
      fila("Muchos", { tipo: "seguidores", cantidad: 30 }),
      fila("Visita", { tipo: "visitantes", cantidad: 5 }),
    ]
    const resultado = publicoConCambios(actual, null)
    expect(resultado.filter((f) => f.tipo === "seguidores").map((f) => f.valor)).toEqual(["Muchos", "Pocos"])
    expect(resultado.filter((f) => f.tipo === "visitantes")).toHaveLength(1)
  })
  test("sorts «less than 1 %» as 0.5", () => {
    const actual = [
      fila("Casi nada", { menorAUno: true }),
      fila("Uno", { porcentaje: 1 }),
      fila("Cero", { porcentaje: 0.1 }),
    ]
    expect(publicoConCambios(actual, null).map((f) => f.valor)).toEqual(["Uno", "Casi nada", "Cero"])
  })
  test("compares «less than 1 %» as 0.5 against the previous import", () => {
    const resultado = publicoConCambios([fila("X", { menorAUno: true })], [fila("X", { porcentaje: 2 })])
    expect(resultado[0]?.cambio).toBe("baja")
  })
})
