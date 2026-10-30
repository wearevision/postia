// @vitest-environment node
import { describe, expect, test, vi } from "vitest"
import type { LibroDeGastos } from "@/lib/gasto/pagar"
import { PasoYaPagado } from "@/lib/gasto/pagar"
import { costoDeVoyage, estimarVoyage } from "@/lib/gasto/precios"
import {
  DIMENSIONES,
  ErrorDeVoyage,
  embeberPagando,
  esRechazoProbadoDeVoyage,
  llamarVoyageReal,
  lotes,
} from "@/lib/ia/voyage"

const vector = (n: number) => new Array<number>(DIMENSIONES).fill(n)

function libroQueAcepta(): LibroDeGastos & {
  reservas: unknown[]
  confirmados: [string, number][]
  liberados: string[]
} {
  const reservas: unknown[] = []
  const confirmados: [string, number][] = []
  const liberados: string[] = []
  return {
    reservas,
    confirmados,
    liberados,
    reservar: async (p) => {
      reservas.push(p)
      return { estado: "reservado", avisos: [] }
    },
    confirmar: async (clave, real) => {
      confirmados.push([clave, real])
      return []
    },
    liberar: async (clave) => {
      liberados.push(clave)
    },
  }
}

describe("lotes", () => {
  test("splits by 128 texts and by 150,000 characters, keeping order", () => {
    const muchos = Array.from({ length: 300 }, (_, i) => `t${i}`)
    expect(lotes(muchos).map((l) => l.length)).toEqual([128, 128, 44])
    const largos = ["a".repeat(100_000), "b".repeat(100_000), "c"]
    expect(lotes(largos).map((l) => l.map((t) => t[0]))).toEqual([["a"], ["b", "c"]])
  })
})

describe("llamarVoyageReal", () => {
  test("posts voyage-4 document embeddings at 1,024 dimensions and returns them in input order", async () => {
    const fetchFalso = vi.fn(async () =>
      Response.json({
        data: [
          { embedding: vector(2), index: 1 },
          { embedding: vector(1), index: 0 },
        ],
        usage: { total_tokens: 7 },
      }),
    )
    const llamar = llamarVoyageReal({ VOYAGE_API_KEY: "llave" }, fetchFalso)
    expect(await llamar(["uno", "dos"])).toEqual({ vectores: [vector(1), vector(2)], tokens: 7 })
    const [url, init] = fetchFalso.mock.calls[0] as unknown as [string, RequestInit]
    expect(url).toBe("https://api.voyageai.com/v1/embeddings")
    expect(new Headers(init.headers).get("authorization")).toBe("Bearer llave")
    expect(JSON.parse(String(init.body))).toEqual({
      input: ["uno", "dos"],
      model: "voyage-4",
      input_type: "document",
      output_dimension: 1024,
      truncation: true,
    })
  })

  test("turns an HTTP error into ErrorDeVoyage with its status", async () => {
    const llamar = llamarVoyageReal({ VOYAGE_API_KEY: "llave" }, async () =>
      Response.json({ detail: "Rate limit" }, { status: 429 }),
    )
    await expect(llamar(["uno"])).rejects.toMatchObject({ name: "ErrorDeVoyage", status: 429 })
  })

  test("refuses an answer with a vector of the wrong size", async () => {
    const llamar = llamarVoyageReal({ VOYAGE_API_KEY: "llave" }, async () =>
      Response.json({ data: [{ embedding: [1, 2], index: 0 }], usage: { total_tokens: 1 } }),
    )
    await expect(llamar(["uno"])).rejects.toThrow()
  })

  test("fails before calling when the key is missing", () => {
    expect(() => llamarVoyageReal({}, vi.fn())).toThrow(/VOYAGE_API_KEY/)
  })
})

describe("esRechazoProbadoDeVoyage", () => {
  test("only a 4xx other than 408 proves nothing was billed", () => {
    expect(esRechazoProbadoDeVoyage(new ErrorDeVoyage(429, ""))).toBe(true)
    expect(esRechazoProbadoDeVoyage(new ErrorDeVoyage(400, ""))).toBe(true)
    expect(esRechazoProbadoDeVoyage(new ErrorDeVoyage(408, ""))).toBe(false)
    expect(esRechazoProbadoDeVoyage(new ErrorDeVoyage(500, ""))).toBe(false)
    expect(esRechazoProbadoDeVoyage(new TypeError("fetch failed"))).toBe(false)
  })
})

describe("embeberPagando", () => {
  test("pays each batch under its own key, charged to General, at the real token cost", async () => {
    const libro = libroQueAcepta()
    const llamar = vi.fn(async (textos: string[]) => ({ vectores: textos.map(() => vector(0)), tokens: 10 }))
    const textos = Array.from({ length: 130 }, (_, i) => `texto ${i}`)
    const vectores = await embeberPagando({ libro, avisar: vi.fn(), llamar }, { clave: "k", paso: "mapa" }, textos)
    expect(vectores).toHaveLength(130)
    expect(libro.reservas).toEqual([
      expect.objectContaining({ clave: "k:0", proveedor: "voyage", paso: "mapa", marcaId: null }),
      expect.objectContaining({ clave: "k:1", proveedor: "voyage", paso: "mapa", marcaId: null }),
    ])
    const primerLote = textos.slice(0, 128).join("").length
    expect(libro.reservas[0]).toMatchObject({ estimadoMicro: estimarVoyage(primerLote) })
    expect(libro.confirmados).toEqual([
      ["k:0", costoDeVoyage(10)],
      ["k:1", costoDeVoyage(10)],
    ])
  })

  test("refuses an empty text before spending", async () => {
    const libro = libroQueAcepta()
    await expect(
      embeberPagando({ libro, avisar: vi.fn(), llamar: vi.fn() }, { clave: "k", paso: "mapa" }, ["ok", "  "]),
    ).rejects.toThrow(/vacío/)
    expect(libro.reservas).toEqual([])
  })

  test("returns nothing and spends nothing for no texts", async () => {
    const libro = libroQueAcepta()
    expect(await embeberPagando({ libro, avisar: vi.fn(), llamar: vi.fn() }, { clave: "k", paso: "m" }, [])).toEqual([])
    expect(libro.reservas).toEqual([])
  })

  test("releases the reservation when Voyage refused with a 4xx", async () => {
    const libro = libroQueAcepta()
    const llamar = vi.fn(async () => {
      throw new ErrorDeVoyage(429, "Rate limit")
    })
    await expect(embeberPagando({ libro, avisar: vi.fn(), llamar }, { clave: "k", paso: "m" }, ["a"])).rejects.toThrow()
    expect(libro.liberados).toEqual(["k:0"])
  })

  test("never calls Voyage for a batch key already paid", async () => {
    const libro = { ...libroQueAcepta(), reservar: async () => ({ estado: "ya_existe" as const, avisos: [] }) }
    const llamar = vi.fn()
    await expect(embeberPagando({ libro, avisar: vi.fn(), llamar }, { clave: "k", paso: "m" }, ["a"])).rejects.toThrow(
      PasoYaPagado,
    )
    expect(llamar).not.toHaveBeenCalled()
  })
})
