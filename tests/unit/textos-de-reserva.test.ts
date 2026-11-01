import { describe, expect, test } from "vitest"
import { lineaEnReserva, tituloDeCambios } from "@/lib/piezas/textos"

describe("tituloDeCambios", () => {
  test("a text piece Claude can correct or rewrite says so", () => {
    expect(tituloDeCambios({ redaccion: true, carrusel: false, pilar: true })).toBe("Corregir o pedir otra versión")
    expect(tituloDeCambios({ redaccion: true, carrusel: false, pilar: false })).toBe("Corregir o pedir otra versión")
  })

  test("an editable carousel names the carousel and, when it can change, the pillar", () => {
    expect(tituloDeCambios({ redaccion: false, carrusel: true, pilar: true })).toBe("Editar el carrusel o el pilar")
    expect(tituloDeCambios({ redaccion: false, carrusel: true, pilar: false })).toBe("Editar el carrusel")
  })

  test("names only the pillar when it is all that can change", () => {
    expect(tituloDeCambios({ redaccion: false, carrusel: false, pilar: true })).toBe("Cambiar el pilar")
  })
})

describe("lineaEnReserva", () => {
  test("an api account is published by the app", () => {
    expect(lineaEnReserva("api", "Federico")).toBe(
      "En reserva: la app le pone fecha y la publica cuando a Federico le falte una pieza firmada.",
    )
  })

  test("a by-hand account is only notified", () => {
    const texto = lineaEnReserva("a_mano", "Página de WAV")
    expect(texto).toBe(
      "En reserva: la app le pone fecha y te avisa para publicarla a mano cuando a Página de WAV le falte una pieza firmada.",
    )
    expect(texto).not.toContain("la publica")
  })
})
