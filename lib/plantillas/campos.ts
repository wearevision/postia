import type { Lamina, TipoDeLamina } from "./laminas"

export type FormaDeCampo = "linea" | "parrafo" | "lista" | "tabla" | "barras"
export interface Campo {
  clave: string
  etiqueta: string
  forma: FormaDeCampo
  ayuda?: string
  /** Left out of the slide when the draft leaves it empty. */
  opcional?: true
}
export type Borrador = Record<string, string>

export const NOMBRE_DEL_TIPO: Record<TipoDeLamina, string> = {
  portada: "Portada",
  punto: "Idea",
  lista: "Lista",
  comparacion: "Comparación",
  cifra: "Cifra",
  barras: "Barras",
  frase: "Frase",
  cierre: "Cierre",
}

const FUENTE: Campo = {
  clave: "fuente",
  etiqueta: "Fuente (opcional)",
  forma: "linea",
  ayuda: "Medio y año, como «Field Methods, 2006».",
  opcional: true,
}

export const CAMPOS: Record<TipoDeLamina, readonly Campo[]> = {
  portada: [
    { clave: "titulo", etiqueta: "Título", forma: "parrafo", ayuda: "Hasta 12 palabras." },
    { clave: "bajada", etiqueta: "Bajada", forma: "parrafo", ayuda: "Hasta 30 palabras." },
  ],
  punto: [
    {
      clave: "numero",
      etiqueta: "Número (opcional)",
      forma: "linea",
      ayuda: "Solo si las láminas siguen pasos, como «01».",
    },
    { clave: "titulo", etiqueta: "Título", forma: "parrafo", ayuda: "Hasta 12 palabras." },
    { clave: "cuerpo", etiqueta: "Texto", forma: "parrafo", ayuda: "Hasta 32 palabras." },
    FUENTE,
  ],
  lista: [
    { clave: "titulo", etiqueta: "Título", forma: "parrafo" },
    {
      clave: "items",
      etiqueta: "Puntos",
      forma: "lista",
      ayuda: "Uno por línea, de 2 a 4, hasta 10 palabras cada uno.",
    },
    FUENTE,
  ],
  comparacion: [
    { clave: "titulo", etiqueta: "Título", forma: "parrafo" },
    { clave: "columnas", etiqueta: "Columnas", forma: "linea", ayuda: "Dos nombres separados por «|»." },
    { clave: "filas", etiqueta: "Filas", forma: "tabla", ayuda: "Una por línea: criterio | celda | celda. Hasta 4." },
    FUENTE,
  ],
  cifra: [
    { clave: "cifra", etiqueta: "Cifra", forma: "linea", ayuda: "Por ejemplo «42,5 %»." },
    { clave: "etiqueta", etiqueta: "Qué mide", forma: "linea" },
    { clave: "cuerpo", etiqueta: "Texto", forma: "parrafo", ayuda: "De dónde sale la cifra y qué significa." },
    FUENTE,
  ],
  barras: [
    { clave: "titulo", etiqueta: "Título", forma: "parrafo" },
    { clave: "barras", etiqueta: "Barras", forma: "barras", ayuda: "Una por línea: etiqueta | porcentaje. De 2 a 5." },
    FUENTE,
  ],
  frase: [
    { clave: "titulo", etiqueta: "Frase", forma: "parrafo", ayuda: "Hasta 16 palabras." },
    { clave: "nota", etiqueta: "Nota", forma: "parrafo" },
    FUENTE,
  ],
  cierre: [
    { clave: "titulo", etiqueta: "Título", forma: "linea" },
    { clave: "cuerpo", etiqueta: "Texto", forma: "parrafo" },
    { clave: "enlace", etiqueta: "Enlace", forma: "linea", ayuda: "Sin https://, como «wearevision.cl»." },
  ],
}

const lineas = (s = "") =>
  s
    .split("\n")
    .map((l) => l.trim())
    .filter(Boolean)
const celdas = (l: string) => l.split("|").map((c) => c.trim())

/** The draft as the schema's input. Validation stays with revisarCarrusel. */
export function deBorrador(tipo: TipoDeLamina, b: Borrador): unknown {
  const salida: Record<string, unknown> = { tipo }
  for (const campo of CAMPOS[tipo]) {
    const valor = b[campo.clave] ?? ""
    if (campo.opcional && !valor.trim()) continue
    if (campo.forma === "lista") salida[campo.clave] = lineas(valor)
    else if (campo.forma === "tabla") salida[campo.clave] = lineas(valor).map(celdas)
    else if (campo.forma === "barras")
      salida[campo.clave] = lineas(valor).map((l) => {
        const [etiqueta = "", valorDeBarra = ""] = celdas(l)
        return { etiqueta, valor: valorDeBarra }
      })
    else if (campo.clave === "columnas") salida[campo.clave] = celdas(valor)
    else salida[campo.clave] = valor
  }
  return salida
}

export function aBorrador(l: Lamina): Borrador {
  const b: Borrador = {}
  for (const campo of CAMPOS[l.tipo]) {
    const valor = (l as unknown as Record<string, unknown>)[campo.clave]
    if (campo.opcional && valor === undefined) continue
    if (campo.forma === "lista") b[campo.clave] = (valor as string[]).join("\n")
    else if (campo.forma === "tabla") b[campo.clave] = (valor as string[][]).map((f) => f.join(" | ")).join("\n")
    else if (campo.forma === "barras")
      b[campo.clave] = (valor as { etiqueta: string; valor: string }[])
        .map((x) => `${x.etiqueta} | ${x.valor}`)
        .join("\n")
    else if (campo.clave === "columnas") b[campo.clave] = (valor as string[]).join(" | ")
    else b[campo.clave] = String(valor ?? "")
  }
  return b
}
