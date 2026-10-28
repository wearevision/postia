import { createHash } from "node:crypto"

export interface ContenidoDeVersion {
  formato: "texto" | "carrusel_pdf"
  titulo: string | null
  archivoSha256: string | null
  texto: string
}

/** Same normalization as public.normalizar_texto: CRLF to LF, trailing ASCII whitespace off (explicit class, not \s). */
export function normalizarTexto(texto: string): string {
  return texto.replace(/\r\n/g, "\n").replace(/[ \t\n\r\f\v]+$/, "")
}

/** Mirror of public.poner_huella. The database is the authority; this exists to compare and to test. */
export function huellaDe(c: ContenidoDeVersion): string {
  const separador = Buffer.from([0])
  return createHash("sha256")
    .update(
      Buffer.concat([
        Buffer.from(normalizarTexto(c.texto), "utf8"),
        separador,
        Buffer.from(c.titulo ?? "", "utf8"),
        separador,
        Buffer.from(c.archivoSha256 ?? "", "utf8"),
        separador,
        Buffer.from(c.formato, "utf8"),
      ]),
    )
    .digest("hex")
}

export function sha256(datos: Uint8Array): string {
  return createHash("sha256").update(datos).digest("hex")
}
