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

  test("a signed piece after the expiry is a line only at the 14, 3 and 1 day marks", () => {
    const expiraEn = en(14 * DIA)
    const lineas = revisarConexion({ ...base, expiraEn, ultimaProgramada: en(16 * DIA) }, AHORA).lineas
    expect(lineas.map((l) => l.cuerpo)).toContain(
      "Hay piezas de Federico programadas después del martes 17 de noviembre, 08:00, cuando vence su conexión. Reconéctala en Marcas.",
    )
    expect(lineas).toHaveLength(2)
    expect(revisarConexion({ ...base, expiraEn: en(10 * DIA), ultimaProgramada: en(12 * DIA) }, AHORA).lineas).toEqual(
      [],
    )
    expect(revisarConexion({ ...base, expiraEn: en(2 * DIA), ultimaProgramada: en(12 * DIA) }, AHORA).lineas).toEqual(
      [],
    )
    expect(
      revisarConexion({ ...base, expiraEn: en(DIA + 3_600_000), ultimaProgramada: en(12 * DIA) }, AHORA).lineas,
    ).toHaveLength(1)
    expect(revisarConexion({ ...base, expiraEn: en(40 * DIA), ultimaProgramada: en(45 * DIA) }, AHORA).lineas).toEqual(
      [],
    )
  })

  test("names every account the connection serves", () => {
    const r = revisarConexion({ cuentas: ["Federico", "Otra"], ultimaProgramada: null, expiraEn: en(-1) }, AHORA)
    expect(r.urgente?.titulo).toBe("Conexión de LinkedIn · Federico y Otra")
  })

  test("days are Chile calendar days: the 14-day line fires once across the end of daylight saving", () => {
    // Chile leaves summer time on 2027-04-03; 08:00 on 2027-04-12 is 12:00Z, 14 days and 1 hour away in milliseconds.
    const ahora = Date.parse("2027-03-29T11:00:00Z")
    const expiraEn = "2027-04-12T12:00:00Z"
    expect(revisarConexion({ ...base, expiraEn }, ahora).lineas).toHaveLength(1)
    expect(revisarConexion({ ...base, expiraEn }, ahora + DIA).lineas).toEqual([])
  })

  test("the expired push is urgent only on the first day; after that it is a digest line", () => {
    expect(revisarConexion({ ...base, expiraEn: en(-DIA / 2) }, AHORA).urgente).not.toBeNull()
    const despues = revisarConexion({ ...base, expiraEn: en(-3 * DIA) }, AHORA)
    expect(despues.urgente).toBeNull()
    expect(despues.lineas[0]?.cuerpo).toBe("La conexión de LinkedIn de Federico venció. Reconéctala en Marcas.")
  })
})
