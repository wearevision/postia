import { describe, expect, test } from "vitest"
import { costoReal, enDolares, estimarCosto } from "@/lib/gasto/precios"

describe("costoReal", () => {
  test("prices each kind of token for Claude Opus 5.5 and rounds up to the micro-dollar", () => {
    // 1,000 in × $4 + 500 out × $20 + 2,000 written × $5 + 10,000 read × $0.20, per million tokens.
    expect(
      costoReal("claude-opus-5-5", {
        entrada: 1000,
        salida: 500,
        escrituraDeCache: 2000,
        lecturaDeCache: 10_000,
        busquedas: 0,
      }),
    ).toBe(4000 + 10_000 + 10_000 + 2000)
    expect(
      costoReal("claude-opus-5-5", { entrada: 1, salida: 0, escrituraDeCache: 0, lecturaDeCache: 1, busquedas: 0 }),
    ).toBe(5)
  })

  test("adds US$0.01 per web search", () => {
    expect(
      costoReal("claude-sonnet-5-5", { entrada: 0, salida: 0, escrituraDeCache: 0, lecturaDeCache: 0, busquedas: 3 }),
    ).toBe(30_000)
  })
})

describe("estimarCosto", () => {
  test("takes the worst case: every input token written to cache, the whole max_tokens, every search", () => {
    // 2,000 characters ≈ 1,000 tokens at $5 + 1,000 output at $20 + 2 searches.
    expect(estimarCosto("claude-opus-5-5", { caracteresDeEntrada: 2000, maxTokens: 1000, busquedas: 2 })).toBe(
      5000 + 20_000 + 20_000,
    )
  })

  test("is never below the real cost of the same request", () => {
    const estimado = estimarCosto("claude-opus-5-5", { caracteresDeEntrada: 4000, maxTokens: 2000, busquedas: 0 })
    const real = costoReal("claude-opus-5-5", {
      entrada: 1200,
      salida: 2000,
      escrituraDeCache: 0,
      lecturaDeCache: 0,
      busquedas: 0,
    })
    expect(estimado).toBeGreaterThanOrEqual(real)
  })
})

describe("enDolares", () => {
  test("writes micro-dollars as Chilean-formatted dollars", () => {
    expect(enDolares(40_000_000)).toBe("US$40,00")
    expect(enDolares(1_234_567)).toBe("US$1,23")
  })
})
