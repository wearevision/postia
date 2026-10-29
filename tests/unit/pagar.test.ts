import { describe, expect, test, vi } from "vitest"
import {
  type AvisoDeTope,
  type LibroDeGastos,
  PasoYaPagado,
  type PedidoDeGasto,
  pagar,
  TopeAlcanzado,
} from "@/lib/gasto/pagar"

const PEDIDO: PedidoDeGasto = {
  clave: "escribir:p1:v1:intento-1",
  proveedor: "anthropic",
  paso: "escribir",
  estimadoMicro: 50_000,
  marcaId: null,
}

function libro(reserva: Awaited<ReturnType<LibroDeGastos["reservar"]>> = { estado: "reservado", avisos: [] }) {
  return {
    reservar: vi.fn(async () => reserva),
    confirmar: vi.fn(async (): Promise<AvisoDeTope[]> => []),
    liberar: vi.fn(async () => {}),
  } satisfies LibroDeGastos
}

function puertos(l = libro()) {
  return { libro: l, avisar: vi.fn(async () => {}), esRechazoProbado: (e: unknown) => e instanceof RangeError }
}

describe("pagar", () => {
  test("reserves, calls, confirms the real cost and returns the result", async () => {
    const p = puertos()
    const resultado = await pagar(p, PEDIDO, async () => ({ resultado: "texto", costoMicro: 12_000 }))
    expect(resultado).toBe("texto")
    expect(p.libro.reservar).toHaveBeenCalledWith(PEDIDO)
    expect(p.libro.confirmar).toHaveBeenCalledWith(PEDIDO.clave, 12_000)
  })

  test("never calls the provider when the cap refuses, and tells the owners", async () => {
    const aviso = { alcance: "global", umbral: 100 as const, gastadoMicro: 40_000_000, topeMicro: 40_000_000 }
    const p = puertos(libro({ estado: "tope_alcanzado", alcance: "global", avisos: [aviso] }))
    const llamada = vi.fn()
    await expect(pagar(p, PEDIDO, llamada)).rejects.toBeInstanceOf(TopeAlcanzado)
    expect(llamada).not.toHaveBeenCalled()
    expect(p.avisar).toHaveBeenCalledWith([aviso])
  })

  test("never calls the provider again for a key that already exists", async () => {
    const p = puertos(libro({ estado: "ya_existe", avisos: [] }))
    const llamada = vi.fn()
    await expect(pagar(p, PEDIDO, llamada)).rejects.toBeInstanceOf(PasoYaPagado)
    expect(llamada).not.toHaveBeenCalled()
  })

  test("releases the reservation only on a proven refusal and rethrows it", async () => {
    const p = puertos()
    await expect(
      pagar(p, PEDIDO, async () => {
        throw new RangeError("400")
      }),
    ).rejects.toThrow("400")
    expect(p.libro.liberar).toHaveBeenCalledWith(PEDIDO.clave)
  })

  test("keeps the reservation on a doubtful failure", async () => {
    const p = puertos()
    await expect(
      pagar(p, PEDIDO, async () => {
        throw new Error("timeout")
      }),
    ).rejects.toThrow("timeout")
    expect(p.libro.liberar).not.toHaveBeenCalled()
    expect(p.libro.confirmar).not.toHaveBeenCalled()
  })

  test("returns a paid result even when confirming fails, and logs it", async () => {
    const l = libro()
    l.confirmar.mockRejectedValueOnce(new Error("sin base"))
    const error = vi.spyOn(console, "error").mockImplementation(() => {})
    expect(await pagar(puertos(l), PEDIDO, async () => ({ resultado: 7, costoMicro: 1 }))).toBe(7)
    expect(error).toHaveBeenCalled()
    error.mockRestore()
  })

  test("a failing notice never loses a paid result", async () => {
    const aviso = { alcance: "global", umbral: 80 as const, gastadoMicro: 32_000_000, topeMicro: 40_000_000 }
    const l = libro()
    l.confirmar.mockResolvedValueOnce([aviso])
    const p = { ...puertos(l), avisar: vi.fn(async () => Promise.reject(new Error("push caído"))) }
    const error = vi.spyOn(console, "error").mockImplementation(() => {})
    expect(await pagar(p, PEDIDO, async () => ({ resultado: "ok", costoMicro: 1 }))).toBe("ok")
    expect(error).toHaveBeenCalled()
    error.mockRestore()
  })
})
