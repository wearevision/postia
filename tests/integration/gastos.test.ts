import { randomUUID } from "node:crypto"
import { describe, expect, test } from "vitest"
import { admin, marcaConDueno, personaConSesion } from "./entorno"

/** A month nobody else uses: each test gets its own ledger and its own caps. */
function mesDePrueba(): { ahora: string; desde: string } {
  const anio = 2400 + Math.floor(Math.random() * 600)
  const mes = String(1 + Math.floor(Math.random() * 12)).padStart(2, "0")
  return { ahora: `${anio}-${mes}-15T12:00:00Z`, desde: `${anio}-${mes}-01` }
}

async function tope(desde: string, montoMicro: number | null, marcaId: string | null = null) {
  const { error } = await admin().from("topes").insert({ marca_id: marcaId, desde_mes: desde, monto_micro: montoMicro })
  if (error) throw error
}

function clave() {
  return `prueba:${randomUUID()}`
}

async function reservar(c: string, estimado: number, ahora: string, marca: string | null = null) {
  const { data, error } = await admin().rpc("reservar_gasto", {
    p_clave: c,
    p_proveedor: "anthropic",
    p_paso: "prueba",
    p_estimado_micro: estimado,
    p_marca: marca ?? undefined,
    p_ahora: ahora,
  })
  if (error) throw error
  return data as { estado: string; alcance?: string; avisos: { alcance: string; umbral: number }[] }
}

describe("reservar_gasto", () => {
  test("reserves while the estimate fits and refuses the step that would pass the cap", async () => {
    const { ahora, desde } = mesDePrueba()
    await tope(desde, 50_000_000)
    expect((await reservar(clave(), 30_000_000, ahora)).estado).toBe("reservado")
    const negado = await reservar(clave(), 30_000_000, ahora)
    expect(negado.estado).toBe("tope_alcanzado")
    expect(negado.alcance).toBe("global")
  })

  test("never reserves twice with the same key", async () => {
    const { ahora, desde } = mesDePrueba()
    await tope(desde, 50_000_000)
    const c = clave()
    expect((await reservar(c, 1_000_000, ahora)).estado).toBe("reservado")
    expect(await reservar(c, 1_000_000, ahora)).toMatchObject({ estado: "ya_existe" })
    const { count } = await admin().from("gastos").select("*", { count: "exact", head: true }).eq("clave", c)
    expect(count).toBe(1)
  })

  test("lets only one of two racing reservations through at the edge of the cap", async () => {
    const { ahora, desde } = mesDePrueba()
    await tope(desde, 50_000_000)
    const [a, b] = await Promise.all([reservar(clave(), 30_000_000, ahora), reservar(clave(), 30_000_000, ahora)])
    expect([a.estado, b.estado].sort()).toEqual(["reservado", "tope_alcanzado"])
  })

  test("applies a brand's sub-cap in the same transaction and charges unbranded spend to General", async () => {
    const { userId } = await personaConSesion("gasto-marca")
    const marca = await marcaConDueno(userId)
    const { ahora, desde } = mesDePrueba()
    await tope(desde, 50_000_000)
    await tope(desde, 5_000_000, marca)
    expect((await reservar(clave(), 4_000_000, ahora, marca)).estado).toBe("reservado")
    expect(await reservar(clave(), 2_000_000, ahora, marca)).toMatchObject({ estado: "tope_alcanzado", alcance: marca })
    expect((await reservar(clave(), 2_000_000, ahora)).estado).toBe("reservado")
  })

  test("reports 80 % once, then the cap once, per month", async () => {
    const { ahora, desde } = mesDePrueba()
    await tope(desde, 10_000_000)
    expect((await reservar(clave(), 7_000_000, ahora)).avisos).toEqual([])
    expect((await reservar(clave(), 1_000_000, ahora)).avisos).toEqual([
      expect.objectContaining({ alcance: "global", umbral: 80 }),
    ])
    expect((await reservar(clave(), 500_000, ahora)).avisos).toEqual([])
    expect((await reservar(clave(), 5_000_000, ahora)).avisos).toEqual([
      expect.objectContaining({ alcance: "global", umbral: 100 }),
    ])
    expect((await reservar(clave(), 5_000_000, ahora)).avisos).toEqual([])
  })

  test("starts every month from zero", async () => {
    const { ahora, desde } = mesDePrueba()
    await tope(desde, 10_000_000)
    expect((await reservar(clave(), 9_000_000, ahora)).estado).toBe("reservado")
    const siguiente = new Date(Date.parse(ahora) + 31 * 86_400_000).toISOString()
    expect((await reservar(clave(), 9_000_000, siguiente)).estado).toBe("reservado")
  })

  test("is not callable by a signed-in person", async () => {
    const { db } = await personaConSesion("gasto-extrano")
    const { error } = await db.rpc("reservar_gasto", {
      p_clave: clave(),
      p_proveedor: "anthropic",
      p_paso: "prueba",
      p_estimado_micro: 1,
    })
    expect(error?.code).toBe("42501")
  })
})

describe("confirmar_gasto and liberar_gasto", () => {
  test("confirms the real cost, which then counts instead of the estimate", async () => {
    const { ahora, desde } = mesDePrueba()
    await tope(desde, 10_000_000)
    const c = clave()
    await reservar(c, 9_000_000, ahora)
    const { error } = await admin().rpc("confirmar_gasto", { p_clave: c, p_real_micro: 1_000_000, p_ahora: ahora })
    expect(error).toBeNull()
    expect((await reservar(clave(), 8_000_000, ahora)).estado).toBe("reservado")
  })

  test("confirming twice with the same cost is a no-op; a different cost is refused", async () => {
    const { ahora, desde } = mesDePrueba()
    await tope(desde, 10_000_000)
    const c = clave()
    await reservar(c, 1_000_000, ahora)
    await admin().rpc("confirmar_gasto", { p_clave: c, p_real_micro: 500_000, p_ahora: ahora })
    const otra = await admin().rpc("confirmar_gasto", { p_clave: c, p_real_micro: 500_000, p_ahora: ahora })
    expect(otra.data).toMatchObject({ estado: "ya_confirmado" })
    const distinta = await admin().rpc("confirmar_gasto", { p_clave: c, p_real_micro: 600_000, p_ahora: ahora })
    expect(distinta.error?.message).toBe("gasto_cerrado")
  })

  test("a released reservation stops counting and cannot be confirmed afterwards", async () => {
    const { ahora, desde } = mesDePrueba()
    await tope(desde, 10_000_000)
    const c = clave()
    await reservar(c, 9_000_000, ahora)
    expect((await admin().rpc("liberar_gasto", { p_clave: c, p_ahora: ahora })).error).toBeNull()
    expect((await reservar(clave(), 9_000_000, ahora)).estado).toBe("reservado")
    const tarde = await admin().rpc("confirmar_gasto", { p_clave: c, p_real_micro: 1, p_ahora: ahora })
    expect(tarde.error?.message).toBe("gasto_cerrado")
  })

  test("an unknown key is refused", async () => {
    const { error } = await admin().rpc("liberar_gasto", { p_clave: clave() })
    expect(error?.message).toBe("gasto_desconocido")
  })
})
