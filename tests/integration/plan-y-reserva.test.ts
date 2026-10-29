import { describe, expect, test } from "vitest"
import { admin, cuentaDe, enDias, marcaConDueno, personaConSesion, piezaDe, versionVigente } from "./entorno"

async function cuentaConDueno(prefijo = "plan") {
  const dueno = await personaConSesion(prefijo)
  const marca = await marcaConDueno(dueno.userId)
  return { ...dueno, marca, cuenta: await cuentaDe(marca) }
}

async function planeada(pieza: string) {
  const { data } = await admin()
    .from("piezas")
    .select("estado, planeada_para, programada_para")
    .eq("id", pieza)
    .single()
  return data
}

describe("planear_pieza", () => {
  test("an owner plans an unsigned piece for a future slot", async () => {
    const { db, cuenta } = await cuentaConDueno()
    const pieza = await piezaDe(db, cuenta)
    const cuando = enDias(2)
    expect((await db.rpc("planear_pieza", { p_pieza: pieza, p_fecha: cuando })).error).toBeNull()
    expect(Date.parse((await planeada(pieza))?.planeada_para ?? "")).toBe(Date.parse(cuando))
  })

  test("a stranger cannot plan someone else's piece", async () => {
    const { db, cuenta } = await cuentaConDueno()
    const pieza = await piezaDe(db, cuenta)
    const extrano = await personaConSesion("plan-extrano")
    const { error } = await extrano.db.rpc("planear_pieza", { p_pieza: pieza, p_fecha: enDias(2) })
    expect(error?.code).toBe("42501")
  })

  test("refuses the past and a piece that is not waiting for its signature", async () => {
    const { db, cuenta } = await cuentaConDueno()
    const pieza = await piezaDe(db, cuenta)
    const pasado = new Date(Date.now() - 60_000).toISOString()
    expect((await db.rpc("planear_pieza", { p_pieza: pieza, p_fecha: pasado })).error?.message).toBe(
      "fecha_en_el_pasado",
    )
    const { huella } = await versionVigente(pieza)
    await db.rpc("firmar_pieza", { p_pieza: pieza, p_huella: huella, p_programada_para: enDias(3) })
    expect((await db.rpc("planear_pieza", { p_pieza: pieza, p_fecha: enDias(4) })).error?.message).toBe(
      "pieza_no_esta_por_aprobar",
    )
  })

  test("a slot taken by a planned or a signed piece of the same account is refused", async () => {
    const { db, cuenta } = await cuentaConDueno()
    const [a, b, c] = [await piezaDe(db, cuenta), await piezaDe(db, cuenta), await piezaDe(db, cuenta)]
    const lunes = enDias(5)
    await db.rpc("planear_pieza", { p_pieza: a, p_fecha: lunes })
    expect((await db.rpc("planear_pieza", { p_pieza: b, p_fecha: lunes })).error?.code).toBe("23505")
    const martes = enDias(6)
    const { huella } = await versionVigente(c)
    await db.rpc("firmar_pieza", { p_pieza: c, p_huella: huella, p_programada_para: martes })
    expect((await db.rpc("planear_pieza", { p_pieza: b, p_fecha: martes })).error?.code).toBe("23505")
  })

  test("another account may use the same slot", async () => {
    const uno = await cuentaConDueno()
    const otra = await cuentaDe(uno.marca, "empresa", "a_mano")
    const cuando = enDias(7)
    await uno.db.rpc("planear_pieza", { p_pieza: await piezaDe(uno.db, uno.cuenta), p_fecha: cuando })
    const { error } = await uno.db.rpc("planear_pieza", { p_pieza: await piezaDe(uno.db, otra), p_fecha: cuando })
    expect(error).toBeNull()
  })

  test("signing moves the plan to the signed date and frees the old slot", async () => {
    const { db, cuenta } = await cuentaConDueno()
    const [a, b] = [await piezaDe(db, cuenta), await piezaDe(db, cuenta)]
    const plan = enDias(8)
    const firmada = enDias(9)
    await db.rpc("planear_pieza", { p_pieza: a, p_fecha: plan })
    const { huella } = await versionVigente(a)
    expect(
      (await db.rpc("firmar_pieza", { p_pieza: a, p_huella: huella, p_programada_para: firmada })).error,
    ).toBeNull()
    expect(Date.parse((await planeada(a))?.planeada_para ?? "")).toBe(Date.parse(firmada))
    expect((await db.rpc("planear_pieza", { p_pieza: b, p_fecha: plan })).error).toBeNull()
  })

  test("a piece sent back to the gate keeps its slot as plan", async () => {
    const { db, cuenta } = await cuentaConDueno()
    const pieza = await piezaDe(db, cuenta)
    const cuando = enDias(10)
    const { huella } = await versionVigente(pieza)
    await db.rpc("firmar_pieza", { p_pieza: pieza, p_huella: huella, p_programada_para: cuando })
    await db.rpc("desprogramar_pieza", { p_pieza: pieza })
    const fila = await planeada(pieza)
    expect(fila?.estado).toBe("por_aprobar")
    expect(Date.parse(fila?.planeada_para ?? "")).toBe(Date.parse(cuando))
  })
})
