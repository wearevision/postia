import { describe, expect, test } from "vitest"
import { instanteDe } from "@/lib/dominio/instante"

describe("instanteDe", () => {
  test("takes the Date a scheduled run receives", () => {
    expect(instanteDe(new Date("2026-11-01T20:00:00.000Z"))).toEqual(new Date("2026-11-01T20:00:00.000Z"))
  })

  test("takes the ISO string a run triggered by hand receives", () => {
    expect(instanteDe("2026-11-01T20:00:00.000Z")).toEqual(new Date("2026-11-01T20:00:00.000Z"))
  })

  test("refuses anything that is not a valid time instead of running with NaN", () => {
    expect(() => instanteDe("ayer")).toThrow("La tarea recibió una hora que no es válida: ayer")
    expect(() => instanteDe(undefined)).toThrow("La tarea recibió una hora que no es válida: undefined")
  })
})
