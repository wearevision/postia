import { describe, expect, test } from "vitest"
import { estadoDelFiltro, parametroDelFiltro } from "@/lib/series/filtro"

describe("estadoDelFiltro", () => {
  test("opens on the proposals to review when the address has no state", () => {
    expect(estadoDelFiltro(undefined)).toBe("propuesta")
  })

  test("falls back to the proposals to review when the state is not one we know", () => {
    expect(estadoDelFiltro("cualquiera")).toBe("propuesta")
  })

  test("reads «todas» as no filter at all", () => {
    expect(estadoDelFiltro("todas")).toBeNull()
  })

  test("reads the other states as themselves", () => {
    expect(estadoDelFiltro("aprobada")).toBe("aprobada")
    expect(estadoDelFiltro("descartada")).toBe("descartada")
    expect(estadoDelFiltro("propuesta")).toBe("propuesta")
  })
})

describe("parametroDelFiltro", () => {
  test("writes no filter as «todas», so the address says it out loud", () => {
    expect(parametroDelFiltro(null)).toBe("todas")
    expect(parametroDelFiltro("aprobada")).toBe("aprobada")
  })
})
