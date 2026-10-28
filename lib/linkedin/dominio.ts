// LinkedIn "little" text: every reserved character is escaped, even outside an element; a hashtag becomes the hashtag
// template. https://learn.microsoft.com/en-us/linkedin/marketing/community-management/shares/little-text-format
// (li-lms-2026-10, checked 2026-10-28).
const RESERVADOS = /[|{}@[\]()<>#\\*_~]/g
const ETIQUETA = /(^|\s)#([\p{L}\p{N}_]+)/gu

function escapar(texto: string): string {
  return texto.replace(RESERVADOS, (caracter) => `\\${caracter}`)
}

/** The signed text as LinkedIn's `commentary`: shown exactly as signed, hashtags still hashtags. */
export function aLittleText(texto: string): string {
  let salida = ""
  let desde = 0
  for (const encontrado of texto.matchAll(ETIQUETA)) {
    const inicio = (encontrado.index ?? 0) + (encontrado[1]?.length ?? 0)
    const etiqueta = encontrado[2] ?? ""
    salida += `${escapar(texto.slice(desde, inicio))}{hashtag|\\#|${escapar(etiqueta)}}`
    desde = inicio + 1 + etiqueta.length
  }
  return salida + escapar(texto.slice(desde))
}

const URN_DE_POST = /^urn:li:(share|ugcPost):[0-9]+$/

export function esUrnDePost(urn: string): boolean {
  return URN_DE_POST.test(urn)
}

export function enlaceDePost(urn: string): string {
  if (!esUrnDePost(urn)) throw new Error(`No es un post de LinkedIn: ${urn}`)
  return `https://www.linkedin.com/feed/update/${urn}/`
}

/**
 * The API docs give no number for `commentary`, only the FIELD_LENGTH_TOO_LONG error; 3000 is the limit of LinkedIn's
 * own post editor, so a longer text is stopped here instead of failing at publish time.
 */
export const LARGO_MAXIMO_DEL_TEXTO = 3000
/** Documents API (ms.date 2026-06-19): up to 100 MB and 300 pages. */
export const BYTES_MAXIMOS_DEL_DOCUMENTO = 100 * 1024 * 1024
export const PAGINAS_MAXIMAS_DEL_DOCUMENTO = 300

const LARGO_MAXIMO_DEL_TITULO = 100

/** A carousel's `content.media.title`: one line, cut after the last whole word within 100 characters. */
export function tituloDelDocumento(portada: string): string {
  const titulo = portada.replace(/\s+/g, " ").trim()
  if (titulo.length <= LARGO_MAXIMO_DEL_TITULO) return titulo
  const corte = titulo.slice(0, LARGO_MAXIMO_DEL_TITULO + 1).lastIndexOf(" ")
  if (corte <= 0) return Array.from(titulo).slice(0, LARGO_MAXIMO_DEL_TITULO).join("")
  return titulo.slice(0, corte)
}
