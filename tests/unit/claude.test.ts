import Anthropic from "@anthropic-ai/sdk"
import { describe, expect, test, vi } from "vitest"
import type { LibroDeGastos } from "@/lib/gasto/pagar"
import { esRechazoProbado, pedirPagando, solicitudDe, usoDe } from "@/lib/ia/claude"

const SISTEMA_LARGO = "Contexto. ".repeat(600)

describe("solicitudDe", () => {
  test("uses Claude Opus 5.5, an explicit effort and no thinking parameter", () => {
    const s = solicitudDe({
      sistema: "Breve.",
      mensajes: [{ role: "user", content: "Hola" }],
      maxTokens: 512,
      esfuerzo: "low",
    })
    expect(s.model).toBe("claude-opus-5-5")
    expect(s.output_config).toEqual({ effort: "low" })
    expect(s).not.toHaveProperty("thinking")
    expect(s.system).toEqual([{ type: "text", text: "Breve." }])
  })

  test("caches a system prompt over about 1,024 tokens", () => {
    const s = solicitudDe({
      sistema: SISTEMA_LARGO,
      mensajes: [{ role: "user", content: "Hola" }],
      maxTokens: 512,
      esfuerzo: "low",
    })
    expect(s.system).toEqual([{ type: "text", text: SISTEMA_LARGO, cache_control: { type: "ephemeral" } }])
  })

  test("never asks for the 1-hour cache, which the price table does not cover", () => {
    const s = solicitudDe({
      sistema: SISTEMA_LARGO,
      mensajes: [{ role: "user", content: "Hola" }],
      maxTokens: 512,
      esfuerzo: "low",
    })
    const bloques = Array.isArray(s.system) ? s.system : []
    expect(bloques).toHaveLength(1)
    for (const bloque of bloques) expect(bloque.cache_control).not.toHaveProperty("ttl")
  })
})

describe("usoDe", () => {
  test("reads every billed kind of token from the response usage", () => {
    expect(
      usoDe({
        input_tokens: 10,
        output_tokens: 20,
        cache_creation_input_tokens: 30,
        cache_read_input_tokens: 40,
        server_tool_use: { web_search_requests: 2 },
      }),
    ).toEqual({ entrada: 10, salida: 20, escrituraDeCache: 30, lecturaDeCache: 40, busquedas: 2 })
    expect(
      usoDe({ input_tokens: 1, output_tokens: 1, cache_creation_input_tokens: null, cache_read_input_tokens: null }),
    ).toEqual({
      entrada: 1,
      salida: 1,
      escrituraDeCache: 0,
      lecturaDeCache: 0,
      busquedas: 0,
    })
  })
})

describe("esRechazoProbado", () => {
  test("a 4xx other than 408 proves nothing was charged; network failures and 5xx do not", () => {
    const de = (status: number) => Anthropic.APIError.generate(status, { error: { message: "x" } }, "x", new Headers())
    expect(esRechazoProbado(de(400))).toBe(true)
    expect(esRechazoProbado(de(429))).toBe(true)
    expect(esRechazoProbado(de(408))).toBe(false)
    expect(esRechazoProbado(de(529))).toBe(false)
    expect(esRechazoProbado(new Anthropic.APIConnectionError({ message: "caído" }))).toBe(false)
    expect(esRechazoProbado(new Error("x"))).toBe(false)
  })
})

describe("pedirPagando", () => {
  test("reserves the worst case, calls Claude once and confirms the real cost", async () => {
    const libro: LibroDeGastos = {
      reservar: vi.fn(async () => ({ estado: "reservado" as const, avisos: [] })),
      confirmar: vi.fn(async () => []),
      liberar: vi.fn(async () => {}),
    }
    const crear = vi.fn(async () => ({
      content: [{ type: "text", text: "listo" }],
      stop_reason: "end_turn",
      usage: { input_tokens: 100, output_tokens: 50, cache_creation_input_tokens: 0, cache_read_input_tokens: 0 },
    }))
    const respuesta = await pedirPagando(
      { libro, avisar: async () => {}, crear },
      { clave: "probar:1", paso: "probar", marcaId: null },
      { sistema: "Breve.", mensajes: [{ role: "user", content: "Hola" }], maxTokens: 1024, esfuerzo: "low" },
    )
    expect(respuesta).toEqual({ texto: "listo", detenido: "end_turn" })
    expect(crear).toHaveBeenCalledTimes(1)
    expect(libro.reservar).toHaveBeenCalledWith(expect.objectContaining({ clave: "probar:1", proveedor: "anthropic" }))
    // 100 in × $4 + 50 out × $20 per million, rounded up.
    expect(libro.confirmar).toHaveBeenCalledWith("probar:1", 1400)
  })
})
