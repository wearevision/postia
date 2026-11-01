import { describe, expect, test } from "vitest"
import { limpiarCita } from "@/lib/investigacion/cita"

describe("limpiarCita", () => {
  test.each([
    ["«hola»", "hola"],
    ['"hola"', "hola"],
    ["“hola”", "hola"],
    ["'hola'", "hola"],
    ["«««hola»»»", "hola"],
    ['  "«hola»"  ', "hola"],
  ])("strips quote characters around %s", (entrada, esperado) => {
    expect(limpiarCita(entrada)).toBe(esperado)
  })

  test("keeps quotes that sit inside the text", () => {
    expect(limpiarCita('dijo "no" y se fue')).toBe('dijo "no" y se fue')
  })

  test("returns an empty string when only quotes remain", () => {
    expect(limpiarCita("«»")).toBe("")
  })
})
