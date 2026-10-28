import { describe, expect, test } from "vitest"
import { estadoDeConexion } from "@/lib/marcas/estado-conexion"

const AHORA = Date.parse("2026-10-28T12:00:00Z")
const DIA = 86_400_000

describe("estadoDeConexion", () => {
  test("has no connection without an expiry", () => {
    expect(estadoDeConexion(null, AHORA)).toEqual({ estado: "sin_conexion" })
  })
  test("is connected with more than 14 days left, rounding days up", () => {
    expect(estadoDeConexion(new Date(AHORA + 59.5 * DIA).toISOString(), AHORA)).toEqual({
      estado: "conectada",
      dias: 60,
    })
  })
  test("is about to expire with 14 days or fewer", () => {
    expect(estadoDeConexion(new Date(AHORA + 14 * DIA).toISOString(), AHORA)).toEqual({
      estado: "por_vencer",
      dias: 14,
    })
  })
  test("is expired at or after its expiry", () => {
    expect(estadoDeConexion(new Date(AHORA).toISOString(), AHORA)).toEqual({ estado: "vencida" })
  })
})
