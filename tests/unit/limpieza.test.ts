import { describe, expect, test } from "vitest"
import { archivosParaBorrar } from "@/lib/mantenimiento/limpieza"

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
