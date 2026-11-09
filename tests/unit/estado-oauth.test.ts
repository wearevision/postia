import { describe, expect, test } from "vitest"
import {
  desempacarEstado,
  desempacarEstadoDeEstudioWav,
  empacarEstado,
  empacarEstadoDeEstudioWav,
  estadoCoincide,
  nuevoEstado,
} from "@/lib/linkedin/estado-oauth"

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

describe("OAuth state of «Estudio WAV»", () => {
  const ESTADO = "e".repeat(64)

  test("carries the purpose and the account next to the state", () => {
    expect(desempacarEstadoDeEstudioWav(empacarEstadoDeEstudioWav(ESTADO, CUENTA, "analiticas"))).toEqual({
      estado: ESTADO,
      cuenta: CUENTA,
      proposito: "analiticas",
    })
    expect(desempacarEstadoDeEstudioWav(empacarEstadoDeEstudioWav(ESTADO, CUENTA, "pagina"))).toEqual({
      estado: ESTADO,
      cuenta: CUENTA,
      proposito: "pagina",
    })
  })

  test("a cookie from before the purpose existed is a page connection", () => {
    expect(desempacarEstadoDeEstudioWav(empacarEstado(ESTADO, CUENTA))).toEqual({
      estado: ESTADO,
      cuenta: CUENTA,
      proposito: "pagina",
    })
  })

  test("an unknown purpose or a malformed cookie is refused", () => {
    expect(desempacarEstadoDeEstudioWav(`${ESTADO}:${CUENTA}:publicar`)).toBeNull()
    expect(desempacarEstadoDeEstudioWav(`${ESTADO}:no-es-uuid:analiticas`)).toBeNull()
    expect(desempacarEstadoDeEstudioWav(undefined)).toBeNull()
  })
})
