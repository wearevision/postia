import { describe, expect, test } from "vitest"
import { mostrarChip } from "@/lib/gasto/chip"

describe("mostrarChip", () => {
  test.each(["/", "/ajustes"])("always on %s", (ruta) => {
    expect(mostrarChip(ruta, 1, 40)).toBe(true)
  })

  test("elsewhere only from 80 % of the cap", () => {
    expect(mostrarChip("/ideas", 31_999_999, 40_000_000)).toBe(false)
    expect(mostrarChip("/ideas", 32_000_000, 40_000_000)).toBe(true)
  })
})
