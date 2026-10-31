import { describe, expect, test } from "vitest"
import {
  destinoDe,
  RUTA_DE_CALENDARIO,
  RUTA_DE_CLIENTES,
  RUTA_DE_IDEAS,
  RUTA_DE_VOZ,
  rutaDeCalendario,
  rutaDeEditarCarrusel,
  rutaDeIdea,
  rutaDePieza,
  rutaDeSerie,
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
  test("a piece route carries no creation notice any more", () => {
    expect(rutaDePieza("p1")).toBe("/piezas/p1")
    expect(rutaDePieza.length).toBe(1)
  })
})

describe("rutaDeEditarCarrusel", () => {
  test("opens the carousel editor on a piece", () => {
    expect(rutaDeEditarCarrusel("abc")).toBe("/piezas/carrusel?pieza=abc")
  })
})

describe("Ideas y series", () => {
  test("the page, one series, and one idea inside its series", () => {
    expect(RUTA_DE_IDEAS).toBe("/ideas")
    expect(rutaDeSerie("inv1")).toBe("/ideas?serie=inv1")
    expect(rutaDeIdea("i1", "inv1")).toBe("/ideas?serie=inv1&estado=todas#idea-i1")
    expect(rutaDeIdea("i1", null)).toBe("/ideas?estado=todas#idea-i1")
  })
})
