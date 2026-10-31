import { NOMBRE_DEL_TIPO } from "@/lib/plantillas/campos"
import { LIMITES, TIPOS_DE_LAMINA, type TipoDeLamina } from "@/lib/plantillas/laminas"
import { type FormatoDeIdea, PASOS_DE_TEXTO, type PasoDeEsqueleto } from "./propuestas"

// Client-safe: an idea's skeleton as the one-line-per-beat text Federico reads and edits («Portada: …»).

const LARGO_DEL_PASO = 400

export function lineaDelPaso(paso: PasoDeEsqueleto): string {
  return "tipo" in paso ? `${NOMBRE_DEL_TIPO[paso.tipo]}: ${paso.idea}` : paso.idea
}

export function textoDelEsqueleto(esqueleto: readonly PasoDeEsqueleto[]): string {
  return esqueleto.map(lineaDelPaso).join("\n")
}

const sinTildes = (s: string) => s.normalize("NFD").replace(/\p{M}/gu, "").toLowerCase().trim()

const TIPO_POR_NOMBRE = new Map<string, TipoDeLamina>(
  TIPOS_DE_LAMINA.flatMap((t) => [
    [sinTildes(NOMBRE_DEL_TIPO[t]), t],
    [t, t],
  ]),
)

const NOMBRES = TIPOS_DE_LAMINA.map((t) => NOMBRE_DEL_TIPO[t])
const LISTA_DE_NOMBRES = `${NOMBRES.slice(0, -1).join(", ")} o ${NOMBRES.at(-1)}`

export type LecturaDeEsqueleto = { ok: true; esqueleto: PasoDeEsqueleto[] } | { ok: false; error: string }

/** The edited text back to beats, with the same rules a proposed series follows (lib/series/propuestas.ts). */
export function leerEsqueleto(formato: FormatoDeIdea, texto: string): LecturaDeEsqueleto {
  const lineas = texto
    .split("\n")
    .map((l) => l.trim())
    .filter((l) => l.length > 0)
  const largo = lineas.findIndex((l) => [...l].length > LARGO_DEL_PASO)
  if (largo >= 0) return { ok: false, error: `La línea ${largo + 1} pasa los ${LARGO_DEL_PASO} caracteres.` }
  if (formato === "texto") {
    if (lineas.length < PASOS_DE_TEXTO.minimo || lineas.length > PASOS_DE_TEXTO.maximo)
      return { ok: false, error: `El post lleva de ${PASOS_DE_TEXTO.minimo} a ${PASOS_DE_TEXTO.maximo} pasos.` }
    return { ok: true, esqueleto: lineas.map((idea) => ({ idea })) }
  }
  const pasos: PasoDeEsqueleto[] = []
  for (const [i, linea] of lineas.entries()) {
    const dosPuntos = linea.indexOf(":")
    const tipo = dosPuntos > 0 ? TIPO_POR_NOMBRE.get(sinTildes(linea.slice(0, dosPuntos))) : undefined
    const idea = dosPuntos > 0 ? linea.slice(dosPuntos + 1).trim() : ""
    if (!tipo || idea.length === 0)
      return { ok: false, error: `La línea ${i + 1} no dice qué lámina es (${LISTA_DE_NOMBRES}).` }
    pasos.push({ tipo, idea })
  }
  const { minimo, maximo } = LIMITES.carrusel
  if (pasos.length < minimo || pasos.length > maximo)
    return { ok: false, error: `El carrusel lleva de ${minimo} a ${maximo} láminas.` }
  const [primero, ultimo] = [pasos[0], pasos.at(-1)]
  if (
    !primero ||
    !("tipo" in primero) ||
    primero.tipo !== "portada" ||
    !ultimo ||
    !("tipo" in ultimo) ||
    ultimo.tipo !== "cierre"
  )
    return { ok: false, error: "El carrusel empieza con la Portada y termina con el Cierre." }
  return { ok: true, esqueleto: pasos }
}
