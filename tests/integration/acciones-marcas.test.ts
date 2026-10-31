import { describe, expect, test } from "vitest"
import { agregarCuenta, cambiarRuta, crearMarca } from "@/lib/marcas/acciones"
import { piezasProgramadas } from "@/lib/marcas/programadas"
import { admin, cuentaDe, marcaConDueno, personaConSesion } from "./entorno"

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

  test("an owner switches an account between «a mano» and «sale sola»", async () => {
    const { db, userId } = await personaConSesion("ruta")
    const cuentaId = await cuentaDe(await marcaConDueno(userId), "empresa", "a_mano")
    const ruta = async () => (await admin().from("cuentas").select("ruta").eq("id", cuentaId).single()).data?.ruta

    expect(await cambiarRuta(db, { cuentaId, ruta: "api" })).toEqual({ ok: true })
    expect(await ruta()).toBe("api")
    expect(await cambiarRuta(db, { cuentaId, ruta: "a_mano" })).toEqual({ ok: true })
    expect(await ruta()).toBe("a_mano")
  })

  test("only the owner switches the route, and only between the two routes", async () => {
    const { userId } = await personaConSesion("ruta-duena")
    const cuentaId = await cuentaDe(await marcaConDueno(userId), "empresa", "a_mano")
    const { db: ajena } = await personaConSesion("ruta-ajena")
    expect(await cambiarRuta(ajena, { cuentaId, ruta: "api" })).toEqual({
      ok: false,
      error: "Solo el dueño de la marca puede cambiar cómo sale una cuenta.",
    })
    expect(await cambiarRuta(ajena, { cuentaId, ruta: "metricool" })).toEqual({
      ok: false,
      error: "Elige «sale sola» o «a mano».",
    })
  })

  test("counts each account's scheduled pieces, and only those", async () => {
    const { db, userId } = await personaConSesion("programadas")
    const marca = await marcaConDueno(userId)
    const conPiezas = await cuentaDe(marca, "persona", "a_mano")
    const sinPiezas = await cuentaDe(marca, "empresa", "a_mano")
    for (const texto of ["Uno", "Dos", "Borrador"]) {
      const { data: pieza, error } = await db.rpc("crear_pieza", {
        p_cuenta: conPiezas,
        p_formato: "texto",
        p_texto: texto,
      })
      if (error) throw error
      if (texto === "Borrador") continue
      const { data: version } = await admin()
        .from("versiones")
        .select("huella")
        .eq("pieza_id", pieza)
        .order("numero", { ascending: false })
        .limit(1)
        .single()
      const firma = await db.rpc("firmar_pieza", {
        p_pieza: pieza,
        p_huella: version?.huella ?? "",
        p_programada_para: new Date(Date.now() + 86_400_000).toISOString(),
      })
      if (firma.error) throw firma.error
    }
    const cuentas = await piezasProgramadas(db, [conPiezas, sinPiezas])
    expect(cuentas.get(conPiezas)).toBe(2)
    expect(cuentas.get(sinPiezas) ?? 0).toBe(0)
  })
})
