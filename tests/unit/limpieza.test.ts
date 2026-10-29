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
  test("old notices are deleted even when the files step fails, and the failure still surfaces", async () => {
    const avisos = vi.fn(async () => {})
    await expect(
      mantenimientoNocturno({
        archivos: async () => {
          throw new Error("sin storage")
        },
        avisos,
      }),
    ).rejects.toThrow("sin storage")
    expect(avisos).toHaveBeenCalledTimes(1)
  })

  test("returns how many files were removed", async () => {
    expect(await mantenimientoNocturno({ archivos: async () => 3, avisos: async () => {} })).toEqual({ archivos: 3 })
  })
})
