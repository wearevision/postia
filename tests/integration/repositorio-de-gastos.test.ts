import { randomUUID } from "node:crypto"
import { describe, expect, test, vi } from "vitest"
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
  test("returns how many reservations it expired", async () => {
    expect(typeof (await barrerGastos(admin()))).toBe("number")
  })
})
