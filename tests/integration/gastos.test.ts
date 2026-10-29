import { randomUUID } from "node:crypto"
import { createClient } from "@supabase/supabase-js"
import { describe, expect, test } from "vitest"
import type { Database } from "@/lib/supabase/database.types"
import { admin, entornoLocal, marcaConDueno, personaConSesion } from "./entorno"

/**
 * Months nobody else uses: each test gets its own ledger and its own caps. They are handed out in order from a random
 * start in 3000-3499, a range no other test file draws from, so two tests in a run never share a month.
 */
let siguienteMes = Math.floor(Math.random() * 5_000)

function mesDePrueba(meses = 1): { ahora: string; desde: string; mesAntes: (n: number) => string } {
  const indice = siguienteMes + meses - 1
  siguienteMes += meses
  const fecha = (i: number) => `${3000 + Math.floor(i / 12)}-${String(1 + (i % 12)).padStart(2, "0")}`
  return {
    ahora: `${fecha(indice)}-15T12:00:00Z`,
    desde: `${fecha(indice)}-01`,
    mesAntes: (n) => `${fecha(indice - n)}-01`,
  }
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

  test("lets exactly one of two racing reservations through at the edge of the cap, every time", async () => {
    const meses = Array.from({ length: 10 }, () => mesDePrueba())
    for (const { desde } of meses) await tope(desde, 50_000_000)
    const pares = await Promise.all(
      meses.map(async ({ ahora }) => {
        const claves = [clave(), clave()]
        const respuestas = await Promise.all(claves.map((c) => reservar(c, 30_000_000, ahora)))
        return { claves, estados: respuestas.map((r) => r.estado).sort() }
      }),
    )
    for (const { claves, estados } of pares) {
      expect(estados).toEqual(["reservado", "tope_alcanzado"])
      const { count } = await admin().from("gastos").select("*", { count: "exact", head: true }).in("clave", claves)
      expect(count).toBe(1)
    }
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
    const { ahora, mesAntes } = mesDePrueba(2)
    await tope(mesAntes(1), 10_000_000)
    const anterior = new Date(Date.parse(ahora) - 31 * 86_400_000).toISOString()
    expect((await reservar(clave(), 9_000_000, anterior)).estado).toBe("reservado")
    expect((await reservar(clave(), 9_000_000, ahora)).estado).toBe("reservado")
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

function anonimo() {
  const { url, anon } = entornoLocal()
  return createClient<Database>(url, anon, { auth: { persistSession: false, autoRefreshToken: false } })
}

async function vencer(c: string) {
  const { error } = await admin()
    .from("gastos")
    .update({ estado: "vencido", cerrado_en: new Date().toISOString() })
    .eq("clave", c)
  if (error) throw error
}

async function confirmar(c: string, real: number, ahora: string) {
  return admin().rpc("confirmar_gasto", { p_clave: c, p_real_micro: real, p_ahora: ahora })
}

describe("the ledger's limits", () => {
  test("refuses an estimate above US$1,000 and stores nothing", async () => {
    const { ahora, desde } = mesDePrueba()
    await tope(desde, 1_000_000_000)
    const c = clave()
    const { error } = await admin().rpc("reservar_gasto", {
      p_clave: c,
      p_proveedor: "anthropic",
      p_paso: "prueba",
      p_estimado_micro: 1_000_000_001,
      p_ahora: ahora,
    })
    expect(error).not.toBeNull()
    const { count } = await admin().from("gastos").select("*", { count: "exact", head: true }).eq("clave", c)
    expect(count).toBe(0)
    const { count: avisos } = await admin()
      .from("avisos_de_tope")
      .select("*", { count: "exact", head: true })
      .eq("mes", desde)
    expect(avisos).toBe(0)
  })
})

describe("the cap in force", () => {
  test("comes from the latest earlier month when this month has no row", async () => {
    const { ahora, mesAntes } = mesDePrueba(3)
    await tope(mesAntes(2), 5_000_000)
    expect(await reservar(clave(), 6_000_000, ahora)).toMatchObject({ estado: "tope_alcanzado", alcance: "global" })
    expect((await reservar(clave(), 4_000_000, ahora)).estado).toBe("reservado")
  })

  test("a brand row without an amount removes that brand's sub-cap", async () => {
    const marca = await marcaConDueno((await personaConSesion("gasto-sin-subtope")).userId)
    const { ahora, desde, mesAntes } = mesDePrueba(2)
    await tope(desde, 50_000_000)
    await tope(mesAntes(1), 5_000_000, marca)
    await tope(desde, null, marca)
    expect((await reservar(clave(), 10_000_000, ahora, marca)).estado).toBe("reservado")
  })

  test("a month starts at midnight in Santiago, not in UTC", async () => {
    await tope("3600-10-01", 50_000_000)
    const octubre = clave()
    const noviembre = clave()
    await reservar(octubre, 1, "3600-11-01T02:30:00Z")
    await reservar(noviembre, 1, "3600-11-01T03:30:00Z")
    const { data, error } = await admin().from("gastos").select("clave, mes").in("clave", [octubre, noviembre])
    if (error) throw error
    expect(Object.fromEntries(data.map((f) => [f.clave, f.mes]))).toEqual({
      [octubre]: "3600-10-01",
      [noviembre]: "3600-11-01",
    })
  })
})

describe("notices", () => {
  test("a brand's sub-cap reports its own 80 % and 100 %", async () => {
    const marca = await marcaConDueno((await personaConSesion("gasto-avisos-marca")).userId)
    const { ahora, desde } = mesDePrueba()
    await tope(desde, 100_000_000)
    await tope(desde, 10_000_000, marca)
    expect((await reservar(clave(), 8_000_000, ahora, marca)).avisos).toEqual([
      expect.objectContaining({ alcance: marca, umbral: 80 }),
    ])
    expect((await reservar(clave(), 2_000_000, ahora, marca)).avisos).toEqual([
      expect.objectContaining({ alcance: marca, umbral: 100 }),
    ])
  })

  test("a refusal with spend below 80 % reports only the cap", async () => {
    const marca = await marcaConDueno((await personaConSesion("gasto-frenado-marca")).userId)
    const { ahora, desde } = mesDePrueba()
    await tope(desde, 10_000_000)
    await tope(desde, 2_000_000, marca)
    expect(await reservar(clave(), 3_000_000, ahora, marca)).toEqual({
      estado: "tope_alcanzado",
      alcance: marca,
      avisos: [expect.objectContaining({ alcance: marca, umbral: 100 })],
    })
    expect(await reservar(clave(), 11_000_000, ahora)).toEqual({
      estado: "tope_alcanzado",
      alcance: "global",
      avisos: [expect.objectContaining({ alcance: "global", umbral: 100 })],
    })
  })
})

describe("expired reservations", () => {
  test("an expired reservation keeps counting at its estimate: nobody proved it was not billed", async () => {
    const { ahora, desde } = mesDePrueba()
    await tope(desde, 10_000_000)
    const c = clave()
    await reservar(c, 9_000_000, ahora)
    await vencer(c)
    expect((await reservar(clave(), 2_000_000, ahora)).estado).toBe("tope_alcanzado")
    expect((await reservar(clave(), 1_000_000, ahora)).estado).toBe("reservado")
  })

  test("an expired reservation confirmed late counts once, at its real cost", async () => {
    const { ahora, desde } = mesDePrueba()
    await tope(desde, 10_000_000)
    const c = clave()
    await reservar(c, 9_000_000, ahora)
    await vencer(c)
    const { data, error } = await confirmar(c, 5_000_000, ahora)
    expect(error).toBeNull()
    expect(data).toMatchObject({ estado: "confirmado" })
    expect((await reservar(clave(), 5_000_000, ahora)).estado).toBe("reservado")
    expect((await reservar(clave(), 1, ahora)).estado).toBe("tope_alcanzado")
  })

  test("the sweep leaves a reservation just under 24 hours old alone", async () => {
    const ahora = Date.now()
    const casi = clave()
    const pasada = clave()
    await reservar(casi, 1, new Date(ahora - 24 * 3_600_000 + 60_000).toISOString())
    await reservar(pasada, 1, new Date(ahora - 24 * 3_600_000 - 60_000).toISOString())
    const { error } = await admin().rpc("barrer_gastos", { p_ahora: new Date(ahora).toISOString() })
    expect(error).toBeNull()
    const { data } = await admin().from("gastos").select("clave, estado").in("clave", [casi, pasada])
    expect(Object.fromEntries((data ?? []).map((f) => [f.clave, f.estado]))).toEqual({
      [casi]: "reservado",
      [pasada]: "vencido",
    })
  })
})

describe("liberar_gasto", () => {
  test("releasing twice answers ya_liberado; a confirmed spend cannot be released", async () => {
    const { ahora, desde } = mesDePrueba()
    await tope(desde, 10_000_000)
    const c = clave()
    await reservar(c, 1_000_000, ahora)
    expect((await admin().rpc("liberar_gasto", { p_clave: c, p_ahora: ahora })).data).toBe("liberado")
    expect((await admin().rpc("liberar_gasto", { p_clave: c, p_ahora: ahora })).data).toBe("ya_liberado")
    const confirmada = clave()
    await reservar(confirmada, 1_000_000, ahora)
    await confirmar(confirmada, 1_000_000, ahora)
    const { error } = await admin().rpc("liberar_gasto", { p_clave: confirmada, p_ahora: ahora })
    expect(error?.message).toBe("gasto_cerrado")
  })
})

describe("access", () => {
  test("only the service role moves the ledger", async () => {
    const { db } = await personaConSesion("gasto-sin-permiso")
    for (const cliente of [db, anonimo()]) {
      const llamadas = [
        cliente.rpc("reservar_gasto", {
          p_clave: clave(),
          p_proveedor: "anthropic",
          p_paso: "prueba",
          p_estimado_micro: 1,
        }),
        cliente.rpc("confirmar_gasto", { p_clave: clave(), p_real_micro: 1 }),
        cliente.rpc("liberar_gasto", { p_clave: clave() }),
        cliente.rpc("barrer_gastos"),
      ]
      for (const { error } of await Promise.all(llamadas)) expect(error?.code).toBe("42501")
    }
  })

  test("a signed-in person can neither read nor write the ledger tables", async () => {
    const { db } = await personaConSesion("gasto-tablas")
    for (const { error } of [
      await db.from("topes").select("id"),
      await db.from("gastos").select("id"),
      await db.from("avisos_de_tope").select("mes"),
      await db.from("topes").insert({ desde_mes: "3999-01-01", monto_micro: 1_000_000_000 }),
      await db
        .from("gastos")
        .insert({ clave: clave(), proveedor: "anthropic", paso: "prueba", mes: "3999-01-01", estimado_micro: 1 }),
      await db.from("avisos_de_tope").insert({ mes: "3999-01-01", alcance: "global", umbral: 80 }),
    ]) {
      expect(error?.code).toBe("42501")
    }
  })
})
