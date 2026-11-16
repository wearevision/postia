/** No 0/o or 1/l/i: Federico reads the code aloud from a WhatsApp message. */
export const ALFABETO = "23456789abcdefghjkmnpqrstuvwxyz"

export function codigoNuevo(): string {
  const azar = crypto.getRandomValues(new Uint32Array(3))
  return Array.from(azar, (n) => ALFABETO[n % ALFABETO.length]).join("")
}

/**
 * The page plus the code alone: LinkedIn shows the whole URL, and four UTM params made it unreadable. Account and
 * network come back from the code, which belongs to one piece. Links signed before 2026-11-16 carry
 * `utm_content=<code>` instead; the helpers below accept both.
 */
export function enlaceDe(d: { url: string; codigo: string }): string {
  return `${d.url}?ref=${d.codigo}`
}

function limpio(codigo: string): string {
  return codigo.replace(/[^a-z0-9]/g, "")
}

export function conEnlace(texto: string, enlace: string): string {
  return `${texto.trimEnd()}\n\n${enlace}`
}

/**
 * Removes every link carrying this code, wherever it ended up: a correction may have moved it into a sentence or
 * edited its page. A line left empty by the removal goes too, and so do the blank lines left at the end.
 */
export function quitarEnlace(texto: string, codigo: string): string {
  const conCodigo = new RegExp(`[ \\t]*\\S*[?&](?:ref|utm_content)=${limpio(codigo)}\\S*`, "g")
  return texto
    .split("\n")
    .flatMap((linea) => {
      const sin = linea.replace(conCodigo, "")
      if (sin === linea) return [linea]
      if (sin.trim() === "") return []
      return [`${linea.match(/^[ \t]*/)?.[0] ?? ""}${sin.trim()}`]
    })
    .join("\n")
    .trimEnd()
}

/** The same link must start with the destination page and carry the code: the code alone could sit on another page. */
export function llevaElEnlace(texto: string, url: string, codigo: string): boolean {
  const conCodigo = new RegExp(`[?&](?:ref|utm_content)=${limpio(codigo)}(?![a-z0-9])`)
  return texto.split(/\s+/).some((palabra) => palabra.startsWith(`${url}?`) && conCodigo.test(palabra))
}
