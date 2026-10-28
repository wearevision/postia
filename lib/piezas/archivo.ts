import { createHash } from "node:crypto"

// Worker memory (128 MB) and a realistic carousel size; LinkedIn itself allows 100 MB.
export const BYTES_MAXIMOS_DEL_CARRUSEL = 30 * 1024 * 1024

const FIRMA_PDF = "%PDF-"

export type HashDeFlujo = { ok: true; sha256: string } | { ok: false; motivo: "no_es_pdf" | "demasiado_grande" }

/** Hashes a stream chunk by chunk, never holding the whole file, and counts bytes itself so the cap holds even if a header lied. */
export async function hashDeFlujo(flujo: ReadableStream<Uint8Array>, maximo: number): Promise<HashDeFlujo> {
  const hash = createHash("sha256")
  const lector = flujo.getReader()
  let total = 0
  let cabecera = ""
  try {
    for (;;) {
      const { done, value } = await lector.read()
      if (done) break
      total += value.byteLength
      if (total > maximo) return { ok: false, motivo: "demasiado_grande" }
      if (cabecera.length < FIRMA_PDF.length) {
        cabecera += new TextDecoder().decode(value.slice(0, FIRMA_PDF.length - cabecera.length))
        if (cabecera.length >= FIRMA_PDF.length && cabecera !== FIRMA_PDF) return { ok: false, motivo: "no_es_pdf" }
      }
      hash.update(value)
    }
  } finally {
    await lector.cancel()
  }
  if (cabecera !== FIRMA_PDF) return { ok: false, motivo: "no_es_pdf" }
  return { ok: true, sha256: hash.digest("hex") }
}
