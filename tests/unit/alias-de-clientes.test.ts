import { describe, expect, test } from "vitest"
import { esPalabraComun, variantesDelNombre } from "@/lib/clientes/alias"

describe("variantesDelNombre", () => {
  test("offers the name without its legal suffix", () => {
    expect(variantesDelNombre("Copec S.A.")).toEqual(["Copec"])
    expect(variantesDelNombre("Indumotora SpA")).toEqual(["Indumotora"])
    expect(variantesDelNombre("Carey Ltda.")).toEqual(["Carey"])
  })

  test("offers «y» for «&» and the other way around", () => {
    expect(variantesDelNombre("JOHNSON & JOHNSON")).toEqual(["JOHNSON Y JOHNSON"])
    expect(variantesDelNombre("EDWARDS Y MATTE")).toEqual(["EDWARDS & MATTE"])
  })

  test("offers spaced and joined forms of hyphens, apostrophes and joined words", () => {
    expect(variantesDelNombre("Coca-Cola")).toEqual(["Coca Cola"])
    expect(variantesDelNombre("HENDRICK'S")).toEqual(["HENDRICKS"])
    expect(variantesDelNombre("LarrainVial")).toEqual(["Larrain Vial"])
  })

  test("offers nothing for a plain name", () => {
    expect(variantesDelNombre("COPEC")).toEqual([])
    expect(variantesDelNombre("ANGLOAMERICAN")).toEqual([])
  })
})

describe("esPalabraComun", () => {
  test("flags a one-word client that is also an ordinary word", () => {
    expect(esPalabraComun("CONTROL")).toBe(true)
    expect(esPalabraComun("Cristal")).toBe(true)
    expect(esPalabraComun("PARÍS")).toBe(true)
    expect(esPalabraComun(" lee ")).toBe(true)
  })

  test("leaves brand names and names of several words alone", () => {
    expect(esPalabraComun("COPEC")).toBe(false)
    expect(esPalabraComun("ROYAL GUARD")).toBe(false)
  })
})
