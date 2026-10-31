import { describe, expect, test } from "vitest"
import { leerEsqueleto, lineaDelPaso, textoDelEsqueleto } from "@/lib/series/esqueleto"

describe("textoDelEsqueleto", () => {
  test("a carousel's beats read «Tipo: idea», one per line; a post's are the bare idea", () => {
    expect(
      textoDelEsqueleto([
        { tipo: "portada", idea: "El mito" },
        { tipo: "punto", idea: "Lo que dicen los datos" },
        { tipo: "cierre", idea: "Qué hacer" },
      ]),
    ).toBe("Portada: El mito\nIdea: Lo que dicen los datos\nCierre: Qué hacer")
    expect(lineaDelPaso({ idea: "Un paso" })).toBe("Un paso")
  })
})

describe("leerEsqueleto", () => {
  test("reads a carousel back, with or without accents and in any case", () => {
    expect(leerEsqueleto("carrusel_pdf", "Portada: El mito\n\n  comparacion :  Antes y después \nCIERRE: Fin")).toEqual(
      {
        ok: true,
        esqueleto: [
          { tipo: "portada", idea: "El mito" },
          { tipo: "comparacion", idea: "Antes y después" },
          { tipo: "cierre", idea: "Fin" },
        ],
      },
    )
  })

  test("a carousel line without a slide type, or the wrong first or last slide, is refused with the line", () => {
    expect(leerEsqueleto("carrusel_pdf", "Portada: A\nSin tipo\nCierre: C")).toEqual({
      ok: false,
      error: "La línea 2 no dice qué lámina es (Portada, Idea, Lista, Comparación, Cifra, Barras, Frase o Cierre).",
    })
    expect(leerEsqueleto("carrusel_pdf", "Idea: A\nIdea: B\nCierre: C")).toEqual({
      ok: false,
      error: "El carrusel empieza con la Portada y termina con el Cierre.",
    })
    expect(leerEsqueleto("carrusel_pdf", "Portada: A\nCierre: C")).toEqual({
      ok: false,
      error: "El carrusel lleva de 3 a 10 láminas.",
    })
  })

  test("a post keeps each line whole, colons included, from 1 to 6 beats", () => {
    expect(leerEsqueleto("texto", "Dato: 3 de 4\nCierre con pregunta")).toEqual({
      ok: true,
      esqueleto: [{ idea: "Dato: 3 de 4" }, { idea: "Cierre con pregunta" }],
    })
    expect(leerEsqueleto("texto", "  \n ")).toEqual({ ok: false, error: "El post lleva de 1 a 6 pasos." })
    expect(leerEsqueleto("texto", "a\nb\nc\nd\ne\nf\ng")).toEqual({ ok: false, error: "El post lleva de 1 a 6 pasos." })
  })

  test("a beat longer than 400 characters is refused", () => {
    expect(leerEsqueleto("texto", "x".repeat(401))).toEqual({
      ok: false,
      error: "La línea 1 pasa los 400 caracteres.",
    })
  })
})
