/** No 0/o or 1/l/i: Federico reads the code aloud from a WhatsApp message. */
export const ALFABETO = "23456789abcdefghjkmnpqrstuvwxyz"

export function codigoNuevo(): string {
  const azar = crypto.getRandomValues(new Uint32Array(3))
  return Array.from(azar, (n) => ALFABETO[n % ALFABETO.length]).join("")
}

export function enlaceDe(d: { url: string; cuentaTipo: "persona" | "empresa"; codigo: string }): string {
  const campana = d.cuentaTipo === "persona" ? "federico" : "wav"
  return `${d.url}?utm_source=linkedin&utm_medium=social&utm_campaign=${campana}&utm_content=${d.codigo}`
}

export function conEnlace(texto: string, enlace: string): string {
  return `${texto.trimEnd()}\n\n${enlace}`
}

export function quitarEnlace(texto: string, enlace: string): string {
  return texto
    .split("\n")
    .filter((linea) => linea.trim() !== enlace)
    .join("\n")
    .trimEnd()
}

export function llevaElEnlace(texto: string, codigo: string): boolean {
  return texto.includes(`utm_content=${codigo}`)
}
