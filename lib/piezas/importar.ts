import { Falla } from "@/lib/dominio/falla"
import { CARACTERES_MAXIMOS_DEL_TEXTO } from "./limites"

export interface EntradaDeCopy {
  titulo: string
  pdf: string
  guia: string
  texto: string
}

// LinkedIn's document title limit (versiones.titulo check).
const TITULO_MAXIMO = 100

/** Reads WR3's `copy.md`: `## N. Title`, then `PDF:` and `Guía:` lines, then the post text, entries split by `---`. */
export function leerCopy(markdown: string): EntradaDeCopy[] {
  const entradas = markdown
    .split(/^## /m)
    .slice(1)
    .map((bloque) => leerEntrada(bloque.replace(/\n---\s*$/, "")))
  if (entradas.length === 0) throw new Falla("El copy no tiene ninguna entrada («## N. Título»).")
  return entradas
}

function leerEntrada(bloque: string): EntradaDeCopy {
  const [encabezado = "", ...resto] = bloque.split("\n")
  const titulo = encabezado.replace(/^\d+\.\s*/, "").trim()
  if (!titulo) throw new Falla("Hay una entrada sin título.")
  if ([...titulo].length > TITULO_MAXIMO) {
    throw new Falla(`«${titulo}»: el título pasa los ${TITULO_MAXIMO} caracteres que acepta LinkedIn.`)
  }
  const lineas = resto
  const pdf = valorDe(lineas, "PDF")
  if (!pdf) throw new Falla(`«${titulo}»: falta la línea «PDF:».`)
  const guia = valorDe(lineas, "Guía")
  if (!guia) throw new Falla(`«${titulo}»: falta la línea «Guía:» con la URL.`)
  const cuerpo = lineas
    .filter((linea) => !/^(PDF|Guía):/.test(linea))
    .join("\n")
    .trim()
  const texto = cuerpo.replaceAll("[link]", guia)
  if (!texto) throw new Falla(`«${titulo}»: no tiene texto.`)
  if (texto.includes("[link]")) throw new Falla(`«${titulo}»: quedó un [link] sin reemplazar.`)
  if ([...texto].length > CARACTERES_MAXIMOS_DEL_TEXTO) {
    throw new Falla(`«${titulo}»: el texto pasa los ${CARACTERES_MAXIMOS_DEL_TEXTO} caracteres.`)
  }
  return { titulo, pdf, guia, texto }
}

function valorDe(lineas: string[], clave: string): string | undefined {
  const linea = lineas.find((l) => l.startsWith(`${clave}:`))
  return linea?.slice(clave.length + 1).trim() || undefined
}
