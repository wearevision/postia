import { describe, expect, test } from "vitest"
import { revisarConexion } from "@/lib/avisos/conexiones"

const AHORA = Date.parse("2026-11-03T11:00:00Z") // 8:00 in Chile, when the watch runs
const DIA = 86_400_000
const en = (ms: number) => new Date(AHORA + ms).toISOString()
const base = { cuentas: ["Federico"], ultimaProgramada: null }
const DIA_Y_UNA_HORA = 1 + 1 / 24

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

  describe("a connection that renews itself", () => {
    const seRenueva = (diasDeAcceso: number, diasDeRenovacion: number | null) => ({
      ...base,
      cuentas: ["Página de WAV"],
      expiraEn: en(diasDeAcceso * DIA),
      renovacionExpiraEn: diasDeRenovacion === null ? null : en(diasDeRenovacion * DIA),
    })

    test("says nothing at 14 days of its access token: the daily refresh has not had its turn yet", () => {
      expect(revisarConexion(seRenueva(14, 300), AHORA)).toEqual({ urgente: null, lineas: [] })
    })

    test("an access token within 10 days despite a valid refresh token warns like any other: the refresh failed", () => {
      expect(revisarConexion(seRenueva(3, 300), AHORA).lineas.map((l) => l.cuerpo)).toEqual([
        "La conexión de LinkedIn de Página de WAV vence en 3 días. Reconéctala en Marcas.",
      ])
      const conPiezas = { ...seRenueva(DIA_Y_UNA_HORA, 300), ultimaProgramada: en(12 * DIA) }
      expect(revisarConexion(conPiezas, AHORA).lineas).toHaveLength(1)
    })

    test("a refused refresh forgets the refresh token, and the 14, 3 and 1 day marks come back", () => {
      expect(revisarConexion(seRenueva(14, null), AHORA).lineas.map((l) => l.cuerpo)).toEqual([
        "La conexión de LinkedIn de Página de WAV vence en 14 días. Reconéctala en Marcas.",
      ])
      expect(revisarConexion(seRenueva(3, null), AHORA).lineas).toHaveLength(1)
      const conPiezas = { ...seRenueva(DIA_Y_UNA_HORA, null), ultimaProgramada: en(12 * DIA) }
      expect(revisarConexion(conPiezas, AHORA).lineas).toHaveLength(1)
    })

    test("queues a line 14 days before its refresh token runs out", () => {
      expect(revisarConexion(seRenueva(12, 14), AHORA).lineas.map((l) => l.cuerpo)).toEqual([
        "La conexión de LinkedIn de Página de WAV deja de renovarse sola en 14 días. Reconéctala en Marcas.",
      ])
      expect(revisarConexion(seRenueva(12, 13), AHORA).lineas).toEqual([])
    })

    test("is still urgent when the renewal failed and the token is about to run out or ran out", () => {
      expect(revisarConexion(seRenueva(0.4, 300), AHORA).urgente?.cuerpo).toContain("menos de un día")
      expect(revisarConexion(seRenueva(-0.1, 300), AHORA).urgente?.cuerpo).toContain("venció")
    })

    test("a refresh token that ends before the access token is no renewal: the access token's marks apply", () => {
      expect(revisarConexion(seRenueva(14, 10), AHORA).lineas.map((l) => l.cuerpo)).toEqual([
        "La conexión de LinkedIn de Página de WAV vence en 14 días. Reconéctala en Marcas.",
      ])
    })
  })
})
