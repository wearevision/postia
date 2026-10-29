import { describe, expect, test } from "vitest"
import { destinoDe, RUTA_DE_CALENDARIO, rutaDeCalendario } from "@/lib/sesion/rutas"

describe("destinoDe", () => {
  test("sends someone without a session to sign-in from any app route", () => {
    expect(destinoDe("/", false)).toBe("/ingreso")
    expect(destinoDe("/marcas", false)).toBe("/ingreso")
    expect(destinoDe("/api/linkedin/callback", false)).toBe("/ingreso")
  })

  test("lets someone without a session see sign-in", () => {
    expect(destinoDe("/ingreso", false)).toBeNull()
  })

  test("sends someone already signed in away from sign-in", () => {
    expect(destinoDe("/ingreso", true)).toBe("/")
    expect(destinoDe("/marcas", true)).toBeNull()
  })
})

describe("rutaDeCalendario", () => {
  test("a week or a month of the calendar", () => {
    expect(RUTA_DE_CALENDARIO).toBe("/calendario")
    expect(rutaDeCalendario({ semana: "2026-11-02" })).toBe("/calendario?semana=2026-11-02")
    expect(rutaDeCalendario({ mes: "2026-11" })).toBe("/calendario?vista=mes&mes=2026-11")
  })
})
