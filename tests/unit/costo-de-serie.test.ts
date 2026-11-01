import { describe, expect, test } from "vitest"
import { estimarCosto } from "@/lib/gasto/precios"
import { costoAproximado, estimarSerie, MAX_TOKENS_DE_SERIE, MODELO_DE_SERIE } from "@/lib/series/costo"

describe("costoAproximado", () => {
  test("adds a ceiling per piece by format", () => {
    expect(costoAproximado(["texto", "carrusel_pdf", "carrusel_pdf"])).toBe(150_000 + 2 * 250_000)
  })

  test("is zero for nothing to write", () => {
    expect(costoAproximado([])).toBe(0)
  })
})

describe("estimarSerie", () => {
  test("stays above the Claude call that proposes the series: the whole max_tokens plus the report and a fixed system prompt", () => {
    const claude = estimarCosto(MODELO_DE_SERIE, {
      caracteresDeEntrada: 10_000,
      maxTokens: MAX_TOKENS_DE_SERIE,
      busquedas: 0,
    })
    expect(estimarSerie({ caracteresDelInforme: 10_000, cantidad: 5 })).toBeGreaterThan(claude)
  })

  test("grows with the size of the report", () => {
    expect(estimarSerie({ caracteresDelInforme: 40_000, cantidad: 5 })).toBeGreaterThan(
      estimarSerie({ caracteresDelInforme: 4_000, cantidad: 5 }),
    )
  })

  test("is a whole number of cents, so it reads as a clean dollar amount", () => {
    expect(estimarSerie({ caracteresDelInforme: 12_345, cantidad: 7 }) % 10_000).toBe(0)
  })

  test("a typical report costs less than a dollar", () => {
    expect(estimarSerie({ caracteresDelInforme: 15_000, cantidad: 10 })).toBeLessThan(1_000_000)
  })
})
