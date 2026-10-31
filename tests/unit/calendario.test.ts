import { describe, expect, test } from "vitest"
import {
  cuadriculaDelMes,
  diasDeLaSemana,
  huecosDeLaSemana,
  leerVista,
  limitesDelMes,
  semanaDe,
} from "@/lib/piezas/calendario"

describe("semanaDe", () => {
  test("a Wednesday belongs to the week starting Monday at 00:00 Chile time", () => {
    expect(semanaDe(Date.parse("2026-10-28T13:00:00Z"))).toEqual({
      lunes: "2026-10-26",
      desde: "2026-10-26T03:00:00.000Z",
      hasta: "2026-11-02T03:00:00.000Z",
    })
  })
  test("Sunday 23:30 in Chile is still the same week, even though it is Monday in UTC", () => {
    expect(semanaDe(Date.parse("2026-11-02T02:30:00Z")).lunes).toBe("2026-10-26")
  })
  test("a week that crosses the end of summer time ends at the winter offset", () => {
    // Chile leaves summer time the night of Saturday 3 April 2027.
    expect(semanaDe(Date.parse("2027-04-01T15:00:00Z"))).toEqual({
      lunes: "2027-03-29",
      desde: "2027-03-29T03:00:00.000Z",
      hasta: "2027-04-05T04:00:00.000Z",
    })
  })
})

describe("diasDeLaSemana", () => {
  test("Monday to Sunday, across a month", () => {
    expect(diasDeLaSemana("2026-10-26")).toEqual([
      "2026-10-26",
      "2026-10-27",
      "2026-10-28",
      "2026-10-29",
      "2026-10-30",
      "2026-10-31",
      "2026-11-01",
    ])
  })
})

describe("huecosDeLaSemana", () => {
  test("counts planned and signed pieces against the rhythm; the reserve and discarded pieces do not fill it", () => {
    const cuentas = [
      { id: "perfil", ritmoSemanal: 3 },
      { id: "pagina", ritmoSemanal: 3 },
    ]
    const piezas = [
      { cuentaId: "perfil", estado: "programada" as const },
      { cuentaId: "perfil", estado: "por_aprobar" as const },
      { cuentaId: "perfil", estado: "descartada" as const },
      { cuentaId: "pagina", estado: "publicada" as const },
      { cuentaId: "pagina", estado: "a_mano" as const },
      { cuentaId: "pagina", estado: "programada" as const },
      { cuentaId: "pagina", estado: "programada" as const },
    ]
    expect(huecosDeLaSemana(cuentas, piezas)).toEqual({ perfil: 1, pagina: 0 })
  })

  test("an idea planned for the account but not yet written fills its slot too", () => {
    const cuentas = [{ id: "perfil", ritmoSemanal: 3 }]
    const piezas = [{ cuentaId: "perfil", estado: "programada" as const }]
    const asignaciones = [{ cuentaId: "perfil" }, { cuentaId: "otra" }]
    expect(huecosDeLaSemana(cuentas, piezas, asignaciones)).toEqual({ perfil: 1 })
  })
})

describe("cuadriculaDelMes", () => {
  test("November 2026 starts on a Sunday and ends on a Monday: six rows, Monday first", () => {
    const filas = cuadriculaDelMes("2026-11")
    expect(filas).toHaveLength(6)
    expect(filas[0]).toEqual([null, null, null, null, null, null, "2026-11-01"])
    expect(filas[5]).toEqual(["2026-11-30", null, null, null, null, null, null])
    expect(filas.flat().filter((d) => d !== null)).toHaveLength(30)
  })
  test("its bounds are the first of the month and the first of the next, Chile time", () => {
    expect(limitesDelMes("2026-12")).toEqual({ desde: "2026-12-01T03:00:00.000Z", hasta: "2027-01-01T03:00:00.000Z" })
  })
})

describe("leerVista", () => {
  const AHORA = Date.parse("2026-10-28T13:00:00Z")
  test("defaults to this week", () => {
    expect(leerVista({}, AHORA)).toMatchObject({ vista: "semana", semana: { lunes: "2026-10-26" } })
  })
  test("any day of a week opens that week", () => {
    expect(leerVista({ semana: "2026-11-05" }, AHORA)).toMatchObject({
      vista: "semana",
      semana: { lunes: "2026-11-02" },
    })
  })
  test("the month view, and garbage falling back to the present", () => {
    expect(leerVista({ vista: "mes", mes: "2026-12" }, AHORA)).toEqual({ vista: "mes", mes: "2026-12" })
    expect(leerVista({ vista: "mes", mes: "diciembre" }, AHORA)).toEqual({ vista: "mes", mes: "2026-10" })
    expect(leerVista({ semana: "2026-13-45" }, AHORA)).toMatchObject({
      vista: "semana",
      semana: { lunes: "2026-10-26" },
    })
  })

  test("years outside 2000 to 2100 fall back to the present instead of failing", () => {
    expect(leerVista({ semana: "9999-12-31" }, AHORA)).toMatchObject({
      vista: "semana",
      semana: { lunes: "2026-10-26" },
    })
    expect(leerVista({ vista: "mes", mes: "9999-12" }, AHORA)).toEqual({ vista: "mes", mes: "2026-10" })
    expect(leerVista({ semana: "0099-06-01" }, AHORA)).toMatchObject({
      vista: "semana",
      semana: { lunes: "2026-10-26" },
    })
  })
  test("the last accepted month still has neighbours to compute", () => {
    expect(leerVista({ vista: "mes", mes: "2100-12" }, AHORA)).toEqual({ vista: "mes", mes: "2100-12" })
    expect(limitesDelMes("2100-12").hasta).toBe("2101-01-01T03:00:00.000Z")
  })
})
