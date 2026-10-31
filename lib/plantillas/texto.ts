import type { Carrusel, Lamina } from "./laminas"

function textos(l: Lamina): string[] {
  switch (l.tipo) {
    case "portada":
      return [l.titulo, l.bajada]
    case "punto":
      return [l.titulo, l.cuerpo]
    case "lista":
      return [l.titulo, ...l.items]
    case "comparacion":
      return [l.titulo, ...l.columnas, ...l.filas.flat()]
    case "cifra":
      return [l.cifra, l.etiqueta, l.cuerpo]
    case "barras":
      return [l.titulo, ...l.barras.map((b) => b.etiqueta)]
    case "frase":
      return [l.titulo, l.nota]
    case "cierre":
      return [l.titulo, l.cuerpo, l.enlace]
  }
}

/** Every word the slides publish, one line each: the client review reads it like the post's text (D13). */
export function textoDeLasLaminas(c: Carrusel): string {
  return [c.antetitulo, ...c.laminas.flatMap(textos)].join("\n")
}

/**
 * Every string inside a stored design, whatever its shape: gate 1 reviews these even when the design no longer
 * parses with today's templates, so no slide word (numero, barras.valor included) skips the client review (D13).
 */
export function textosDelDiseno(diseno: unknown): string[] {
  if (typeof diseno === "string") return [diseno]
  if (Array.isArray(diseno)) return diseno.flatMap(textosDelDiseno)
  if (diseno !== null && typeof diseno === "object") return Object.values(diseno).flatMap(textosDelDiseno)
  return []
}
