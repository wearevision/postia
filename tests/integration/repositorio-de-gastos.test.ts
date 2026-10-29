import { randomUUID } from "node:crypto"
import { afterEach, describe, expect, test, vi } from "vitest"
import { avisarPersona } from "@/lib/avisos/a-miembros"
import type { ServicioPush } from "@/lib/avisos/push"
import { avisarTope, barrerGastos, libroDeGastos, mensajeDeTope } from "@/lib/gasto/repositorio"
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

// Wraps the real push so one test can make a single person's push throw; every other call goes through untouched.
vi.mock("@/lib/avisos/a-miembros", async (original) => {
  const real = await original<typeof import("@/lib/avisos/a-miembros")>()
  return { ...real, avisarPersona: vi.fn(real.avisarPersona) }
})

afterEach(() => {
  vi.restoreAllMocks()
})

function clave() {
  return `prueba:${randomUUID()}`
}

describe("libroDeGastos", () => {
  test("reserves, confirms and releases through the RPCs with typed answers", async () => {
    const { ahora, desde } = mesDePrueba()
    await tope(desde, 10_000_000)
    const libro = libroDeGastos(admin(), { ahora: () => ahora })
    const pedido = {
      clave: clave(),
      proveedor: "anthropic" as const,
      paso: "prueba",
      estimadoMicro: 8_500_000,
      marcaId: null,
    }
    expect(await libro.reservar(pedido)).toEqual({
      estado: "reservado",
      avisos: [{ alcance: "global", umbral: 80, gastadoMicro: 8_500_000, topeMicro: 10_000_000 }],
    })
    expect(await libro.confirmar(pedido.clave, 1_000)).toEqual([])
    const otro = { ...pedido, clave: clave(), estimadoMicro: 1 }
    await libro.reservar(otro)
    await libro.liberar(otro.clave)
    const { data } = await admin().from("gastos").select("estado").eq("clave", otro.clave).single()
    expect(data?.estado).toBe("sin_cobro")
  })

  test("returns the refusal with its scope", async () => {
    const { ahora, desde } = mesDePrueba()
    await tope(desde, 1_000_000)
    const libro = libroDeGastos(admin(), { ahora: () => ahora })
    const reserva = await libro.reservar({
      clave: clave(),
      proveedor: "anthropic",
      paso: "prueba",
      estimadoMicro: 2_000_000,
      marcaId: null,
    })
    expect(reserva).toMatchObject({ estado: "tope_alcanzado", alcance: "global" })
  })
})

describe("avisarTope", () => {
  test("pushes each notice urgently to every owner's devices", async () => {
    const { userId } = await personaConSesion("aviso-tope")
    await marcaConDueno(userId)
    const { error } = await admin()
      .from("suscripciones_push")
      .insert({
        user_id: userId,
        endpoint: `https://push.example/${randomUUID()}`,
        p256dh: "p",
        auth: "a",
        user_agent: "prueba",
      })
    if (error) throw error
    const enviar = vi.fn(async () => ({ estado: "enviado" as const }))
    const servicio: ServicioPush = { enviar }
    await avisarTope(admin(), servicio, [
      { alcance: "global", umbral: 80, gastadoMicro: 32_000_000, topeMicro: 40_000_000 },
    ])
    expect(enviar).toHaveBeenCalledWith(
      expect.anything(),
      { titulo: "Gasto al 80 %", cuerpo: "Van US$32,00 de US$40,00 este mes.", url: "/ajustes" },
      { urgente: true },
    )
  })
})

describe("avisarTope when a push throws", () => {
  test("logs the failure and still pushes to every other owner", async () => {
    const primera = await personaConSesion("aviso-tope-falla")
    const segunda = await personaConSesion("aviso-tope-sigue")
    await marcaConDueno(primera.userId)
    await marcaConDueno(segunda.userId)
    vi.mocked(avisarPersona).mockRejectedValueOnce(new Error("sin aparatos"))
    const registro = vi.spyOn(console, "error").mockImplementation(() => {})
    const servicio: ServicioPush = { enviar: vi.fn(async () => ({ estado: "enviado" as const })) }
    await avisarTope(admin(), servicio, [
      { alcance: "global", umbral: 100, gastadoMicro: 40_000_000, topeMicro: 40_000_000 },
    ])
    const avisadas = vi.mocked(avisarPersona).mock.calls.map(([, , persona]) => persona)
    expect(avisadas).toEqual(expect.arrayContaining([primera.userId, segunda.userId]))
    expect(registro).toHaveBeenCalledWith(expect.stringContaining("sin aparatos"))
  })
})

describe("mensajeDeTope", () => {
  test("names the brand when a sub-cap is reached", () => {
    expect(
      mensajeDeTope({ alcance: "x", umbral: 100, gastadoMicro: 5_000_000, topeMicro: 5_000_000 }, "WAV We Are Vision"),
    ).toEqual({
      titulo: "WAV We Are Vision llegó a su tope",
      cuerpo:
        "Van US$5,00 de US$5,00. Lo que esa marca gasta queda en pausa hasta el próximo mes o hasta que subas su tope.",
      url: "/ajustes",
    })
  })
})

describe("barrerGastos", () => {
  test("expires a reservation left open for over a day and counts it", async () => {
    // A month in 3500-3599, which no other test file uses; the row is backdated so the real clock sweeps it.
    const mes = `${3500 + Math.floor(Math.random() * 100)}-${String(1 + Math.floor(Math.random() * 12)).padStart(2, "0")}-01`
    const vieja = clave()
    const { error } = await admin()
      .from("gastos")
      .insert({
        clave: vieja,
        proveedor: "anthropic",
        paso: "prueba",
        mes,
        estimado_micro: 1,
        creado_en: new Date(Date.now() - 25 * 3_600_000).toISOString(),
      })
    if (error) throw error
    expect(await barrerGastos(admin())).toBeGreaterThanOrEqual(1)
    const { data } = await admin().from("gastos").select("estado").eq("clave", vieja).single()
    expect(data?.estado).toBe("vencido")
  })
})
