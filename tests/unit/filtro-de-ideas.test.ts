import { describe, expect, test } from "vitest"
import { estadoDelFiltro, parametroDelFiltro, sinNadaPorRevisar } from "@/lib/series/filtro"

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

describe("estadoDelFiltro with a series", () => {
  test("shows the whole series when it is picked and the address has no state", () => {
    expect(estadoDelFiltro(undefined, "serie-1")).toBeNull()
  })

  test("keeps an explicit state even inside a series", () => {
    expect(estadoDelFiltro("propuesta", "serie-1")).toBe("propuesta")
    expect(estadoDelFiltro("aprobada", "serie-1")).toBe("aprobada")
  })
})

describe("sinNadaPorRevisar", () => {
  const quieta = { trabajando: false, fallo: null }

  test("is true on «Por revisar» with series but no proposals and nothing in progress", () => {
    expect(sinNadaPorRevisar("propuesta", false, [quieta])).toBe(true)
  })

  test("is false when a series is still being built", () => {
    expect(sinNadaPorRevisar("propuesta", false, [quieta, { trabajando: true, fallo: null }])).toBe(false)
  })

  test("is false when a series failed, so its message stays visible", () => {
    expect(sinNadaPorRevisar("propuesta", false, [{ trabajando: false, fallo: "No salió" }])).toBe(false)
  })

  test("is false when there are proposals, other filters or no series at all", () => {
    expect(sinNadaPorRevisar("propuesta", true, [quieta])).toBe(false)
    expect(sinNadaPorRevisar("aprobada", false, [quieta])).toBe(false)
    expect(sinNadaPorRevisar("propuesta", false, [])).toBe(false)
  })
})

describe("parametroDelFiltro", () => {
  test("writes no filter as «todas», so the address says it out loud", () => {
    expect(parametroDelFiltro(null)).toBe("todas")
    expect(parametroDelFiltro("aprobada")).toBe("aprobada")
  })
})
