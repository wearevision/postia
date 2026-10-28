import { describe, expect, test } from "vitest"
import { revisarAntesDeEnviar } from "@/lib/publicacion/revision"

const AHORA = Date.parse("2026-11-03T14:05:00Z")
const BASE = {
  firmaHuella: "a".repeat(64),
  versionHuella: "a".repeat(64),
  programadaPara: "2026-11-03T14:00:00Z",
  ventanaMinutos: 30,
  ruta: "api" as const,
  conexionExpira: "2026-12-27T00:00:00Z",
}

describe("revisarAntesDeEnviar", () => {
  test("goes when the piece is signed, on time and its account is connected", () => {
    expect(revisarAntesDeEnviar(BASE, AHORA)).toEqual({ ok: true })
  })
  test("sends it back to the gate when the signature is of another version", () => {
    expect(revisarAntesDeEnviar({ ...BASE, firmaHuella: "b".repeat(64) }, AHORA)).toMatchObject({
      ok: false,
      destino: "por_aprobar",
    })
  })
  test("sends it back to the gate when there is no signature", () => {
    expect(revisarAntesDeEnviar({ ...BASE, firmaHuella: null }, AHORA)).toMatchObject({
      ok: false,
      destino: "por_aprobar",
    })
  })
  test("does not go late: back to the gate past its window", () => {
    expect(revisarAntesDeEnviar(BASE, Date.parse("2026-11-03T14:31:00Z"))).toMatchObject({
      ok: false,
      destino: "por_aprobar",
    })
  })
  test("goes by hand when the account is a hand account", () => {
    expect(revisarAntesDeEnviar({ ...BASE, ruta: "a_mano" }, AHORA)).toMatchObject({ ok: false, destino: "a_mano" })
  })
  test("goes by hand when the connection expired or is missing", () => {
    expect(revisarAntesDeEnviar({ ...BASE, conexionExpira: "2026-11-01T00:00:00Z" }, AHORA)).toMatchObject({
      ok: false,
      destino: "a_mano",
    })
    expect(revisarAntesDeEnviar({ ...BASE, conexionExpira: null }, AHORA)).toMatchObject({
      ok: false,
      destino: "a_mano",
    })
  })
})
