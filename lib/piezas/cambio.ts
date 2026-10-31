/** What public.version_nueva_cae_firma writes on the piece when a new version drops its signature. */
export const MOTIVO_DE_FIRMA_CAIDA = "Cambió el texto o el archivo: hay que firmar de nuevo."

export interface ContenidoComparable {
  texto: string
  titulo: string | null
  archivoRuta: string | null
}

export interface CambioDeVersion {
  texto: { nuevas: number; quitadas: number; soloElOrden: boolean } | null
  titulo: boolean
  archivo: boolean
}

function lineas(texto: string): string[] {
  return texto
    .replace(/\r\n/g, "\n")
    .split("\n")
    .map((linea) => linea.trimEnd())
    .filter((linea) => linea !== "")
}

function cambioDelTexto(anterior: string, actual: string): CambioDeVersion["texto"] {
  const antes = lineas(anterior)
  const ahora = lineas(actual)
  if (antes.join("\n") === ahora.join("\n")) return null
  const restantes = new Map<string, number>()
  for (const linea of antes) restantes.set(linea, (restantes.get(linea) ?? 0) + 1)
  let nuevas = 0
  for (const linea of ahora) {
    const quedan = restantes.get(linea) ?? 0
    if (quedan > 0) restantes.set(linea, quedan - 1)
    else nuevas++
  }
  const quitadas = [...restantes.values()].reduce((suma, quedan) => suma + quedan, 0)
  return { nuevas, quitadas, soloElOrden: nuevas === 0 && quitadas === 0 }
}

export function cambioEntreVersiones(anterior: ContenidoComparable, actual: ContenidoComparable): CambioDeVersion {
  return {
    texto: cambioDelTexto(anterior.texto, actual.texto),
    titulo: (anterior.titulo ?? "") !== (actual.titulo ?? ""),
    archivo: (anterior.archivoRuta ?? "") !== (actual.archivoRuta ?? ""),
  }
}

const plural = (n: number, uno: string, varios: string) => `${n} ${n === 1 ? uno : varios}`

function describirTexto(texto: NonNullable<CambioDeVersion["texto"]>): string {
  if (texto.soloElOrden) return "el orden del texto"
  const partes = []
  if (texto.nuevas > 0) partes.push(plural(texto.nuevas, "línea nueva", "líneas nuevas"))
  if (texto.quitadas > 0) {
    const sola = texto.nuevas === 0
    partes.push(
      sola ? plural(texto.quitadas, "línea quitada", "líneas quitadas") : plural(texto.quitadas, "quitada", "quitadas"),
    )
  }
  return `el texto (${partes.join(" y ")})`
}

/** «Cambió el texto (1 línea nueva) y el título.», or null when nothing differs. */
export function describirCambio(cambio: CambioDeVersion): string | null {
  const cosas = [
    ...(cambio.texto ? [describirTexto(cambio.texto)] : []),
    ...(cambio.titulo ? ["el título"] : []),
    ...(cambio.archivo ? ["el archivo"] : []),
  ]
  if (cosas.length === 0) return null
  const unidas = cosas.length === 1 ? cosas[0] : `${cosas.slice(0, -1).join(", ")} y ${cosas[cosas.length - 1]}`
  return `Cambió ${unidas}.`
}

/** The version right before the latest one, if any. */
export function versionAnterior<V extends { numero: number }>(versiones: V[]): V | undefined {
  return [...versiones].sort((a, b) => b.numero - a.numero)[1]
}
