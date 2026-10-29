import { describe, expect, test } from "vitest"
import { revisarConexion } from "@/lib/avisos/conexiones"

const AHORA = Date.parse("2026-11-03T11:00:00Z") // 8:00 in Chile, when the watch runs
const DIA = 86_400_000
const en = (ms: number) => new Date(AHORA + ms).toISOString()
const base = { cuentas: ["Federico"], ultimaProgramada: null }

describe("revisarConexion", () => {
  test("an expired connection is urgent", () => {
    expect(revisarConexion({ ...base, expiraEn: en(-1000) }, AHORA)).toEqual({
      urgente: {
        titulo: "Conexión de LinkedIn · Federico",
        cuerpo: "La conexión de LinkedIn de Federico venció. Reconéctala en Marcas.",
        url: "/marcas",
      },
      lineas: [],
    })
  })

  test("less than a day left is urgent", () => {
    expect(revisarConexion({ ...base, expiraEn: en(10 * 3_600_000) }, AHORA).urgente?.cuerpo).toBe(
      "La conexión de LinkedIn de Federico vence en menos de un día. Reconéctala en Marcas.",
    )
  })

  test("14 and 3 days left queue a digest line; other days say nothing", () => {
    expect(revisarConexion({ ...base, expiraEn: en(14 * DIA) }, AHORA)).toEqual({
      urgente: null,
      lineas: [
        {
          titulo: "Conexión de LinkedIn · Federico",
          cuerpo: "La conexión de LinkedIn de Federico vence en 14 días. Reconéctala en Marcas.",
          url: "/marcas",
        },
      ],
    })
    expect(revisarConexion({ ...base, expiraEn: en(3 * DIA) }, AHORA).lineas).toHaveLength(1)
    expect(revisarConexion({ ...base, expiraEn: en(10 * DIA) }, AHORA)).toEqual({ urgente: null, lineas: [] })
  })

  test("a signed piece after the expiry is a line within the last 14 days, not before", () => {
    const expiraEn = en(10 * DIA)
    expect(revisarConexion({ ...base, expiraEn, ultimaProgramada: en(12 * DIA) }, AHORA).lineas[0]?.cuerpo).toBe(
      "Hay piezas de Federico programadas después del viernes 13 de noviembre, 08:00, cuando vence su conexión. Reconéctala en Marcas.",
    )
    expect(revisarConexion({ ...base, expiraEn: en(40 * DIA), ultimaProgramada: en(45 * DIA) }, AHORA).lineas).toEqual(
      [],
    )
  })

  test("names every account the connection serves", () => {
    const r = revisarConexion({ cuentas: ["Federico", "Otra"], ultimaProgramada: null, expiraEn: en(-1) }, AHORA)
    expect(r.urgente?.titulo).toBe("Conexión de LinkedIn · Federico y Otra")
  })
})
