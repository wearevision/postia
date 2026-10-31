import { describe, expect, test } from "vitest"
import { fechaDeFila, fechaLarga, instanteDesdeValorLocal, valorLocal } from "@/lib/piezas/fechas"

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
