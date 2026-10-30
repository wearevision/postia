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
