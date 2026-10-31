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
  test("renews itself while its refresh token outlives its access token", () => {
    expect(
      estadoDeConexion(new Date(AHORA + 30 * DIA).toISOString(), AHORA, new Date(AHORA + 300 * DIA).toISOString()),
    ).toEqual({ estado: "se_renueva", dias: 300 })
  })
  test("an access token within 10 days counts down like any other: the daily refresh should have run by then", () => {
    expect(
      estadoDeConexion(new Date(AHORA + 5 * DIA).toISOString(), AHORA, new Date(AHORA + 300 * DIA).toISOString()),
    ).toEqual({ estado: "por_vencer", dias: 5 })
  })
  test("is about to expire 14 days before its refresh token runs out", () => {
    expect(
      estadoDeConexion(new Date(AHORA + 12 * DIA).toISOString(), AHORA, new Date(AHORA + 14 * DIA).toISOString()),
    ).toEqual({ estado: "por_vencer", dias: 14 })
  })
  test("an access token that ran out is expired even with a refresh token", () => {
    expect(estadoDeConexion(new Date(AHORA).toISOString(), AHORA, new Date(AHORA + 300 * DIA).toISOString())).toEqual({
      estado: "vencida",
    })
  })
  test("a refresh token that ends before the access token changes nothing", () => {
    expect(
      estadoDeConexion(new Date(AHORA + 30 * DIA).toISOString(), AHORA, new Date(AHORA + 10 * DIA).toISOString()),
    ).toEqual({ estado: "conectada", dias: 30 })
  })
})
