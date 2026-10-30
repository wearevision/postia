import { describe, expect, test } from "vitest"
import { carruselInicial } from "@/lib/plantillas/iniciales"
import { revisarCarrusel } from "@/lib/plantillas/laminas"
import { familiaDe, TEMAS, temasDeLaVoz } from "@/lib/plantillas/temas"

describe("themes", () => {
  test("there are Federico's 9 themes, in his order", () => {
    expect(Object.keys(TEMAS)).toEqual([
      "oscura",
      "papel",
      "magenta",
      "wav-noche",
      "wav-papel",
      "wav-degradado",
      "personal-claro",
      "personal-grafito",
      "personal-arena",
    ])
  })

  test("WAV's voice gets the WR3 and WAV families; Federico's gets the personal one", () => {
    expect(temasDeLaVoz("nosotros")).toEqual(["oscura", "papel", "magenta", "wav-noche", "wav-papel", "wav-degradado"])
    expect(temasDeLaVoz("yo")).toEqual(["personal-claro", "personal-grafito", "personal-arena"])
  })

  test("each theme's CSS is scoped to its own class", () => {
    for (const [id, tema] of Object.entries(TEMAS)) {
      if (id === "oscura") continue // the default lives in :root
      expect(tema.css).toContain(`.theme-${id}`)
    }
  })

  test("every family's default carousel passes the schema", () => {
    for (const familia of ["wr3", "wav", "personal"] as const) {
      const r = revisarCarrusel(carruselInicial(familia))
      expect(r.ok, r.ok ? "" : r.error).toBe(true)
    }
    expect(familiaDe("wav-papel")).toBe("wav")
  })

  test("the defaults close with the family's own call to action", () => {
    expect(carruselInicial("wav").laminas.at(-1)).toMatchObject({ titulo: "Conversemos", enlace: "wearevision.cl" })
    expect(carruselInicial("wr3").laminas.at(-1)).toMatchObject({ titulo: "Lee la guía completa" })
    expect(carruselInicial("personal").laminas.at(-1)).toMatchObject({ titulo: "Sígueme para más" })
  })
})
