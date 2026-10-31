import { describe, expect, test } from "vitest"
import { costoAproximado } from "@/lib/series/costo"

describe("costoAproximado", () => {
  test("adds a ceiling per piece by format", () => {
    expect(costoAproximado(["texto", "carrusel_pdf", "carrusel_pdf"])).toBe(150_000 + 2 * 250_000)
  })

  test("is zero for nothing to write", () => {
    expect(costoAproximado([])).toBe(0)
  })
})
