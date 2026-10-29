import { Falla } from "@/lib/dominio/falla"
import { LARGO_DE_SECCION, NOMBRE_DE_SECCION, type PilarDeLinea, type Seccion, type SeccionesDeLinea } from "./linea"

export interface LineaImportada {
  secciones: SeccionesDeLinea
  pilares: PilarDeLinea[]
  ignoradas: string[]
}

// Headings of the Claude Docs export, matched by their start without accents or case.
const SECCION_POR_TITULO: [string, Seccion | "pilares"][] = [
  ["de que habla", "deQueHablamos"],
  ["pilares", "pilares"],
  ["tono", "tono"],
  ["formatos", "formatos"],
  ["temas vetados", "temasVetados"],
  ["temas a vigilar", "temasAVigilar"],
  ["ejemplos", "ejemplos"],
]

function sinAcentos(texto: string): string {
  return texto.normalize("NFD").replace(/\p{M}/gu, "").toLowerCase().trim()
}

export function leerPorSemana(celda: string): number {
  const leida = /^(\d+(?:[.,]\d+)?)\s*(?:cada\s+(?:dos|2)\s+semanas)?$/i.exec(celda.trim())
  if (!leida?.[1]) throw new Falla(`No entiendo la frecuencia «${celda}»: usa un número por semana.`)
  const n = Number(leida[1].replace(",", "."))
  return /cada/i.test(celda) ? n / 2 : n
}

function celdas(fila: string): string[] {
  return fila
    .trim()
    .replace(/^\|/, "")
    .replace(/\|$/, "")
    .split("|")
    .map((c) => c.trim())
}

function leerPilares(cuerpo: string): PilarDeLinea[] {
  const filas = cuerpo.split("\n").filter((l) => l.trim().startsWith("|"))
  // Header and separator first; a table without rows is the same as no table.
  const datos = filas.slice(2)
  if (datos.length === 0) throw new Falla("La línea no tiene tabla de pilares.")
  return datos.map((fila) => {
    const [pilar = "", deQueHabla = "", material = "", porSemana = ""] = celdas(fila)
    return { nombre: pilar.replace(/^\d+\.\s*/, ""), deQueHabla, material, porSemana: leerPorSemana(porSemana) }
  })
}

/** The markdown export of a brand's Claude Doc → the sections and pillars of its first version in the app. */
export function leerLinea(markdown: string): LineaImportada {
  const secciones: SeccionesDeLinea = {
    deQueHablamos: "",
    tono: "",
    formatos: "",
    temasVetados: "",
    temasAVigilar: "",
    ejemplos: "",
  }
  let pilares: PilarDeLinea[] | null = null
  const ignoradas: string[] = []
  // Only level-2 headings split sections; the title, byline and ### sub-headings stay where they are.
  const partes = markdown.replace(/\r\n/g, "\n").split(/^## (.+)$/m)
  for (let i = 1; i < partes.length; i += 2) {
    const titulo = (partes[i] ?? "").trim()
    const cuerpo = (partes[i + 1] ?? "").trim()
    const destino = SECCION_POR_TITULO.find(([inicio]) => sinAcentos(titulo).startsWith(inicio))?.[1]
    if (!destino) ignoradas.push(titulo)
    else if (destino === "pilares") pilares = leerPilares(cuerpo)
    else secciones[destino] = cuerpo
  }
  if (!pilares) throw new Falla("La línea no tiene tabla de pilares.")
  for (const [seccion, texto] of Object.entries(secciones) as [Seccion, string][]) {
    if ([...texto].length > LARGO_DE_SECCION[seccion]) {
      throw new Falla(`«${NOMBRE_DE_SECCION[seccion]}» pasa los ${LARGO_DE_SECCION[seccion]} caracteres.`)
    }
  }
  return { secciones, pilares, ignoradas }
}
