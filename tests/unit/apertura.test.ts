import { describe, expect, test, vi } from "vitest"
import type { Excepcion } from "@/lib/clientes/revision"
import { EXCEPCIONES_NUEVAS, revisarApertura } from "@/lib/piezas/acciones"

const AHORA = Date.parse("2026-11-03T14:00:00Z")
const ABIERTA_EN = "2026-11-03T13:55:00.000Z"
const COPEC: Excepcion = { cliente: "Copec", alias: [], tipo: "no_nombrar", hasta: null }

function puertos(nuevas: Excepcion[], texto: string | null = "Con Copec en 2019") {
  return {
    nuevasDesde: vi.fn(async (_desde: string) => nuevas),
    texto: vi.fn(async () => texto),
  }
}

describe("revisarApertura (gate 1: exceptions marked while the piece was open)", () => {
  test("lets the signature through when nothing was marked since the page was rendered", async () => {
    const p = puertos([])
    expect(await revisarApertura(p, ABIERTA_EN, AHORA)).toEqual({ ok: true })
    expect(p.nuevasDesde).toHaveBeenCalledWith("2026-11-03T13:54:55.000Z")
  })

  test("looks five seconds before the render time, so an exception marked in the same instant still counts", async () => {
    const p = puertos([])
    await revisarApertura(p, "2026-11-03T13:55:00.250Z", AHORA)
    expect(p.nuevasDesde).toHaveBeenCalledWith("2026-11-03T13:54:55.250Z")
  })

  test("refuses when an exception marked after the render names a client in the piece", async () => {
    expect(await revisarApertura(puertos([COPEC]), ABIERTA_EN, AHORA)).toEqual({
      ok: false,
      error: EXCEPCIONES_NUEVAS,
    })
    expect(EXCEPCIONES_NUEVAS).toBe("Hay excepciones nuevas desde que abriste la pieza. Recarga para revisarlas.")
  })

  test("lets it through when the new exception is for a client the piece does not name: the verdict did not change", async () => {
    expect(await revisarApertura(puertos([COPEC], "Con Enel en 2019"), ABIERTA_EN, AHORA)).toEqual({ ok: true })
  })

  test("an exception that already ended in Chile does not refuse", async () => {
    // AHORA is 2026-11-03 in Chile.
    expect(await revisarApertura(puertos([{ ...COPEC, hasta: "2026-11-02" }]), ABIERTA_EN, AHORA)).toEqual({ ok: true })
  })

  test("refuses a render time in the future or not a timestamp, without reading anything", async () => {
    const p = puertos([COPEC])
    for (const abiertaEn of ["2026-11-03T14:00:01.000Z", "ayer", undefined, null, 5]) {
      expect(await revisarApertura(p, abiertaEn, AHORA)).toEqual({
        ok: false,
        error: "Recarga la pieza antes de firmar.",
      })
    }
    expect(p.nuevasDesde).not.toHaveBeenCalled()
  })

  test("refuses, and logs, when the exceptions or the piece cannot be read", async () => {
    const registro = vi.spyOn(console, "error").mockImplementation(() => {})
    const caida = async () => {
      throw new Error("base caída")
    }
    const noPude = { ok: false, error: "No pude revisar los clientes. Inténtalo de nuevo en un rato." }
    expect(await revisarApertura({ ...puertos([]), nuevasDesde: caida }, ABIERTA_EN, AHORA)).toEqual(noPude)
    expect(await revisarApertura({ ...puertos([COPEC]), texto: caida }, ABIERTA_EN, AHORA)).toEqual(noPude)
    expect(registro).toHaveBeenCalledWith(expect.any(String), "base caída")
    registro.mockRestore()
  })
})
