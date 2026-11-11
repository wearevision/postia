import { describe, expect, test } from "vitest"
import { puedeElegirDestino } from "@/lib/destino/puerta"

describe("where gate 1 offers the destination", () => {
  test("a text piece, when Claude is not rewriting or reviewing it", () => {
    expect(puedeElegirDestino({ porFirmar: true, formato: "texto", armando: false, redaccionLista: true })).toBe(true)
    expect(puedeElegirDestino({ porFirmar: true, formato: "texto", armando: false, redaccionLista: false })).toBe(false)
  })

  test("a carousel too (its caption carries the link), unless it is still being built", () => {
    expect(
      puedeElegirDestino({ porFirmar: true, formato: "carrusel_pdf", armando: false, redaccionLista: false }),
    ).toBe(true)
    expect(puedeElegirDestino({ porFirmar: true, formato: "carrusel_pdf", armando: true, redaccionLista: false })).toBe(
      false,
    )
  })

  test("never outside gate 1", () => {
    expect(puedeElegirDestino({ porFirmar: false, formato: "texto", armando: false, redaccionLista: true })).toBe(false)
  })
})
