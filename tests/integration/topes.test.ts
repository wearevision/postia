import { randomUUID } from "node:crypto"
import { describe, expect, test } from "vitest"
import { guardarTope } from "@/lib/gasto/acciones"
import { resumenDeGasto } from "@/lib/gasto/lectura"
import { admin, marcaConDueno, personaConSesion } from "./entorno"

const HACE_DOS_DIAS = () => new Date(Date.now() - 2 * 86_400_000).toISOString()

describe("barrer_gastos", () => {
  test("expires reservations older than 24 hours and leaves fresh and closed ones alone", async () => {
    const vieja = `prueba:${randomUUID()}`
    const nueva = `prueba:${randomUUID()}`
    const confirmada = `prueba:${randomUUID()}`
    for (const [clave, ahora] of [
      [vieja, HACE_DOS_DIAS()],
      [nueva, new Date().toISOString()],
      [confirmada, HACE_DOS_DIAS()],
    ] as const) {
      const { error } = await admin().rpc("reservar_gasto", {
        p_clave: clave,
        p_proveedor: "anthropic",
        p_paso: "prueba",
        p_estimado_micro: 1,
        p_ahora: ahora,
      })
      if (error) throw error
    }
    await admin().rpc("confirmar_gasto", { p_clave: confirmada, p_real_micro: 1 })
    const { data, error } = await admin().rpc("barrer_gastos")
    expect(error).toBeNull()
    expect(data).toBeGreaterThanOrEqual(1)
    const { data: filas } = await admin().from("gastos").select("clave, estado").in("clave", [vieja, nueva, confirmada])
    const estados = Object.fromEntries((filas ?? []).map((f) => [f.clave, f.estado]))
    expect(estados).toEqual({ [vieja]: "vencido", [nueva]: "reservado", [confirmada]: "confirmado" })
  })
})

describe("resumen_de_gasto", () => {
  test("shows an owner the month's total, the cap, «General» and each of their brands", async () => {
    const { db, userId } = await personaConSesion("resumen-gasto")
    const marca = await marcaConDueno(userId)
    const { error } = await admin().rpc("reservar_gasto", {
      p_clave: `prueba:${randomUUID()}`,
      p_proveedor: "anthropic",
      p_paso: "prueba",
      p_estimado_micro: 1_500_000,
      p_marca: marca,
    })
    if (error) throw error
    const { data, error: errorDeResumen } = await db.rpc("resumen_de_gasto")
    expect(errorDeResumen).toBeNull()
    const resumen = data as {
      tope_micro: number
      gastado_micro: number
      filas: { marca_id: string | null; nombre: string; gastado_micro: number }[]
    }
    expect(resumen.tope_micro).toBeGreaterThan(0)
    expect(resumen.gastado_micro).toBeGreaterThanOrEqual(1_500_000)
    expect(resumen.filas[0]).toMatchObject({ marca_id: null, nombre: "General" })
    expect(resumen.filas).toContainEqual(expect.objectContaining({ marca_id: marca, gastado_micro: 1_500_000 }))
  })

  test("counts an expired reservation in the brand's row and the month's total", async () => {
    const { db, userId } = await personaConSesion("resumen-vencido")
    const marca = await marcaConDueno(userId)
    const clave = `prueba:${randomUUID()}`
    const { error } = await admin().rpc("reservar_gasto", {
      p_clave: clave,
      p_proveedor: "anthropic",
      p_paso: "prueba",
      p_estimado_micro: 700_000,
      p_marca: marca,
    })
    if (error) throw error
    const { error: errorAlVencer } = await admin().from("gastos").update({ estado: "vencido" }).eq("clave", clave)
    if (errorAlVencer) throw errorAlVencer
    const { data } = await db.rpc("resumen_de_gasto")
    const resumen = data as { gastado_micro: number; filas: { marca_id: string | null; gastado_micro: number }[] }
    expect(resumen.gastado_micro).toBeGreaterThanOrEqual(700_000)
    expect(resumen.filas).toContainEqual(expect.objectContaining({ marca_id: marca, gastado_micro: 700_000 }))
  })

  test("is refused to a person without a brand", async () => {
    const { db } = await personaConSesion("resumen-extrano")
    const { error } = await db.rpc("resumen_de_gasto")
    expect(error?.code).toBe("42501")
  })
})

describe("guardar_tope", () => {
  test("an owner changes the global cap from this month on", async () => {
    const { db, userId } = await personaConSesion("tope-global")
    await marcaConDueno(userId)
    const { error } = await db.rpc("guardar_tope", { p_monto_micro: 55_000_000 })
    expect(error).toBeNull()
    const { data } = await db.rpc("resumen_de_gasto")
    expect((data as { tope_micro: number }).tope_micro).toBe(55_000_000)
  })

  test("an owner sets and removes a sub-cap only on their own brand", async () => {
    const { db, userId } = await personaConSesion("tope-marca")
    const marca = await marcaConDueno(userId)
    const otra = await marcaConDueno((await personaConSesion("tope-otra")).userId)
    expect((await db.rpc("guardar_tope", { p_monto_micro: 5_000_000, p_marca: marca })).error).toBeNull()
    expect((await db.rpc("guardar_tope", { p_marca: marca })).error).toBeNull()
    const ajena = await db.rpc("guardar_tope", { p_monto_micro: 5_000_000, p_marca: otra })
    expect(ajena.error?.code).toBe("42501")
  })

  test("refuses amounts outside US$1 to US$1,000 and a global cap without amount", async () => {
    const { db, userId } = await personaConSesion("tope-invalido")
    await marcaConDueno(userId)
    expect((await db.rpc("guardar_tope", { p_monto_micro: 999_999 })).error?.message).toBe("tope_invalido")
    expect((await db.rpc("guardar_tope", { p_monto_micro: 1_000_000_001 })).error?.message).toBe("tope_invalido")
    expect((await db.rpc("guardar_tope", {})).error?.message).toBe("tope_invalido")
  })

  test("a person without a brand cannot change any cap", async () => {
    const { db } = await personaConSesion("tope-extrano")
    expect((await db.rpc("guardar_tope", { p_monto_micro: 50_000_000 })).error?.code).toBe("42501")
  })
})

describe("resumenDeGasto and guardarTope", () => {
  test("an owner reads the month in micro-dollars and saves caps in dollars", async () => {
    const { db, userId } = await personaConSesion("gasto-lib")
    const marca = await marcaConDueno(userId)
    expect(await guardarTope(db, { marcaId: marca, dolares: 12 })).toEqual({ ok: true })
    const resumen = await resumenDeGasto(db)
    expect(resumen.filas).toContainEqual(expect.objectContaining({ marcaId: marca, topeMicro: 12_000_000 }))
    expect(await guardarTope(db, { marcaId: marca, dolares: null })).toEqual({ ok: true })
    expect(await guardarTope(db, { marcaId: null, dolares: 0.5 })).toEqual({
      ok: false,
      error: "El tope va entre US$1 y US$1.000.",
    })
  })
})
