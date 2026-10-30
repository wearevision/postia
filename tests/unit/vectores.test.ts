import { describe, expect, test } from "vitest"
import { aLiteral, deLiteral, enlaceNormalizado, similitud } from "@/lib/mapa/vectores"

describe("vector literals", () => {
  test("round-trip through the pgvector text form", () => {
    expect(aLiteral([0.5, -1, 2])).toBe("[0.5,-1,2]")
    expect(deLiteral("[0.5,-1,2]")).toEqual([0.5, -1, 2])
  })

  test("refuse text that is not a list of numbers", () => {
    expect(() => deLiteral('["a"]')).toThrow()
  })
})

describe("similitud", () => {
  test("is the cosine of the angle, whatever the lengths", () => {
    expect(similitud([1, 0], [2, 0])).toBeCloseTo(1)
    expect(similitud([1, 0], [0, 3])).toBeCloseTo(0)
    expect(similitud([1, 1], [1, 0])).toBeCloseTo(Math.SQRT1_2)
  })
})

describe("enlaceNormalizado", () => {
  test("drops protocol, www, fragment, tracking parameters and a trailing slash, and sorts the rest", () => {
    expect(enlaceNormalizado("https://www.Medio.cl/nota/?utm_source=x&b=2&a=1&fbclid=z#arriba")).toBe(
      "medio.cl/nota?a=1&b=2",
    )
    expect(enlaceNormalizado("http://medio.cl/")).toBe("medio.cl/")
  })

  test("refuses something that is not a web link", () => {
    expect(() => enlaceNormalizado("ftp://medio.cl/x")).toThrow(/enlace web/)
  })
})
