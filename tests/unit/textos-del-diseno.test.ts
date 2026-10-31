import { describe, expect, test } from "vitest"
import { carruselInicial } from "@/lib/plantillas/iniciales"
import { textoDeLasLaminas, textosDelDiseno } from "@/lib/plantillas/texto"

describe("textosDelDiseno", () => {
  test("collects every string of any JSON value, nested in objects and arrays", () => {
    expect(
      textosDelDiseno({
        antetitulo: "Serie",
        laminas: [
          { tipo: "cifra", numero: "07", cifra: "40 %" },
          {
            tipo: "barras",
            barras: [
              { etiqueta: "Acme", valor: "80" },
              { etiqueta: "Beta", valor: 20 },
            ],
          },
        ],
        activo: true,
        nada: null,
      }),
    ).toEqual(["Serie", "cifra", "07", "40 %", "barras", "Acme", "80", "Beta"])
  })

  test("covers every word textoDeLasLaminas reads from a valid carousel", () => {
    const c = carruselInicial("wav")
    const todos = textosDelDiseno(c)
    for (const linea of textoDeLasLaminas(c).split("\n")) expect(todos).toContain(linea)
  })

  test("returns nothing for a value with no strings", () => {
    expect(textosDelDiseno(null)).toEqual([])
    expect(textosDelDiseno(42)).toEqual([])
    expect(textosDelDiseno(undefined)).toEqual([])
  })
})
