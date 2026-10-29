import { describe, expect, test, vi } from "vitest"
import { archivosParaBorrar, limpiarCarpetas, mantenimientoNocturno } from "@/lib/mantenimiento/limpieza"

const AHORA = Date.parse("2026-11-03T06:00:00Z")
const HACE_HORAS = (h: number) => new Date(AHORA - h * 3_600_000).toISOString()

describe("archivosParaBorrar", () => {
  test("only files older than a day that no version references", () => {
    const objetos = [
      { ruta: "m/viejo-huerfano.pdf", creadoEn: HACE_HORAS(30) },
      { ruta: "m/viejo-usado.pdf", creadoEn: HACE_HORAS(30) },
      { ruta: "m/nuevo-huerfano.pdf", creadoEn: HACE_HORAS(2) },
      { ruta: "m/sin-fecha.pdf", creadoEn: null },
    ]
    expect(archivosParaBorrar(objetos, new Set(["m/viejo-usado.pdf"]), AHORA)).toEqual(["m/viejo-huerfano.pdf"])
  })
})

describe("limpiarCarpetas", () => {
  test("a failing folder is logged by message and the others are still cleaned", async () => {
    const registro = vi.spyOn(console, "error").mockImplementation(() => {})
    const limpiar = vi.fn(async (carpeta: string) => {
      if (carpeta === "b") throw new Error("sin storage")
      return 2
    })
    expect(await limpiarCarpetas(["a", "b", "c"], limpiar)).toBe(4)
    expect(limpiar).toHaveBeenCalledTimes(3)
    expect(registro).toHaveBeenCalledWith("No pude limpiar la carpeta b: sin storage")
    registro.mockRestore()
  })
})

describe("mantenimientoNocturno", () => {
  test("every step runs even when another fails, and the failure still surfaces", async () => {
    const registroDeError = vi.spyOn(console, "error").mockImplementation(() => {})
    const avisos = vi.fn(async () => {})
    const gastos = vi.fn(async () => 2)
    await expect(
      mantenimientoNocturno({
        archivos: async () => {
          throw new Error("sin storage")
        },
        avisos,
        gastos,
      }),
    ).rejects.toThrow("sin storage")
    expect(avisos).toHaveBeenCalledTimes(1)
    expect(gastos).toHaveBeenCalledTimes(1)
    registroDeError.mockRestore()
  })

  test("several failing steps are all logged by name, the successful count is logged, and all reasons surface", async () => {
    const registroDeError = vi.spyOn(console, "error").mockImplementation(() => {})
    const registro = vi.spyOn(console, "log").mockImplementation(() => {})
    const sinStorage = new Error("sin storage")
    const sinBase = new Error("sin base")
    const resultado = mantenimientoNocturno({
      archivos: async () => {
        throw sinStorage
      },
      avisos: async () => {},
      gastos: async () => {
        throw sinBase
      },
    })
    const error = await resultado.catch((e: unknown) => e)
    expect(error).toBeInstanceOf(AggregateError)
    expect(error instanceof AggregateError ? error.errors : []).toEqual([sinStorage, sinBase])
    expect(registroDeError).toHaveBeenCalledWith("Falló el paso nocturno «archivos»: sin storage")
    expect(registroDeError).toHaveBeenCalledWith("Falló el paso nocturno «gastos»: sin base")
    expect(registro).toHaveBeenCalledWith("Pasos nocturnos que sí terminaron: avisos")
    registroDeError.mockRestore()
    registro.mockRestore()
  })

  test("a single failure is logged and surfaces inside the aggregate, with the other counts logged", async () => {
    const registroDeError = vi.spyOn(console, "error").mockImplementation(() => {})
    const registro = vi.spyOn(console, "log").mockImplementation(() => {})
    const error = await mantenimientoNocturno({
      archivos: async () => 3,
      avisos: async () => {
        throw new Error("sin push")
      },
      gastos: async () => 2,
    }).catch((e: unknown) => e)
    expect(error instanceof AggregateError ? error.errors.map((e: Error) => e.message) : []).toEqual(["sin push"])
    expect(registroDeError).toHaveBeenCalledWith("Falló el paso nocturno «avisos»: sin push")
    expect(registro).toHaveBeenCalledWith("Pasos nocturnos que sí terminaron: archivos=3, gastos=2")
    registroDeError.mockRestore()
    registro.mockRestore()
  })

  test("returns how many files were removed and how many reservations expired", async () => {
    expect(
      await mantenimientoNocturno({ archivos: async () => 3, avisos: async () => {}, gastos: async () => 2 }),
    ).toEqual({ archivos: 3, gastosVencidos: 2 })
  })
})
