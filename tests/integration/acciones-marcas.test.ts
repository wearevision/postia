import { describe, expect, test } from "vitest"
import { agregarCuenta, crearMarca } from "@/lib/marcas/acciones"
import { marcaConDueno, personaConSesion } from "./entorno"

describe("brand and account actions", () => {
  test("an owner creates a brand; a repeated name gets a clear message", async () => {
    const { db, userId } = await personaConSesion("acciones")
    await marcaConDueno(userId)
    const nombre = `WAV ${Date.now()}`
    expect(await crearMarca(db, { nombre, voz: "nosotros" })).toEqual({ ok: true })
    expect(await crearMarca(db, { nombre, voz: "nosotros" })).toEqual({
      ok: false,
      error: "Ya existe una marca con ese nombre.",
    })
  })

  test("invalid input never reaches the database", async () => {
    const { db } = await personaConSesion("invalida")
    expect(await crearMarca(db, { nombre: "", voz: "ellos" })).toEqual({
      ok: false,
      error: "Revisa el nombre y la voz de la marca.",
    })
  })

  test("adds a LinkedIn profile and a page, both by API", async () => {
    const { db, userId } = await personaConSesion("cuenta")
    const marcaId = await marcaConDueno(userId)
    expect(
      await agregarCuenta(db, {
        marcaId,
        tipo: "persona",
        ruta: "api",
        nombre: "LinkedIn de Federico",
        ritmoSemanal: "3",
      }),
    ).toEqual({ ok: true })
    expect(
      await agregarCuenta(db, { marcaId, tipo: "empresa", ruta: "api", nombre: "Página", ritmoSemanal: "3" }),
    ).toEqual({ ok: true })
  })
})
