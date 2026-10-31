import { describe, expect, test } from "vitest"
import {
  destinoDe,
  RUTA_DE_CALENDARIO,
  RUTA_DE_CLIENTES,
  RUTA_DE_VOZ,
  rutaDeCalendario,
  rutaDeEditarCarrusel,
  rutaDePieza,
  rutaDeVoz,
} from "@/lib/sesion/rutas"

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

describe("voz y clientes", () => {
  test("a brand's line and one of its versions have their own address", () => {
    expect(RUTA_DE_VOZ).toBe("/voz")
    expect(RUTA_DE_CLIENTES).toBe("/clientes")
    expect(rutaDeVoz("m1")).toBe("/voz/m1")
    expect(rutaDeVoz("m1", 3)).toBe("/voz/m1?version=3")
  })
})

describe("rutaDePieza", () => {
  test("a piece, and a new piece whose plan or pillar could not be set", () => {
    expect(rutaDePieza("p1")).toBe("/piezas/p1")
    expect(rutaDePieza("p1", [])).toBe("/piezas/p1")
    expect(rutaDePieza("p1", ["pilar"])).toBe("/piezas/p1?aviso=pilar")
    expect(rutaDePieza("p1", ["plan", "pilar"])).toBe("/piezas/p1?aviso=plan,pilar")
  })
})

describe("rutaDeEditarCarrusel", () => {
  test("opens the carousel editor on a piece", () => {
    expect(rutaDeEditarCarrusel("abc")).toBe("/piezas/carrusel?pieza=abc")
  })
})
