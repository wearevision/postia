import { describe, expect, test } from "vitest"
import {
  costoDeVoyage,
  costoReal,
  enDolares,
  estimarCosto,
  estimarVoyage,
  type ModeloClaude,
} from "@/lib/gasto/precios"

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

  test("rounds a single token at any price up to at least one micro-dollar", () => {
    const uno = { entrada: 0, salida: 0, escrituraDeCache: 0, lecturaDeCache: 0, busquedas: 0 }
    for (const modelo of ["claude-opus-5-5", "claude-sonnet-5-5"] as const) {
      for (const tipo of ["entrada", "salida", "escrituraDeCache", "lecturaDeCache"] as const) {
        expect(costoReal(modelo, { ...uno, [tipo]: 1 }), `${modelo} ${tipo}`).toBeGreaterThanOrEqual(1)
      }
    }
  })

  test("adds US$0.01 per web search", () => {
    expect(
      costoReal("claude-sonnet-5-5", { entrada: 0, salida: 0, escrituraDeCache: 0, lecturaDeCache: 0, busquedas: 3 }),
    ).toBe(30_000)
  })
})

describe("estimarCosto", () => {
  test("takes the worst case: every input token written to cache and the whole max_tokens", () => {
    // 2,000 characters ≈ 1,000 tokens at $5 + 1,000 output at $20.
    expect(estimarCosto("claude-opus-5-5", { caracteresDeEntrada: 2000, maxTokens: 1000, busquedas: 0 })).toBe(
      5000 + 20_000,
    )
  })

  test("estimates a call with searches: each search adds its fee and re-reads the average context of the loop", () => {
    const sin = estimarCosto("claude-opus-5-5", { caracteresDeEntrada: 2000, maxTokens: 8000, busquedas: 0 })
    const con = estimarCosto("claude-opus-5-5", { caracteresDeEntrada: 2000, maxTokens: 8000, busquedas: 8 })
    // 8 × (US$0.01 fee + 30,000 tokens × ceil(9 / 2) = 5 at the Opus cache-write price of US$5/M = US$0.75)
    expect(con - sin).toBe(8 * (10_000 + 5 * 150_000))
    const una = estimarCosto("claude-opus-5-5", { caracteresDeEntrada: 2000, maxTokens: 8000, busquedas: 1 })
    expect(una - sin).toBe(10_000 + 150_000)
  })

  test("an 8-search Opus estimate stays above a loop that re-reads a growing 30,000-token-per-search context", () => {
    const caracteres = 4000
    const estimado = estimarCosto("claude-opus-5-5", { caracteresDeEntrada: caracteres, maxTokens: 8000, busquedas: 8 })
    // Pessimistic: each of the 8 server iterations re-reads the prompt plus every result so far, all billed as cache
    // writes (the dearest input), and the whole max_tokens is produced.
    let contexto = 0
    for (let i = 1; i <= 8; i++) contexto += caracteres / 2 + 30_000 * i
    const real = costoReal("claude-opus-5-5", {
      entrada: 0,
      salida: 8000,
      escrituraDeCache: contexto,
      lecturaDeCache: 0,
      busquedas: 8,
    })
    expect(estimado).toBeGreaterThan(real)
  })

  test("the estimate with searches stays above a realistic real cost", () => {
    const estimado = estimarCosto("claude-opus-5-5", { caracteresDeEntrada: 4000, maxTokens: 16_000, busquedas: 8 })
    const real = costoReal("claude-opus-5-5", {
      entrada: 60_000,
      salida: 6_000,
      escrituraDeCache: 0,
      lecturaDeCache: 0,
      busquedas: 8,
    })
    expect(estimado).toBeGreaterThan(real)
  })

  test("covers every input token as a cache write and the whole max_tokens, for any size and model", () => {
    const modelos: ModeloClaude[] = ["claude-opus-5-5", "claude-sonnet-5-5"]
    for (const modelo of modelos) {
      for (const caracteres of [0, 1, 2, 3, 999, 4097, 123_457]) {
        for (const maxTokens of [1, 7, 1024, 64_000]) {
          const estimado = estimarCosto(modelo, { caracteresDeEntrada: caracteres, maxTokens, busquedas: 0 })
          const peor = costoReal(modelo, {
            entrada: 0,
            salida: maxTokens,
            escrituraDeCache: Math.ceil(caracteres / 2),
            lecturaDeCache: 0,
            busquedas: 0,
          })
          expect(estimado, `${modelo} ${caracteres} ${maxTokens}`).toBeGreaterThanOrEqual(peor)
        }
      }
    }
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
    expect(enDolares(1_000_000_000)).toBe("US$1.000,00")
    expect(enDolares(0)).toBe("US$0,00")
  })
})

describe("Voyage", () => {
  test("charges US$0.06 per million tokens, rounded up to a whole micro-dollar", () => {
    expect(costoDeVoyage(1_000_000)).toBe(60_000)
    expect(costoDeVoyage(1)).toBe(1)
    expect(costoDeVoyage(0)).toBe(0)
  })

  test("estimates two tokens per character, which stays above the real count", () => {
    expect(estimarVoyage(1_000)).toBe(costoDeVoyage(2_000))
  })
})
