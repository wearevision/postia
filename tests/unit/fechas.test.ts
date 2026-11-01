import { describe, expect, test } from "vitest"
import { avisoDeChoque, fechaDeFila, fechaLarga, instanteDesdeValorLocal, valorLocal } from "@/lib/piezas/fechas"

describe("fechas de Chile", () => {
  test("formats an instant as Chile wall time with the weekday and no am/pm", () => {
    expect(fechaLarga("2026-11-03T14:00:00.000Z")).toBe("martes 3 de noviembre, 11:00")
  })

  test("fechaDeFila is weekday, day and time on one line, in Chile time", () => {
    expect(fechaDeFila("2026-11-03T14:00:00.000Z")).toBe("mar 3 · 11:00")
    expect(fechaDeFila("2026-11-05T18:00:00.000Z")).toBe("jue 5 · 15:00")
  })

  test("round-trips a datetime-local value in summer time (UTC-3)", () => {
    expect(instanteDesdeValorLocal("2026-11-03T11:00")).toBe("2026-11-03T14:00:00.000Z")
    expect(valorLocal("2026-11-03T14:00:00.000Z")).toBe("2026-11-03T11:00")
  })

  test("round-trips a datetime-local value in winter time (UTC-4)", () => {
    expect(instanteDesdeValorLocal("2026-07-07T11:00")).toBe("2026-07-07T15:00:00.000Z")
    expect(valorLocal("2026-07-07T15:00:00.000Z")).toBe("2026-07-07T11:00")
  })

  test("returns null for an incomplete value", () => {
    expect(instanteDesdeValorLocal("")).toBeNull()
  })
})

describe("another piece on the chosen day", () => {
  // Tuesday 3 November 2026: 11:00 in Chile is 14:00 UTC.
  const ONCE = "2026-11-03T14:00:00.000Z"
  const QUINCE = "2026-11-03T18:00:00.000Z"

  test("says nothing when the day is free", () => {
    expect(avisoDeChoque("2026-11-04T11:00", [ONCE])).toBeNull()
  })

  test("lets the day be chosen and says when the other one goes out", () => {
    expect(avisoDeChoque("2026-11-03T18:30", [ONCE])).toBe(
      "Ese día ya sale otra publicación de esta cuenta a las 11:00.",
    )
  })

  test("names every time already taken that day, in order", () => {
    expect(avisoDeChoque("2026-11-03T09:00", [QUINCE, ONCE])).toBe(
      "Ese día ya sale otra publicación de esta cuenta a las 11:00 y a las 15:00.",
    )
  })

  test("asks for another time when the exact time is taken", () => {
    expect(avisoDeChoque("2026-11-03T11:00", [ONCE])).toBe(
      "Ese día ya sale otra publicación de esta cuenta a las 11:00. Elige otra hora.",
    )
  })

  test("reads the day in Chile, not in UTC", () => {
    // 22:30 in Chile on the 3rd is already the 4th in UTC.
    expect(avisoDeChoque("2026-11-04T10:00", ["2026-11-04T01:30:00.000Z"])).toBeNull()
    expect(avisoDeChoque("2026-11-03T10:00", ["2026-11-04T01:30:00.000Z"])).toBe(
      "Ese día ya sale otra publicación de esta cuenta a las 22:30.",
    )
  })

  test("says nothing for an incomplete value", () => {
    expect(avisoDeChoque("2026-11-03", [ONCE])).toBeNull()
  })
})
