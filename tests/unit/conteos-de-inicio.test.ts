import { afterEach, describe, expect, test, vi } from "vitest"
import { leerConteos } from "@/lib/inicio/conteos"

afterEach(() => vi.restoreAllMocks())

describe("leerConteos", () => {
  test("counts both reports and ideas when both readers answer", async () => {
    const conteos = await leerConteos({ informes: async () => 2, ideas: async () => 5 })
    expect(conteos).toEqual({ informes: 2, ideas: 5 })
  })

  test("leaves out reports and keeps the idea count when the reports reader fails", async () => {
    const consola = vi.spyOn(console, "error").mockImplementation(() => {})
    const conteos = await leerConteos({
      informes: async () => {
        throw new Error("sin conexión")
      },
      ideas: async () => 5,
    })
    expect(conteos).toEqual({ informes: null, ideas: 5 })
    expect(consola).toHaveBeenCalledWith("No pude contar los informes por aprobar para Inicio", expect.any(Error))
  })

  test("leaves out ideas and keeps the report count when the ideas reader fails", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {})
    const conteos = await leerConteos({
      informes: async () => 2,
      ideas: async () => {
        throw new Error("sin conexión")
      },
    })
    expect(conteos).toEqual({ informes: 2, ideas: null })
  })
})
