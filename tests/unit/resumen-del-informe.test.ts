import { describe, expect, test } from "vitest"
import { resumenDelInforme, textoDelResumen } from "@/lib/investigacion/resumen"

const hallazgo = (estado: string) => ({ estado })

describe("resumenDelInforme", () => {
  test("counts the findings that are kept and the angles that still have one", () => {
    const resumen = resumenDelInforme([
      { hallazgos: [hallazgo("nuevo"), hallazgo("descartado")] },
      { hallazgos: [hallazgo("descartado")] },
      { hallazgos: [hallazgo("nuevo"), hallazgo("nuevo")] },
      { hallazgos: [] },
    ])
    expect(resumen).toEqual({ angulos: 2, hallazgos: 3 })
  })
})

describe("textoDelResumen", () => {
  test("pluralises angles and findings", () => {
    expect(textoDelResumen({ angulos: 3, hallazgos: 8 })).toBe("3 ángulos · 8 hallazgos para usar")
  })

  test("uses the singular for one", () => {
    expect(textoDelResumen({ angulos: 1, hallazgos: 1 })).toBe("1 ángulo · 1 hallazgo para usar")
  })
})
