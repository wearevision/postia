import { describe, expect, test } from "vitest"
import { BYTES_MAXIMOS_DEL_CARRUSEL, hashDeFlujo } from "@/lib/piezas/archivo"
import { sha256 } from "@/lib/piezas/huella"

function flujo(...trozos: Uint8Array[]): ReadableStream<Uint8Array> {
  return new ReadableStream({
    start(controlador) {
      for (const t of trozos) controlador.enqueue(t)
      controlador.close()
    },
  })
}

const texto = (s: string) => new TextEncoder().encode(s)

describe("hashDeFlujo", () => {
  test("hashes a PDF delivered in several chunks like the whole file", async () => {
    const entero = texto("%PDF-1.4\nhola mundo")
    const r = await hashDeFlujo(flujo(entero.slice(0, 3), entero.slice(3, 9), entero.slice(9)), 1000)
    expect(r).toEqual({ ok: true, sha256: sha256(entero) })
  })

  test("refuses a stream that does not start with %PDF-", async () => {
    expect(await hashDeFlujo(flujo(texto("<html>no soy pdf</html>")), 1000)).toEqual({ ok: false, motivo: "no_es_pdf" })
  })

  test("refuses a stream shorter than the PDF signature", async () => {
    expect(await hashDeFlujo(flujo(texto("%PD")), 1000)).toEqual({ ok: false, motivo: "no_es_pdf" })
  })

  test("refuses a stream that grows past the cap even if its header said less", async () => {
    const trozo = new Uint8Array(600)
    trozo.set(texto("%PDF-"))
    expect(await hashDeFlujo(flujo(trozo, new Uint8Array(600)), 1000)).toEqual({
      ok: false,
      motivo: "demasiado_grande",
    })
  })

  test("accepts a stream of exactly the cap", async () => {
    const exacto = new Uint8Array(1000)
    exacto.set(texto("%PDF-"))
    expect((await hashDeFlujo(flujo(exacto), 1000)).ok).toBe(true)
  })

  test("the carousel cap is 30 MB", () => {
    expect(BYTES_MAXIMOS_DEL_CARRUSEL).toBe(30 * 1024 * 1024)
  })
})
