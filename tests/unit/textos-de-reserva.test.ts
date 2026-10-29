import { describe, expect, test } from "vitest"
import { lineaEnReserva } from "@/lib/piezas/textos"

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
