import { describe, expect, test } from "vitest"
import { desempacarEstado, empacarEstado, estadoCoincide, nuevoEstado } from "@/lib/linkedin/estado-oauth"

const CUENTA = "8c0a2f6e-1b2c-4d3e-9f40-123456789abc"

describe("OAuth state", () => {
  test("a new state is 64 hex characters and unique", () => {
    expect(nuevoEstado()).toMatch(/^[0-9a-f]{64}$/)
    expect(nuevoEstado()).not.toBe(nuevoEstado())
  })
  test("matches only the same value", () => {
    expect(estadoCoincide("abc", "abc")).toBe(true)
    expect(estadoCoincide("abc", "abd")).toBe(false)
    expect(estadoCoincide(undefined, "abc")).toBe(false)
  })
  test("packs the account with the state and refuses anything malformed", () => {
    expect(desempacarEstado(empacarEstado("e".repeat(64), CUENTA))).toEqual({ estado: "e".repeat(64), cuenta: CUENTA })
    expect(desempacarEstado("e:no-es-uuid")).toBeNull()
    expect(desempacarEstado(undefined)).toBeNull()
  })
})
